import {
  BaseTransport,
  generateTransportId,
  type TransportCapabilities,
  type TransportMessageHandler,
  type TransportPublishOptions,
  type TransportMessage,
  type UnsubscribeFn,
  generateMessageId,
  TransportCapabilityError,
} from "@pubsubjs/core";

/**
 * Options for SSE client transport
 */
export interface SSEClientOptions {
  /** SSE endpoint URL */
  readonly url: string;
  /** Whether to include credentials */
  readonly withCredentials?: boolean;
  /** Auto-reconnect on disconnect */
  readonly autoReconnect?: boolean;
  /** Custom headers via URL params (SSE doesn't support custom headers) */
  readonly queryParams?: Record<string, string>;
}

/**
 * SSE message format
 */
interface SSEMessage {
  readonly channel: string;
  readonly payload: unknown;
  readonly messageId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * SSE client transport - subscribe-only, cannot publish
 */
export class SSEClientTransport extends BaseTransport {
  readonly id: string;
  readonly capabilities: TransportCapabilities = {
    canSubscribe: true,
    canPublish: false, // SSE is unidirectional
    bidirectional: false,
    supportsTargeting: false,
    supportsChannels: true,
  };

  private readonly url: string;
  private readonly withCredentials: boolean;
  private readonly autoReconnect: boolean;
  private readonly queryParams: Record<string, string>;
  private eventSource: EventSource | null = null;
  private readonly channelHandlers = new Map<
    string,
    Set<TransportMessageHandler>
  >();
  private isManuallyDisconnected = false;

  constructor(options: SSEClientOptions) {
    super();
    this.id = generateTransportId("sse-client");
    this.url = options.url;
    this.withCredentials = options.withCredentials ?? false;
    this.autoReconnect = options.autoReconnect ?? true;
    this.queryParams = options.queryParams ?? {};
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    if (this._state === "connecting") {
      return new Promise((resolve, reject) => {
        const onConnect = () => {
          this.off("connect", onConnect);
          this.off("error", onError);
          resolve();
        };
        const onError = (error?: unknown) => {
          this.off("connect", onConnect);
          this.off("error", onError);
          reject(error);
        };
        this.on("connect", onConnect);
        this.on("error", onError);
      });
    }

    this.setState("connecting");
    this.isManuallyDisconnected = false;

    return new Promise((resolve, reject) => {
      try {
        // Build URL with query params
        const url = new URL(this.url);
        for (const [key, value] of Object.entries(this.queryParams)) {
          url.searchParams.set(key, value);
        }

        // Add subscribed channels to URL
        const channels = Array.from(this.channelHandlers.keys());
        if (channels.length > 0) {
          url.searchParams.set("channels", channels.join(","));
        }

        this.eventSource = new EventSource(url.toString(), {
          withCredentials: this.withCredentials,
        });

        this.eventSource.onopen = () => {
          this.setState("connected");
          resolve();
        };

        this.eventSource.onerror = () => {
          if (this._state === "connecting") {
            const error = new Error("SSE connection failed");
            this.emit("error", error);
            reject(error);
          } else if (!this.isManuallyDisconnected) {
            // EventSource auto-reconnects, but we emit an event
            this.emit("reconnecting");
          }
        };

        // Listen for messages on the "message" event type
        this.eventSource.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        // Also listen for custom event types (channels)
        for (const channel of this.channelHandlers.keys()) {
          this.eventSource.addEventListener(channel, (event) => {
            this.handleChannelMessage(channel, (event as MessageEvent).data);
          });
        }
      } catch (error) {
        this.setState("error");
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setState("disconnected");
  }

  protected async doSubscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    let handlers = this.channelHandlers.get(channel);
    const isNewChannel = !handlers;

    if (!handlers) {
      handlers = new Set();
      this.channelHandlers.set(channel, handlers);
    }
    handlers.add(handler);

    // If already connected and this is a new channel, reconnect to update subscription
    if (isNewChannel && this.eventSource) {
      this.eventSource.addEventListener(channel, (event) => {
        this.handleChannelMessage(channel, (event as MessageEvent).data);
      });
    }

    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        this.channelHandlers.delete(channel);
      }
    };
  }

  protected async doPublish(
    _channel: string,
    _payload: unknown,
    _options?: TransportPublishOptions
  ): Promise<void> {
    // This should never be called due to capability check in base class
    throw new TransportCapabilityError(this.id, "publish");
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as SSEMessage;
      const handlers = this.channelHandlers.get(message.channel);

      if (handlers) {
        const transportMessage: TransportMessage = {
          channel: message.channel,
          payload: message.payload,
          messageId: message.messageId ?? generateMessageId(),
          metadata: message.metadata,
        };

        for (const handler of handlers) {
          try {
            handler(transportMessage);
          } catch (error) {
            console.error("Error in SSE message handler:", error);
          }
        }
      }
    } catch (error) {
      console.error("Failed to parse SSE message:", error);
    }
  }

  private handleChannelMessage(channel: string, data: string): void {
    const handlers = this.channelHandlers.get(channel);
    if (!handlers) {
      return;
    }

    try {
      const payload = JSON.parse(data);
      const transportMessage: TransportMessage = {
        channel,
        payload,
        messageId: generateMessageId(),
      };

      for (const handler of handlers) {
        try {
          handler(transportMessage);
        } catch (error) {
          console.error("Error in SSE message handler:", error);
        }
      }
    } catch {
      // If not JSON, treat as plain text
      const transportMessage: TransportMessage = {
        channel,
        payload: data,
        messageId: generateMessageId(),
      };

      for (const handler of handlers) {
        try {
          handler(transportMessage);
        } catch (error) {
          console.error("Error in SSE message handler:", error);
        }
      }
    }
  }
}
