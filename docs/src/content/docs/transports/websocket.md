---
title: WebSocket Transport
description: Real-time bidirectional communication with WebSocket
---

The WebSocket transport enables real-time bidirectional communication between browser clients and servers.

## Installation

```bash
bun add @pubsubjs/transport-websocket
```

## Server Transport

The server transport supports two modes:

- **Standalone mode** - Creates its own HTTP server (simple setup)
- **Composable mode** - Integrates with an existing `Bun.serve()` (flexible)

### Standalone Mode

Creates a dedicated WebSocket server:

```typescript
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";
import { Publisher, Subscriber } from "@pubsubjs/core";
import { events } from "./events";

const transport = new WebSocketServerTransport({
  port: 8080,
});

const publisher = new Publisher({ events, transport });
const subscriber = new Subscriber({ events, transport });

subscriber.on("message.sent", (payload) => {
  console.log(`New message: ${payload.content}`);
});

await transport.connect();
await subscriber.subscribe();
console.log("WebSocket server running on ws://localhost:8080");
```

### Composable Mode

Integrate WebSocket with an existing server that has HTTP routes, middleware, etc:

```typescript
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";
import { Publisher, Subscriber } from "@pubsubjs/core";
import { events } from "./events";

// Create transport without port for composable mode
const transport = new WebSocketServerTransport();

const publisher = new Publisher({ events, transport });
const subscriber = new Subscriber({ events, transport });

await transport.connect();
await subscriber.subscribe();

// Integrate with your existing Bun.serve()
Bun.serve({
  port: 8080,

  // Your HTTP routes
  routes: {
    "/api/health": () => Response.json({ status: "ok" }),
  },

  // Use transport's WebSocket handler
  websocket: transport.websocketHandler,

  fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrades
    if (url.pathname === "/ws") {
      return transport.handleUpgrade(req, server);
    }

    return new Response("Not Found", { status: 404 });
  },
});
```

This mode is useful when you need:
- Custom HTTP routes alongside WebSocket
- Authentication middleware before WebSocket upgrade
- Multiple transports sharing the same server
- Integration with existing application infrastructure

### Server Options

```typescript
const transport = new WebSocketServerTransport({
  // Port to listen on
  port: 8080,

  // Hostname to bind to
  hostname: "localhost",

  // Maximum payload size in bytes
  maxPayloadLength: 16 * 1024 * 1024, // 16MB

  // Idle timeout in seconds
  idleTimeout: 120,

  // Attach data during upgrade
  onUpgrade: async (req) => ({
    userId: req.headers.get("x-user-id") ?? undefined,
  }),
});
```

### Broadcasting

Send messages to all connected clients:

```typescript
await publisher.publish("notification", {
  message: "Server maintenance in 5 minutes",
});
```

### Targeting Specific Clients

Send messages to specific connections:

```typescript
await publisher.publish("private.message", payload, {
  targetIds: ["connection-id-1", "connection-id-2"],
});
```

### Connection Events

```typescript
transport.on("connect", ({ connectionId }) => {
  console.log(`Client connected: ${connectionId}`);
});

transport.on("disconnect", ({ connectionId }) => {
  console.log(`Client disconnected: ${connectionId}`);
});
```

## Client Transport

### Basic Setup

```typescript
import { WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { Publisher, Subscriber } from "@pubsubjs/core";
import { events } from "./events";

const transport = new WebSocketClientTransport({
  url: "ws://localhost:8080",
});

const publisher = new Publisher({ events, transport });
const subscriber = new Subscriber({ events, transport });

subscriber.on("notification", (payload) => {
  console.log(`Notification: ${payload.message}`);
});

await subscriber.subscribe();
```

### Client Options

```typescript
const transport = new WebSocketClientTransport({
  // WebSocket server URL
  url: "wss://api.example.com/ws",

  // Protocols (optional)
  protocols: ["v1"],

  // Reconnection settings
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
});
```

### React Integration

```typescript
import { useEffect, useState } from "react";
import { WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { Subscriber } from "@pubsubjs/core";

function useWebSocketSubscriber() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const transport = new WebSocketClientTransport({
      url: "ws://localhost:8080",
    });

    const subscriber = new Subscriber({ events, transport });

    subscriber.on("message.received", (payload) => {
      setMessages((prev) => [...prev, payload]);
    });

    subscriber.subscribe();

    return () => {
      subscriber.unsubscribe();
    };
  }, []);

  return messages;
}
```

## Authentication

### Server-Side Auth

Attach identity during upgrade using `onUpgrade`:

```typescript
const transport = new WebSocketServerTransport({
  port: 8080,
  onUpgrade: async (req) => {
    const token = req.headers.get("authorization");
    const user = token ? await verifyToken(token) : null;
    return { userId: user?.id };
  },
});
```

### Client-Side Auth

Pass tokens via the URL or subprotocols:

```typescript
const transport = new WebSocketClientTransport({
  url: `wss://api.example.com/ws?token=${token}`,
  protocols: ["v1"],
});
```

## Scaling

### Multiple Servers

For horizontal scaling, use Redis as a message broker between server instances. The composable mode is ideal for this pattern:

```typescript
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";
import { RedisTransport } from "@pubsubjs/transport-redis";
import { Publisher, Subscriber } from "@pubsubjs/core";

// WebSocket transport in composable mode
const wsTransport = new WebSocketServerTransport();

// Redis transport for cross-server communication
const redisTransport = new RedisTransport({ url: "redis://localhost:6379" });

// Client -> Server (WebSocket)
const wsSubscriber = new Subscriber({ events, transport: wsTransport });

// Server -> Clients (WebSocket)
const wsPublisher = new Publisher({ events, transport: wsTransport });

// Server -> Server (Redis)
const redisPublisher = new Publisher({ events, transport: redisTransport });

// Server <- Server (Redis)
const redisSubscriber = new Subscriber({ events, transport: redisTransport });

// Connect transports
await wsTransport.connect();
await redisTransport.connect();

// When client sends a message, broadcast via Redis to all servers
wsSubscriber.on("chat.message", async (payload, ctx) => {
  await redisPublisher.publish("chat.message", payload);
});

// When Redis receives a message, send to local WebSocket clients
redisSubscriber.on("chat.message", async (payload) => {
  await wsPublisher.publish("chat.message", payload);
});

await wsSubscriber.subscribe();
await redisSubscriber.subscribe();

// Start server with HTTP routes and WebSocket
Bun.serve({
  port: process.env.PORT || 8080,
  routes: {
    "/api/health": () => Response.json({ status: "ok" }),
  },
  websocket: wsTransport.websocketHandler,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      return wsTransport.handleUpgrade(req, server);
    }
    return new Response("Not Found", { status: 404 });
  },
});
```

This architecture allows:
- Multiple server instances behind a load balancer
- Messages from any client reach all connected clients
- Each server handles its own WebSocket connections
- Redis coordinates message delivery across servers

## Error Handling

```typescript
transport.on("error", (error) => {
  console.error("WebSocket error:", error);
});

transport.on("disconnect", () => {
  console.log("Connection lost, attempting to reconnect...");
});
```

## Next Steps

- [Redis Transport](/transports/redis/) - For distributed systems
- [SSE Transport](/transports/sse/) - Server-to-client streaming
- [React Integration](/react/setup/) - Use with React
