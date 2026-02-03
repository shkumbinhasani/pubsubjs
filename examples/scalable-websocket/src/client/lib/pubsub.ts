import { Publisher, Subscriber } from "@pubsubjs/core";
import { WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { ServerToClientEvents, ClientToServerEvents } from "../../shared/events";

const WS_URL = `ws://${window.location.host}/ws`;

export const transport = new WebSocketClientTransport({ url: WS_URL });

export const publisher = new Publisher({
  events: ClientToServerEvents,
  transport,
});

export const subscriber = new Subscriber({
  events: ServerToClientEvents,
  transport,
});
