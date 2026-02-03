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
 * Custom event for window-based transport
 */
interface WindowPubSubEvent extends CustomEvent {
  detail: {
    channel: string;
    payload: unknown;
    messageId: string;
    metadata?: Record<string, unknown>;
  };
}

const WINDOW_EVENT_TYPE = "__pubsub__";

/**
 * Window event-based transport for cross-component communication
 * Uses window.dispatchEvent/addEventListener for pub/sub
 * Works across different React trees in the same window
 */
export class WindowTransport extends BaseTransport {
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
  private windowListener: ((event: Event) => void) | null = null;

  constructor() {
    super();
    this.id = generateTransportId("window");
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    // Set up global window listener
    this.windowListener = (event: Event) => {
      const customEvent = event as WindowPubSubEvent;
      if (customEvent.detail) {
        this.handleWindowEvent(customEvent.detail);
      }
    };

    window.addEventListener(WINDOW_EVENT_TYPE, this.windowListener);
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    if (this.windowListener) {
      window.removeEventListener(WINDOW_EVENT_TYPE, this.windowListener);
      this.windowListener = null;
    }
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
    const event = new CustomEvent(WINDOW_EVENT_TYPE, {
      detail: {
        channel,
        payload,
        messageId: generateMessageId(),
        metadata: options?.metadata,
      },
    });

    window.dispatchEvent(event);
  }

  private handleWindowEvent(detail: WindowPubSubEvent["detail"]): void {
    const handlers = this.channelHandlers.get(detail.channel);
    if (!handlers) {
      return;
    }

    const message: TransportMessage = {
      channel: detail.channel,
      payload: detail.payload,
      messageId: detail.messageId,
      metadata: detail.metadata,
    };

    for (const handler of handlers) {
      try {
        handler(message);
      } catch (error) {
        console.error("Error in window transport handler:", error);
      }
    }
  }
}
