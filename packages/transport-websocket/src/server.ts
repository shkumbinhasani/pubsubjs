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
import type { ServerWebSocket } from "bun";

/**
 * Data attached to each WebSocket connection
 */
export interface WebSocketData {
  /** Unique connection ID */
  connectionId: string;
  /** Channels this connection is subscribed to */
  subscriptions: Set<string>;
  /** Custom data attached during upgrade */
  [key: string]: unknown;
}

/**
 * Options for WebSocket server transport
 */
export interface WebSocketServerOptions {
  /** Port to listen on (if creating a new server) */
  readonly port?: number;
  /** Hostname to bind to */
  readonly hostname?: string;
  /** Maximum payload size in bytes */
  readonly maxPayloadLength?: number;
  /** Idle timeout in seconds */
  readonly idleTimeout?: number;
  /** Custom upgrade handler to extract user data */
  readonly onUpgrade?: (
    req: Request
  ) => WebSocketData | Promise<WebSocketData>;
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
 * WebSocket server transport using Bun.serve
 */
export class WebSocketServerTransport extends BaseTransport {
  readonly id: string;
  readonly capabilities: TransportCapabilities = {
    canSubscribe: true,
    canPublish: true,
    bidirectional: true,
    supportsTargeting: true,
    supportsChannels: true,
  };

  private readonly options: WebSocketServerOptions;
  private server: ReturnType<typeof Bun.serve<WebSocketData>> | null = null;
  private readonly connections = new Map<
    string,
    ServerWebSocket<WebSocketData>
  >();
  private readonly channelSubscriptions = new Map<string, Set<string>>(); // channel -> connectionIds
  private readonly channelHandlers = new Map<
    string,
    Set<TransportMessageHandler>
  >();

  constructor(options: WebSocketServerOptions = {}) {
    super();
    this.id = generateTransportId("ws-server");
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    this.setState("connecting");

    try {
      this.server = Bun.serve<WebSocketData>({
        port: this.options.port ?? 0,
        hostname: this.options.hostname,
        fetch: async (req, server) => {
          // Handle WebSocket upgrade
          const url = new URL(req.url);
          if (url.pathname === "/ws" || req.headers.get("upgrade") === "websocket") {
            let data: WebSocketData = {
              connectionId: generateMessageId(),
              subscriptions: new Set(),
            };

            if (this.options.onUpgrade) {
              data = {
                ...data,
                ...(await this.options.onUpgrade(req)),
              };
            }

            const success = server.upgrade(req, { data });
            if (success) {
              return undefined as unknown as Response;
            }
            return new Response("WebSocket upgrade failed", { status: 400 });
          }

          return new Response("Not found", { status: 404 });
        },
        websocket: {
          maxPayloadLength: this.options.maxPayloadLength ?? 16 * 1024 * 1024,
          idleTimeout: this.options.idleTimeout ?? 120,

          open: (ws: ServerWebSocket<WebSocketData>) => {
            this.connections.set(ws.data.connectionId, ws);
            this.emit("connect", { connectionId: ws.data.connectionId });
          },

          message: (ws: ServerWebSocket<WebSocketData>, message) => {
            this.handleClientMessage(ws, message);
          },

          close: (ws: ServerWebSocket<WebSocketData>) => {
            this.handleClientDisconnect(ws);
          },
        },
      });

      this.setState("connected");
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      // Close all connections
      for (const ws of this.connections.values()) {
        ws.close();
      }
      this.connections.clear();
      this.channelSubscriptions.clear();

      this.server.stop();
      this.server = null;
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
    const message: WireMessage = {
      type: "message",
      channel,
      payload,
      messageId: generateMessageId(),
      metadata: options?.metadata,
    };
    const data = JSON.stringify(message);

    if (options?.targetIds && options.targetIds.length > 0) {
      // Send to specific connections
      for (const targetId of options.targetIds) {
        const ws = this.connections.get(targetId);
        if (ws) {
          ws.send(data);
        }
      }
    } else {
      // Send to all connections subscribed to this channel
      const subscribers = this.channelSubscriptions.get(channel);
      if (subscribers) {
        for (const connectionId of subscribers) {
          const ws = this.connections.get(connectionId);
          if (ws) {
            ws.send(data);
          }
        }
      }
    }
  }

  private handleClientMessage(
    ws: ServerWebSocket<WebSocketData>,
    rawMessage: string | ArrayBuffer | Uint8Array
  ): void {
    try {
      const text =
        typeof rawMessage === "string"
          ? rawMessage
          : new TextDecoder().decode(rawMessage);
      const message = JSON.parse(text) as WireMessage;

      switch (message.type) {
        case "subscribe":
          this.handleClientSubscribe(ws, message.channel);
          break;

        case "unsubscribe":
          this.handleClientUnsubscribe(ws, message.channel);
          break;

        case "publish":
          this.handleClientPublish(ws, message);
          break;
      }
    } catch (error) {
      console.error("Failed to parse client message:", error);
    }
  }

  private handleClientSubscribe(
    ws: ServerWebSocket<WebSocketData>,
    channel: string
  ): void {
    ws.data.subscriptions.add(channel);

    let subscribers = this.channelSubscriptions.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      this.channelSubscriptions.set(channel, subscribers);
    }
    subscribers.add(ws.data.connectionId);
  }

