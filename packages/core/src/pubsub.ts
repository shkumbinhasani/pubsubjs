import type { Transport } from "./transport/interface";
import type {
  EventRegistry,
  EventNames,
  EventPayload,
  EventAttributesType,
} from "./types/schema";
import type { BaseContext, ContextFactory } from "./types/context";
import type {
  EventHandler,
  HandlerMap,
  PublisherInterface,
  PublishOptions,
} from "./types/handler";
import { Publisher, type PublishMiddleware } from "./publisher";
import { Subscriber, type SubscriberErrorHandler } from "./subscriber";
import type { ConnectionManagerOptions } from "./connection/manager";

/**
 * Options for creating a PubSub instance
 */
export interface PubSubOptions<
  TPublishEvents extends EventRegistry,
  TSubscribeEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
> extends ConnectionManagerOptions {
  /** Events that can be published */
  readonly publishEvents: TPublishEvents;
  /** Events that can be subscribed to */
  readonly subscribeEvents: TSubscribeEvents;
  /** Transport to use (bidirectional) */
  readonly transport: Transport;
  /** Context factory for handlers */
  readonly contextFactory?: ContextFactory<TContext>;
  /** Publisher middleware */
  readonly publishMiddleware?: readonly PublishMiddleware<TPublishEvents>[];
  /** Error handler for subscription errors */
  readonly onError?: SubscriberErrorHandler;
  /** Custom channel strategy */
  readonly channelStrategy?: (eventName: string) => string;
  /** Skip validation */
  readonly skipValidation?: boolean;
}

/**
 * Combined PubSub class for bidirectional communication
 * Allows publishing one set of events and subscribing to another
 */
export class PubSub<
  TPublishEvents extends EventRegistry,
  TSubscribeEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
> {
  private readonly publisher: Publisher<TPublishEvents>;
  private readonly subscriber: Subscriber<
    TSubscribeEvents,
    TContext,
    PublisherInterface<TPublishEvents>
  >;
  private readonly transport: Transport;
  private isStarted = false;

  constructor(
    options: PubSubOptions<TPublishEvents, TSubscribeEvents, TContext>
  ) {
    this.transport = options.transport;

    // Create publisher
    this.publisher = new Publisher({
      events: options.publishEvents,
      transport: options.transport,
      middleware: options.publishMiddleware,
      channelStrategy: options.channelStrategy,
      skipValidation: options.skipValidation,
      lazyConnect: options.lazyConnect,
      maxReconnectAttempts: options.maxReconnectAttempts,
      reconnectBaseDelay: options.reconnectBaseDelay,
      reconnectMaxDelay: options.reconnectMaxDelay,
    });

    // Create subscriber with publisher reference for reply patterns
    this.subscriber = new Subscriber({
      events: options.subscribeEvents,
      transport: options.transport,
      contextFactory: options.contextFactory,
      publisher: this.publisher as PublisherInterface<TPublishEvents>,
      onError: options.onError,
      channelStrategy: options.channelStrategy,
      skipValidation: options.skipValidation,
      lazyConnect: options.lazyConnect,
      maxReconnectAttempts: options.maxReconnectAttempts,
      reconnectBaseDelay: options.reconnectBaseDelay,
      reconnectMaxDelay: options.reconnectMaxDelay,
    });
  }

  /**
   * Register a handler for an event
   */
  on<TEventName extends EventNames<TSubscribeEvents>>(
    eventName: TEventName,
    handler: EventHandler<
      EventPayload<TSubscribeEvents, TEventName>,
      TContext,
      PublisherInterface<TPublishEvents>
    >
  ): this {
    this.subscriber.on(eventName, handler);
    return this;
  }

  /**
   * Remove a handler for an event
   */
  off<TEventName extends EventNames<TSubscribeEvents>>(
    eventName: TEventName
  ): this {
    this.subscriber.off(eventName);
    return this;
  }

  /**
   * Register multiple handlers at once
   */
  onMany(
    handlers: HandlerMap<
      TSubscribeEvents,
      TContext,
      PublisherInterface<TPublishEvents>
    >
  ): this {
    this.subscriber.onMany(handlers);
    return this;
  }

  /**
   * Publish an event
   */
  async publish<TEventName extends EventNames<TPublishEvents>>(
    eventName: TEventName,
    payload: EventPayload<TPublishEvents, TEventName>,
    options?: PublishOptions<EventAttributesType<TPublishEvents, TEventName>>
  ): Promise<void> {
    return this.publisher.publish(eventName, payload, options);
  }

  /**
   * Start the PubSub - connect and begin subscribing
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    await this.subscriber.subscribe();
    this.isStarted = true;
  }

  /**
   * Stop the PubSub - unsubscribe and disconnect
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    await this.subscriber.unsubscribe();
    await this.publisher.disconnect();
    this.isStarted = false;
  }

  /**
   * Get the current connection state
   */
  get state() {
    return this.transport.state;
  }

  /**
   * Check if connected
   */
  get isConnected() {
    return this.transport.state === "connected";
  }

  /**
   * Get the underlying publisher
   */
  getPublisher(): PublisherInterface<TPublishEvents> {
    return this.publisher;
  }
}
