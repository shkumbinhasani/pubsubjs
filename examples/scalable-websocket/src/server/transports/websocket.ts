import { Publisher, Subscriber, BaseTransport, generateMessageId } from "@pubsubjs/core";
import type {
  TransportCapabilities,
  TransportMessageHandler,
  TransportPublishOptions,
  UnsubscribeFn,
} from "@pubsubjs/core";
import type { ServerWebSocket, WebSocketHandler } from "bun";
import { ServerToClientEvents, ClientToServerEvents } from "../../shared/events";
import { config } from "../lib/config";

/**
 * Data attached to each WebSocket connection
 */
export interface WebSocketData {
  connectionId: string;
  subscriptions: Set<string>;
}

/**
 * Wire format for WebSocket messages
 */
interface WireMessage {
  type: "subscribe" | "unsubscribe" | "publish" | "message";
  channel: string;
  payload?: unknown;
  messageId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Custom WebSocket Server Transport that integrates with external Bun.serve()
 */
class CustomWebSocketServerTransport extends BaseTransport {
  readonly id = `ws-server-${config.serverId}`;
  readonly capabilities: TransportCapabilities = {
    canSubscribe: true,
    canPublish: true,
    bidirectional: true,
    supportsTargeting: true,
    supportsChannels: true,
  };

  private readonly connections = new Map<string, ServerWebSocket<WebSocketData>>();
  private readonly channelSubscriptions = new Map<string, Set<string>>(); // channel -> connectionIds
  private readonly channelHandlers = new Map<string, Set<TransportMessageHandler>>();

  /**
   * WebSocket handler for Bun.serve()
   */
  readonly websocketHandler: WebSocketHandler<WebSocketData> = {
    open: (ws) => {
      this.connections.set(ws.data.connectionId, ws);
      this.emit("connect", { connectionId: ws.data.connectionId });
    },

    message: (ws, rawMessage) => {
      this.handleClientMessage(ws, rawMessage);
    },

    close: (ws) => {
      this.handleClientDisconnect(ws);
    },
  };

  async connect(): Promise<void> {
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.channelSubscriptions.clear();
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
        ws?.send(data);
      }
    } else {
      // Broadcast to all connections subscribed to this channel
      const subscribers = this.channelSubscriptions.get(channel);
      if (subscribers) {
        for (const connectionId of subscribers) {
          const ws = this.connections.get(connectionId);
          ws?.send(data);
        }
      }
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

  /**
   * Get number of connected clients
   */
  get connectionCount(): number {
    return this.connections.size;
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
    // Call server-side handlers
    const handlers = this.channelHandlers.get(message.channel);
    if (handlers) {
      const transportMessage = {
        channel: message.channel,
        payload: message.payload,
        messageId: message.messageId ?? generateMessageId(),
        connectionId: ws.data.connectionId,
        metadata: {
          ...message.metadata,
          connectionId: ws.data.connectionId,
        },
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
}

/**
 * WebSocket transport for client-server communication
 */
export const wsTransport = new CustomWebSocketServerTransport();

/**
 * Publisher: Server -> Clients
 */
export const wsPublisher = new Publisher({
  events: ServerToClientEvents,
  transport: wsTransport,
});

/**
 * Subscriber: Clients -> Server
 */
export const wsSubscriber = new Subscriber({
  events: ClientToServerEvents,
  transport: wsTransport,
  contextFactory: (metadata) => ({
    messageId: metadata.messageId,
    timestamp: new Date(),
    connectionId: metadata.connectionId as string,
  }),
});
