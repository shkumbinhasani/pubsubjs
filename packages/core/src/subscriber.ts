import type { Transport, TransportMessage } from "./transport/interface";
import type { FilterPolicy, TypedFilterPolicy } from "./types/filter";
import type {
  EventRegistry,
  EventNames,
  EventPayload,
  EventAttributesType,
} from "./types/schema";
import type { BaseContext, ContextFactory, TransportMetadata } from "./types/context";
import type {
  EventHandler,
  HandlerMap,
  PublisherInterface,
  UnsubscribeFn,
  SubscribeMiddleware,
} from "./types/handler";
import { validatePayload } from "./types/schema";
import { defaultContextFactory, generateMessageId } from "./types/context";
import { ConnectionManager, type ConnectionManagerOptions } from "./connection/manager";
import { UnknownEventError } from "./errors";

/**
 * Error handler for subscriber errors
 */
export type SubscriberErrorHandler = (
  error: Error,
  eventName: string,
  payload: unknown
) => void;

/**
 * Options for subscribing to an event
 * @template TAttributes - Type of attributes (inferred from event's attributesSchema)
 */
export interface SubscribeOptions<TAttributes = unknown> {
  /** Filter policy for this subscription (type-safe when event has attributesSchema) */
  readonly filter?: TAttributes extends Record<string, unknown>
    ? TypedFilterPolicy<TAttributes>
    : FilterPolicy;
}

/**
 * Options for creating a Subscriber
 */
export interface SubscriberOptions<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
  TPublisher extends PublisherInterface<EventRegistry> | undefined = undefined,
> extends ConnectionManagerOptions {
  /** Event definitions */
  readonly events: TEvents;
  /** Transport to use */
  readonly transport: Transport;
  /** Context factory */
  readonly contextFactory?: ContextFactory<TContext>;
  /** Publisher for reply patterns */
  readonly publisher?: TPublisher;
  /** Error handler */
  readonly onError?: SubscriberErrorHandler;
  /** Custom channel strategy (event name → channel) */
  readonly channelStrategy?: (eventName: string) => string;
  /** Skip validation (for performance in trusted environments) */
  readonly skipValidation?: boolean;
  /** Middleware functions for processing incoming events */
  readonly middleware?: readonly SubscribeMiddleware<TEvents, TContext>[];
}

/**
 * Subscriber class for subscribing to type-safe events
 */
export class Subscriber<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
  TPublisher extends PublisherInterface<EventRegistry> | undefined = undefined,
> {
  private readonly events: TEvents;
  private readonly transport: Transport;
  private readonly connectionManager: ConnectionManager;
  private readonly contextFactory: ContextFactory<TContext>;
  private readonly publisher: TPublisher;
  private readonly onError?: SubscriberErrorHandler;
  private readonly channelStrategy: (eventName: string) => string;
  private readonly skipValidation: boolean;
  private readonly middleware: readonly SubscribeMiddleware<TEvents, TContext>[];
  private readonly handlers = new Map<
    string,
    { handler: EventHandler<unknown, TContext, TPublisher>; filter?: FilterPolicy }
  >();
  private readonly subscriptions = new Map<string, UnsubscribeFn>();
  private isSubscribed = false;

  constructor(options: SubscriberOptions<TEvents, TContext, TPublisher>) {
    this.events = options.events;
    this.transport = options.transport;
    this.connectionManager = new ConnectionManager(options.transport, options);
    this.contextFactory =
      (options.contextFactory as ContextFactory<TContext>) ??
      (defaultContextFactory as unknown as ContextFactory<TContext>);
    this.publisher = options.publisher as TPublisher;
    this.onError = options.onError;
    this.channelStrategy = options.channelStrategy ?? defaultChannelStrategy;
    this.skipValidation = options.skipValidation ?? false;
    this.middleware = options.middleware ?? [];
  }

  /**
   * Register a handler for an event
   */
  on<TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    handler: EventHandler<
      EventPayload<TEvents, TEventName>,
      TContext,
      TPublisher
    >,
    options?: SubscribeOptions<EventAttributesType<TEvents, TEventName>>
  ): this {
    this.handlers.set(eventName, {
      handler: handler as EventHandler<unknown, TContext, TPublisher>,
      filter: options?.filter as FilterPolicy | undefined,
    });
    return this;
  }

  /**
   * Remove a handler for an event
   */
  off<TEventName extends EventNames<TEvents>>(eventName: TEventName): this {
    this.handlers.delete(eventName);
    return this;
  }

  /**
   * Register multiple handlers at once
   */
  onMany(handlers: HandlerMap<TEvents, TContext, TPublisher>): this {
    for (const [eventName, handler] of Object.entries(handlers)) {
      if (handler) {
        this.handlers.set(eventName, {
          handler: handler as EventHandler<unknown, TContext, TPublisher>,
        });
      }
    }
    return this;
  }

  /**
   * Start subscribing to events
   * Will connect and subscribe to all registered handlers
   */
  async subscribe(): Promise<void> {
    if (this.isSubscribed) {
      return;
    }

    await this.connectionManager.ensureConnected();

    // Subscribe to all registered events
    for (const eventName of this.handlers.keys()) {
      await this.subscribeToEvent(eventName);
    }

    this.isSubscribed = true;
  }

  private async subscribeToEvent(eventName: string): Promise<void> {
    const eventDef = this.events[eventName];
    if (!eventDef) {
      throw new UnknownEventError(eventName);
    }

    const entry = this.handlers.get(eventName);
    const channel = eventDef.options?.channel ?? this.channelStrategy(eventName);

    const unsubscribe = await this.transport.subscribe(
      channel,
      (message) => this.handleMessage(eventName, message),
      { filter: entry?.filter }
    );

    this.subscriptions.set(eventName, unsubscribe);
  }

  private async handleMessage(
    eventName: string,
    message: TransportMessage
  ): Promise<void> {
    const entry = this.handlers.get(eventName);
    if (!entry) {
      return;
    }

    const eventDef = this.events[eventName];
    if (!eventDef) {
      return;
    }

    try {
      // Validate payload
      let payload = message.payload;
      if (!this.skipValidation) {
        payload = await validatePayload(eventDef.schema, message.payload);
      }

      // Create context
      const metadata: TransportMetadata = {
        messageId: message.messageId ?? generateMessageId(),
        channel: message.channel,
        connectionId: message.connectionId,
        ...message.metadata,
      };
      const ctx = await this.contextFactory(metadata);

      // Execute handler through middleware chain
      const executeHandler = async () => {
        await entry.handler(payload, { ctx, publisher: this.publisher });
      };

      if (this.middleware.length === 0) {
        await executeHandler();
      } else {
        await this.executeMiddleware(
          0,
          eventName as EventNames<TEvents>,
          payload,
          ctx,
          executeHandler
        );
      }
    } catch (error) {
      if (this.onError) {
        this.onError(
          error instanceof Error ? error : new Error(String(error)),
          eventName,
          message.payload
        );
      } else {
        console.error(`[PubSub] Error handling ${eventName}:`, error);
      }
    }
  }

  private async executeMiddleware(
    index: number,
    eventName: EventNames<TEvents>,
    payload: unknown,
    context: TContext,
    final: () => Promise<void>
  ): Promise<void> {
    const mw = this.middleware[index];
    if (!mw) {
      return final();
    }
    return mw(eventName, payload, context, () =>
      this.executeMiddleware(index + 1, eventName, payload, context, final)
    );
  }

  /**
   * Unsubscribe from all events and disconnect
   */
  async unsubscribe(): Promise<void> {
    if (!this.isSubscribed) {
      return;
    }

    for (const unsubscribe of this.subscriptions.values()) {
      await unsubscribe();
    }
    this.subscriptions.clear();

    await this.connectionManager.disconnect();
    this.isSubscribed = false;
  }

  /**
   * Get the current connection state
   */
  get state() {
    return this.connectionManager.state;
  }

  /**
   * Check if connected
   */
  get isConnected() {
    return this.connectionManager.isConnected;
  }
}

