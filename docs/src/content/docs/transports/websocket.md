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

### Basic Setup

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

await subscriber.subscribe();
console.log("WebSocket server running on ws://localhost:8080");
```

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

For horizontal scaling, use Redis as a message broker:

```typescript
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";
import { RedisTransport } from "@pubsubjs/transport-redis";

// Each server has its own WebSocket transport
const wsTransport = new WebSocketServerTransport({ port: 8080 });

// All servers share Redis for message routing
const redisTransport = new RedisTransport({ url: "redis://localhost:6379" });

// Subscribe to Redis, publish to WebSocket clients
const subscriber = new Subscriber({
  events,
  transport: redisTransport,
});

const publisher = new Publisher({
  events,
  transport: wsTransport,
});

subscriber.on("broadcast", async (payload) => {
  await publisher.publish("broadcast", payload);
});
```

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
