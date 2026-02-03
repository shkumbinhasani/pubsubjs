import { Publisher, Subscriber } from "@pubsubjs/core";
import { RedisTransport } from "@pubsubjs/transport-redis";
import { RedisEvents } from "../../shared/events";
import { config } from "../lib/config";

/**
 * Redis transport for server-to-server communication
 */
export const redisTransport = new RedisTransport({
  url: config.redisUrl,
});

/**
 * Publisher: This Server -> Redis -> Other Servers
 */
export const redisPublisher = new Publisher({
  events: RedisEvents,
  transport: redisTransport,
});

/**
 * Subscriber: Other Servers -> Redis -> This Server
 */
export const redisSubscriber = new Subscriber({
  events: RedisEvents,
  transport: redisTransport,
});
