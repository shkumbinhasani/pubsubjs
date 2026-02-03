/**
 * Scalable WebSocket Server
 *
 * Architecture:
 *
 *   Client ◄──WebSocket──► Server ◄──Redis──► Server ◄──WebSocket──► Client
 *
 * Two PubSub layers:
 * 1. Client ↔ Server (WebSocket) - Direct client communication
 * 2. Server ↔ Server (Redis) - Cross-instance broadcasting
 */

import { config } from "./lib/config";
import { wsTransport, wsSubscriber, type WebSocketData } from "./transports/websocket";
import { redisTransport, redisSubscriber } from "./transports/redis";
import { setupClientEventHandlers, setupRedisEventHandlers, setupConnectionHandlers } from "./handlers";
import { routes } from "./routes";
import { generateMessageId } from "@pubsubjs/core";

async function start() {
  // Setup event handlers
  setupClientEventHandlers();
  setupRedisEventHandlers();
  setupConnectionHandlers();

  // Try to connect to Redis (optional - enables horizontal scaling)
  let redisConnected = false;
  try {
    // Timeout wrapper since Bun.redis hangs when Redis is unavailable
    const connectWithTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), ms)
        ),
      ]);

    await connectWithTimeout(redisTransport.connect(), 3000);
    await connectWithTimeout(redisSubscriber.subscribe(), 3000);
    redisConnected = true;
    console.log(`[${config.serverId}] Connected to Redis`);
  } catch (error) {
    console.warn(`[${config.serverId}] Redis not available - running in single-server mode`);
    console.warn(`[${config.serverId}] Start Redis to enable horizontal scaling`);
  }

  // Start WebSocket subscriber
  await wsSubscriber.subscribe();

  // Connect WebSocket transport (marks it as ready)
  await wsTransport.connect();

  // Start HTTP/WebSocket server
  Bun.serve<WebSocketData>({
    port: config.port,
    routes,
    websocket: wsTransport.websocketHandler,
    fetch(req, server) {
      const url = new URL(req.url);

      // Handle WebSocket upgrade
      if (url.pathname === "/ws") {
        const data: WebSocketData = {
          connectionId: generateMessageId(),
          subscriptions: new Set(),
        };

        const upgraded = server.upgrade(req, { data });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`
┌─────────────────────────────────────────────┐
│     Scalable WebSocket Server Started       │
├─────────────────────────────────────────────┤
│  Server:  ${config.serverId.padEnd(32)}│
│  HTTP:    http://localhost:${config.port.toString().padEnd(18)}│
│  WS:      ws://localhost:${config.port}/ws${" ".repeat(14)}│
│  Redis:   ${config.redisUrl.padEnd(32)}│
├─────────────────────────────────────────────┤
│  Run another instance:                      │
│  PORT=3001 bun run dev                      │
└─────────────────────────────────────────────┘
  `);
}

start().catch(console.error);