  private handleClientUnsubscribe(
    ws: ServerWebSocket<WebSocketData>,
    channel: string
  ): void {
    ws.data.subscriptions.delete(channel);

    const subscribers = this.channelSubscriptions.get(channel);
    if (subscribers) {
      subscribers.delete(ws.data.connectionId);
      if (subscribers.size === 0) {
        this.channelSubscriptions.delete(channel);
      }
    }
  }

  private handleClientPublish(
    ws: ServerWebSocket<WebSocketData>,
    message: WireMessage
  ): void {
    // Create transport message
    const transportMessage: TransportMessage = {
      channel: message.channel,
      payload: message.payload,
      messageId: message.messageId ?? generateMessageId(),
      connectionId: ws.data.connectionId,
      metadata: {
        ...message.metadata,
        ...ws.data,
      },
    };

    // Call server-side handlers
    const handlers = this.channelHandlers.get(message.channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(transportMessage);
        } catch (error) {
          console.error("Error in message handler:", error);
        }
      }
    }

    // Broadcast to other subscribed clients (excluding sender)
    this.broadcastToChannel(message.channel, message, ws.data.connectionId);
  }

  private broadcastToChannel(
    channel: string,
    message: WireMessage,
    excludeConnectionId?: string
  ): void {
    const subscribers = this.channelSubscriptions.get(channel);
    if (!subscribers) {
      return;
    }

    const wireMessage: WireMessage = {
      type: "message",
      channel,
      payload: message.payload,
      messageId: message.messageId,
      metadata: message.metadata,
    };
    const data = JSON.stringify(wireMessage);

    for (const connectionId of subscribers) {
      if (connectionId !== excludeConnectionId) {
        const ws = this.connections.get(connectionId);
        if (ws) {
          ws.send(data);
        }
      }
    }
  }

  private handleClientDisconnect(ws: ServerWebSocket<WebSocketData>): void {
    const connectionId = ws.data.connectionId;

    // Remove from all channels
    for (const channel of ws.data.subscriptions) {
      const subscribers = this.channelSubscriptions.get(channel);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.channelSubscriptions.delete(channel);
        }
      }
    }

    this.connections.delete(connectionId);
    this.emit("disconnect", { connectionId });
  }

  /**
   * Get the server's port (useful when port is 0 for auto-assignment)
   */
  get port(): number | undefined {
    return this.server?.port;
  }

  /**
   * Get number of connected clients
   */
  get connectionCount(): number {
    return this.connections.size;
  }

  /**
   * Send a message to a specific connection
   */
  sendTo(connectionId: string, channel: string, payload: unknown): void {
    const ws = this.connections.get(connectionId);
    if (ws) {
      const message: WireMessage = {
        type: "message",
        channel,
        payload,
        messageId: generateMessageId(),
      };
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(channel: string, payload: unknown): void {
    const message: WireMessage = {
      type: "message",
      channel,
      payload,
      messageId: generateMessageId(),
    };
    const data = JSON.stringify(message);

    for (const ws of this.connections.values()) {
      ws.send(data);
    }
  }
}
