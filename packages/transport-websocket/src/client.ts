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
 * Options for WebSocket client transport
 */
export interface WebSocketClientOptions {
  /** WebSocket URL to connect to */
  readonly url: string;
  /** Protocols to use */
  readonly protocols?: string | string[];
  /** Auto-reconnect on disconnect */
  readonly autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  readonly maxReconnectAttempts?: number;
  /** Base delay between reconnection attempts (ms) */
  readonly reconnectBaseDelay?: number;
  /** Maximum delay between reconnection attempts (ms) */
  readonly reconnectMaxDelay?: number;
}

/**
 * Wire format for messages over WebSocket
 */
interface WireMessage {
  readonly type: "subscribe" | "unsubscribe" | "publish" | "message";
  readonly channel: string;
  readonly payload?: unknown;
  readonly messageId?: string;
  readonly targetIds?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * WebSocket client transport for bidirectional communication
 */
export class WebSocketClientTransport extends BaseTransport {
  readonly id: string;
  readonly capabilities: TransportCapabilities = {
    canSubscribe: true,
    canPublish: true,
    bidirectional: true,
    supportsTargeting: false, // Client can't target other clients
    supportsChannels: true,
  };

  private readonly url: string;
  private readonly protocols?: string | string[];
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelay: number;
  private readonly reconnectMaxDelay: number;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly channelHandlers = new Map<
    string,
    Set<TransportMessageHandler>
  >();
  private readonly pendingMessages: WireMessage[] = [];
  private isManuallyDisconnected = false;

  constructor(options: WebSocketClientOptions) {
    super();
    this.id = generateTransportId("ws-client");
    this.url = options.url;
    this.protocols = options.protocols;
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.reconnectBaseDelay = options.reconnectBaseDelay ?? 1000;
    this.reconnectMaxDelay = options.reconnectMaxDelay ?? 30000;
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
        this.ws = new WebSocket(this.url, this.protocols);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.setState("connected");

          // Re-subscribe to all channels
          for (const channel of this.channelHandlers.keys()) {
            this.sendMessage({ type: "subscribe", channel });
          }

          // Flush pending messages
          for (const msg of this.pendingMessages) {
            this.sendMessage(msg);
          }
          this.pendingMessages.length = 0;

          resolve();
        };

        this.ws.onclose = () => {
          this.ws = null;
          if (!this.isManuallyDisconnected) {
            this.handleDisconnect();
          } else {
            this.setState("disconnected");
          }
        };

        this.ws.onerror = (event) => {
          const error = new Error("WebSocket error");
          this.emit("error", error);
          if (this._state === "connecting") {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleRawMessage(event.data);
        };
      } catch (error) {
        this.setState("error");
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

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

      // Send subscribe message if connected
      if (this._state === "connected") {
        this.sendMessage({ type: "subscribe", channel });
      }
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        this.channelHandlers.delete(channel);
        if (this._state === "connected") {
          this.sendMessage({ type: "unsubscribe", channel });
        }
      }
    };
  }

  protected async doPublish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void> {
    const message: WireMessage = {
      type: "publish",
      channel,
      payload,
      messageId: generateMessageId(),
      targetIds: options?.targetIds,
      metadata: options?.metadata,
    };

    if (this._state === "connected") {
      this.sendMessage(message);
    } else {
      // Queue message for when we reconnect
      this.pendingMessages.push(message);
    }
  }

  private sendMessage(message: WireMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleRawMessage(data: string | ArrayBuffer | Blob): void {
    try {
      const text = typeof data === "string" ? data : data.toString();
      const message = JSON.parse(text) as WireMessage;

      if (message.type === "message" && message.channel) {
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
              console.error("Error in message handler:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  }

  private handleDisconnect(): void {
    if (
      !this.autoReconnect ||
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      this.setState("disconnected");
      return;
    }

    this.setState("reconnecting");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.reconnectMaxDelay
    );

    this.reconnectAttempts++;

    setTimeout(async () => {
      if (this.isManuallyDisconnected) {
        return;
      }

      try {
        await this.connect();
      } catch {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.setState("disconnected");
        }
      }
    }, delay);
  }
}