/**
 * Default channel strategy: use event name as channel
 */
function defaultChannelStrategy(eventName: string): string {
  return eventName;
}

/**
 * Create a logging middleware for subscribers
 */
export function createSubscriberLoggingMiddleware<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
>(): SubscribeMiddleware<TEvents, TContext> {
  return async (eventName, payload, context, next) => {
    const start = Date.now();
    console.log(`[PubSub] Received ${eventName}`, { payload, messageId: context.messageId });
    try {
      await next();
      console.log(`[PubSub] Handled ${eventName} in ${Date.now() - start}ms`);
    } catch (error) {
      console.error(`[PubSub] Failed to handle ${eventName}:`, error);
      throw error;
    }
  };
}

/**
 * Create a timing middleware that reports handler duration
 */
export function createSubscriberTimingMiddleware<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
>(
  onTiming: (eventName: string, durationMs: number) => void
): SubscribeMiddleware<TEvents, TContext> {
  return async (eventName, _payload, _context, next) => {
    const start = Date.now();
    try {
      await next();
    } finally {
      onTiming(eventName, Date.now() - start);
    }
  };
}

/**
 * Options for idempotency middleware
 */
export interface IdempotencyOptions {
  /** Check if a message has already been processed */
  hasProcessed: (messageId: string) => boolean | Promise<boolean>;
  /** Mark a message as processed */
  markProcessed: (messageId: string) => void | Promise<void>;
}

/**
 * Create an idempotency middleware that skips duplicate messages
 */
export function createIdempotencyMiddleware<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
>(options: IdempotencyOptions): SubscribeMiddleware<TEvents, TContext> {
  return async (_eventName, _payload, context, next) => {
    const messageId = context.messageId;
    if (await options.hasProcessed(messageId)) {
      return;
    }
    await next();
    await options.markProcessed(messageId);
  };
}

/**
 * Options for rate limit middleware
 */
export interface RateLimitOptions {
  /** Maximum events allowed in the window */
  maxEvents: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Called when rate limit is exceeded */
  onLimit?: (eventName: string, payload: unknown) => void;
}

/**
 * Create a rate limiting middleware
 */
export function createRateLimitMiddleware<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
>(options: RateLimitOptions): SubscribeMiddleware<TEvents, TContext> {
  const timestamps: number[] = [];

  return async (eventName, payload, _context, next) => {
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Remove expired timestamps
    while (timestamps.length > 0 && timestamps[0]! < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= options.maxEvents) {
      options.onLimit?.(eventName, payload);
      return;
    }

    timestamps.push(now);
    await next();
  };
}
