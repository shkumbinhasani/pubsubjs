import {
  BaseTransport,
  generateTransportId,
  type TransportCapabilities,
  type TransportMessageHandler,
  type TransportPublishOptions,
  type TransportMessage,
  type UnsubscribeFn,
  generateMessageId,
} from "@pubsubjs/core";

/**
 * Options for Redis transport
 */
export interface RedisTransportOptions {
  /** Redis connection URL */
  readonly url?: string;
  /** Channel prefix for all channels */
  readonly channelPrefix?: string;
}

/**
 * Wire format for messages over Redis
 */
interface RedisMessage {
  readonly payload: unknown;
  readonly messageId: string;
  readonly metadata?: Record<string, unknown>;
}

// Bun.redis returns a RedisClient instance
type RedisClient = InstanceType<typeof Bun.RedisClient>;
type RedisSubscriber = RedisClient;

/**
 * Redis transport using Bun.redis
 * Uses separate clients for pub and sub (Redis requirement)
 */
export class RedisTransport extends BaseTransport {
  readonly id: string;
  readonly capabilities: TransportCapabilities = {
    canSubscribe: true,
    canPublish: true,
    bidirectional: true,
    supportsTargeting: false, // Redis pub/sub doesn't support targeting
    supportsChannels: true,
  };

  private readonly url: string;
  private readonly channelPrefix: string;
  private pubClient: RedisClient | null = null;
  private subClient: RedisSubscriber | null = null;
  private readonly channelHandlers = new Map<
    string,
    Set<TransportMessageHandler>
  >();
  private readonly subscribedChannels = new Set<string>();

  constructor(options: RedisTransportOptions = {}) {
    super();
    this.id = generateTransportId("redis");
    this.url = options.url ?? "redis://localhost:6379";
    this.channelPrefix = options.channelPrefix ?? "";
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    this.setState("connecting");

    try {
      // Create pub client
      this.pubClient = new Bun.RedisClient(this.url);

      // Create sub client (needs separate connection for subscriptions)
      this.subClient = await this.pubClient.duplicate();

      this.setState("connected");
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // Unsubscribe from all channels
    for (const channel of this.subscribedChannels) {
      try {
        await this.subClient?.unsubscribe(channel);
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.subscribedChannels.clear();

    // Close clients
    if (this.subClient) {
      this.subClient.close();
      this.subClient = null;
    }
    if (this.pubClient) {
      this.pubClient.close();
      this.pubClient = null;
    }

    this.setState("disconnected");
  }

  protected async doSubscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    const fullChannel = this.getFullChannel(channel);

    let handlers = this.channelHandlers.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.channelHandlers.set(channel, handlers);

      // Subscribe to Redis channel if not already subscribed
      if (!this.subscribedChannels.has(fullChannel) && this.subClient) {
        await this.subClient.subscribe(fullChannel, (message: string) => {
          this.handleMessage(channel, message);
        });
        this.subscribedChannels.add(fullChannel);
      }
    }
    handlers.add(handler);

    return async () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        this.channelHandlers.delete(channel);

        // Unsubscribe from Redis channel
        if (this.subscribedChannels.has(fullChannel) && this.subClient) {
          await this.subClient.unsubscribe(fullChannel);
          this.subscribedChannels.delete(fullChannel);
        }
      }
    };
  }

  protected async doPublish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    if (!this.pubClient) {
      throw new Error("Redis client not connected");
    }

    const fullChannel = this.getFullChannel(channel);
    const message: RedisMessage = {
      payload,
      messageId: generateMessageId(),
      metadata: options?.metadata,
    };

    await this.pubClient.publish(fullChannel, JSON.stringify(message));
  }

  private handleMessage(channel: string, data: string): void {
    const handlers = this.channelHandlers.get(channel);
    if (!handlers) {
      return;
    }

    try {
      const message = JSON.parse(data) as RedisMessage;
      const transportMessage: TransportMessage = {
        channel,
        payload: message.payload,
        messageId: message.messageId,
        metadata: message.metadata,
      };

      for (const handler of handlers) {
        try {
          handler(transportMessage);
        } catch (error) {
          console.error("Error in Redis message handler:", error);
        }
      }
    } catch (error) {
      console.error("Failed to parse Redis message:", error);
    }
  }

  private getFullChannel(channel: string): string {
    return this.channelPrefix ? `${this.channelPrefix}:${channel}` : channel;
  }
}
