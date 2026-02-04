---
title: Transport Overview
description: Choose the right transport for your application
---

Transports handle the communication between publishers and subscribers. PubSubJS provides several built-in transports for different use cases.

## Available Transports

| Transport | Package | Use Case | Browser | Server |
|-----------|---------|----------|---------|--------|
| WebSocket | `@pubsubjs/transport-websocket` | Real-time bidirectional | Yes | Yes |
| Redis | `@pubsubjs/transport-redis` | Distributed systems | No | Yes |
| SSE (client) | `@pubsubjs/transport-sse` | Server-to-client streaming | Yes | No |

## Choosing a Transport

### WebSocket

Best for:
- Real-time browser applications
- Chat applications
- Live collaboration tools
- Gaming

```typescript
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";

const transport = new WebSocketServerTransport({ port: 8080 });
```

### Redis

Best for:
- Microservices communication
- Distributed systems
- Serverless functions
- High-throughput applications

```typescript
import { RedisTransport } from "@pubsubjs/transport-redis";

const transport = new RedisTransport({ url: "redis://localhost:6379" });
```

### SSE (Server-Sent Events)

Best for:
- Server-to-client notifications
- Live feeds and dashboards
- Mobile applications
- Environments where WebSocket is blocked

```typescript
import { SSEServerTransport } from "@pubsubjs/transport-sse";

const transport = new SSEServerTransport();
```

## Transport Capabilities

Each transport has different capabilities:

```typescript
interface TransportCapabilities {
  canPublish: boolean;       // Can send messages
  canSubscribe: boolean;     // Can receive messages
  bidirectional: boolean;    // Both directions
  supportsTargeting: boolean; // Target specific connections
  supportsChannels: boolean;  // Channel-based routing
}
```

| Transport | Publish | Subscribe | Bidirectional | Targeting | Channels |
|-----------|---------|-----------|---------------|-----------|----------|
| WebSocket Server | Yes | Yes | Yes | Yes | Yes |
| WebSocket Client | Yes | Yes | Yes | No | Yes |
| Redis | Yes | Yes | Yes | No | Yes |
| SSE Client | No | Yes | No | No | Yes |

## Connection States

All transports share the same connection states:

```typescript
type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
```

Monitor connection state:

```typescript
transport.on("connect", () => console.log("Connected"));
transport.on("disconnect", () => console.log("Disconnected"));
transport.on("reconnecting", () => console.log("Reconnecting..."));
transport.on("error", (error) => console.error("Error:", error));
```

## Auto-Reconnection

Configure automatic reconnection:

```typescript
const publisher = new Publisher({
  events,
  transport,
  reconnectBaseDelay: 1000,    // Start with 1 second
  reconnectMaxDelay: 30000,    // Cap backoff
  maxReconnectAttempts: 10,    // Give up after 10 attempts
});
```

## Multiple Transports

Use different transports for different purposes:

```typescript
// Internal microservice communication
const redisTransport = new RedisTransport({ url: "redis://localhost:6379" });
const internalPublisher = new Publisher({ events, transport: redisTransport });

// Browser clients
const wsTransport = new WebSocketServerTransport({ port: 8080 });
const clientPublisher = new Publisher({ events, transport: wsTransport });

// Bridge events between transports
const subscriber = new Subscriber({
  events,
  transport: redisTransport,
  publisher: clientPublisher,
});

subscriber.on("notification.created", async (payload, { publisher }) => {
  // Forward internal events to browser clients
  await publisher.publish("notification.created", payload);
});
```

## Next Steps

- [WebSocket Transport](/transports/websocket/) - Real-time bidirectional
- [Redis Transport](/transports/redis/) - Distributed systems
- [SSE Transport](/transports/sse/) - Server-to-client streaming
- [Custom Transports](/transports/custom/) - Build your own
