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
 * In-memory transport for same React tree communication
 * Events are delivered synchronously to all subscribers
 */
export class MemoryTransport extends BaseTransport {
  readonly id: string;
  readonly capabilities: TransportCapabilities = {
    canSubscribe: true,
    canPublish: true,
    bidirectional: true,
    supportsTargeting: false,
    supportsChannels: true,
  };

  private readonly channelHandlers = new Map<
    string,
    Set<TransportMessageHandler>
  >();

  constructor() {
    super();
    this.id = generateTransportId("memory");
  }

  async connect(): Promise<void> {
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    this.channelHandlers.clear();
    this.setState("disconnected");
  }

  protected async doSubscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    let handlers = this.channelHandlers.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.channelHandlers.set(channel, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        this.channelHandlers.delete(channel);
      }
    };
  }

  protected async doPublish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    const handlers = this.channelHandlers.get(channel);
    if (!handlers) {
      return;
    }

    const message: TransportMessage = {
      channel,
      payload,
      messageId: generateMessageId(),
      metadata: options?.metadata,
    };

    // Deliver synchronously to all handlers
    for (const handler of handlers) {
      try {
        handler(message);
      } catch (error) {
        console.error("Error in memory transport handler:", error);
      }
    }
  }
}
