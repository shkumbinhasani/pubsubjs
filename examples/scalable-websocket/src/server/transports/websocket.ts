import { Publisher, Subscriber } from "@pubsubjs/core";
import {
  WebSocketServerTransport,
  type WebSocketData,
} from "@pubsubjs/transport-websocket";
import { ServerToClientEvents, ClientToServerEvents } from "../../shared/events";

// Re-export WebSocketData for use in other files
export type { WebSocketData };

/**
 * WebSocket transport for client-server communication
 *
 * Using composable mode (no port) to integrate with external Bun.serve()
 */
export const wsTransport = new WebSocketServerTransport();

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
