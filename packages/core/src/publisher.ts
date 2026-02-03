import type { Transport } from "./transport/interface";
import type {
  EventRegistry,
  EventNames,
  EventPayload,
} from "./types/schema";
import type { PublisherInterface, PublishOptions } from "./types/handler";
import { validatePayload } from "./types/schema";
import { ConnectionManager, type ConnectionManagerOptions } from "./connection/manager";
import { UnknownEventError } from "./errors";

/**
 * Middleware function for publish operations
 */
export type PublishMiddleware<TEvents extends EventRegistry> = (
  eventName: EventNames<TEvents>,
  payload: unknown,
  options: PublishOptions | undefined,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Options for creating a Publisher
 */
export interface PublisherOptions<TEvents extends EventRegistry>
  extends ConnectionManagerOptions {
  /** Event definitions */
  readonly events: TEvents;
  /** Transport to use */
  readonly transport: Transport;
  /** Middleware functions */
  readonly middleware?: readonly PublishMiddleware<TEvents>[];
  /** Custom channel strategy (event name → channel) */
  readonly channelStrategy?: (eventName: string) => string;
  /** Skip validation (for performance in trusted environments) */
  readonly skipValidation?: boolean;
}

/**
 * Publisher class for publishing type-safe events
 */
export class Publisher<TEvents extends EventRegistry>
  implements PublisherInterface<TEvents>
{
  private readonly events: TEvents;
  private readonly transport: Transport;
  private readonly connectionManager: ConnectionManager;
  private readonly middleware: readonly PublishMiddleware<TEvents>[];
  private readonly channelStrategy: (eventName: string) => string;
  private readonly skipValidation: boolean;

  constructor(options: PublisherOptions<TEvents>) {
    this.events = options.events;
    this.transport = options.transport;
    this.connectionManager = new ConnectionManager(options.transport, options);
    this.middleware = options.middleware ?? [];
    this.channelStrategy = options.channelStrategy ?? defaultChannelStrategy;
    this.skipValidation = options.skipValidation ?? false;
  }

  /**
   * Publish an event with type-safe payload
   */
  async publish<TEventName extends EventNames<TEvents>>(
    eventName: TEventName,
    payload: EventPayload<TEvents, TEventName>,
    options?: PublishOptions
  ): Promise<void> {
    const eventDef = this.events[eventName];
    if (!eventDef) {
      throw new UnknownEventError(eventName);
    }

    // Validate payload
    let validatedPayload: unknown = payload;
    if (!this.skipValidation) {
      validatedPayload = await validatePayload(eventDef.schema, payload);
    }

    // Execute middleware chain
    const executePublish = async () => {
      await this.connectionManager.ensureConnected();

      const channel =
        options?.channel ??
        eventDef.options?.channel ??
        this.channelStrategy(eventName);

      await this.transport.publish(channel, validatedPayload, {
        targetIds: options?.targetIds,
        metadata: {
          eventName,
          ...options?.metadata,
        },
      });
    };

    if (this.middleware.length === 0) {
      await executePublish();
    } else {
      await this.executeMiddleware(
        0,
        eventName,
        validatedPayload,
        options,
        executePublish
      );
    }
  }

  private async executeMiddleware(
    index: number,
    eventName: EventNames<TEvents>,
    payload: unknown,
    options: PublishOptions | undefined,
    final: () => Promise<void>
  ): Promise<void> {
    const mw = this.middleware[index];
    if (!mw) {
      return final();
    }

    return mw(eventName, payload, options, () =>
      this.executeMiddleware(index + 1, eventName, payload, options, final)
    );
  }

  /**
   * Connect the publisher
   */
  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  /**
   * Disconnect the publisher
   */
  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
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
 * Create a logging middleware
 */
export function createLoggingMiddleware<
  TEvents extends EventRegistry,
>(): PublishMiddleware<TEvents> {
  return async (eventName, payload, options, next) => {
    const start = Date.now();
    console.log(`[PubSub] Publishing ${eventName}`, { payload, options });
    try {
      await next();
      console.log(`[PubSub] Published ${eventName} in ${Date.now() - start}ms`);
    } catch (error) {
      console.error(`[PubSub] Failed to publish ${eventName}:`, error);
      throw error;
    }
  };
}
