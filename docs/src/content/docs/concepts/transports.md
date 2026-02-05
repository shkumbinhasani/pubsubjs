---
title: Transports
description: Understand how transports work in PubSubJS
---

Transports are the communication layer that moves messages between publishers and subscribers.

## What is a Transport?

A transport handles:
- **Connection management** - Connecting, disconnecting, reconnecting
- **Message delivery** - Sending messages from publishers to subscribers
- **Channel subscriptions** - Managing which channels a subscriber listens to

## Available Transports

| Transport | Use Case | Direction |
|-----------|----------|-----------|
| [WebSocket](/transports/websocket/) | Real-time browser apps | Bidirectional |
| [Redis](/transports/redis/) | Distributed systems | Bidirectional |
| [SSE](/transports/sse/) | Server-to-client streaming | Server → Client |

## Transport Interface

All transports implement the `Transport` interface:

```typescript
interface Transport {
  readonly id: string;
  readonly state: ConnectionState;
  readonly capabilities: TransportCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  publish(channel: string, payload: unknown, options?: TransportPublishOptions): Promise<void>;
  subscribe(channel: string, handler: TransportMessageHandler): Promise<UnsubscribeFn>;

  on(event: TransportEvent, handler: TransportEventHandler): void;
  off(event: TransportEvent, handler: TransportEventHandler): void;
}
```

## Transport Capabilities

Each transport declares its capabilities:

```typescript
interface TransportCapabilities {
  canPublish: boolean;      // Can send messages
  canSubscribe: boolean;    // Can receive messages
  bidirectional: boolean;   // Both publish and subscribe
  supportsTargeting: boolean; // Can target specific connections
  supportsChannels: boolean;  // Supports channel-based routing
}
```

## Connection States

Transports have four possible states:

```typescript
type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";
```

## Using Transports

### Direct Usage

```typescript
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";

const transport = new WebSocketServerTransport({ port: 8080 });

// Connect
await transport.connect();

// Publish directly (without Publisher)
await transport.publish("my-channel", { data: "hello" });

// Subscribe directly (without Subscriber)
const unsubscribe = await transport.subscribe("my-channel", (message) => {
  console.log("Received:", message.payload);
});

// Clean up
unsubscribe();
await transport.disconnect();
```

### With Publisher/Subscriber

```typescript
import { Publisher, Subscriber } from "@pubsubjs/core";
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";

const transport = new WebSocketServerTransport({ port: 8080 });

// Publisher and Subscriber manage the transport
const publisher = new Publisher({ events, transport });
const subscriber = new Subscriber({ events, transport });
```

## Sharing Transports

A single transport can be shared between publishers and subscribers:

```typescript
const transport = new WebSocketServerTransport({ port: 8080 });

// Both use the same transport instance
const publisher = new Publisher({ events, transport });
const subscriber = new Subscriber({ events, transport });
```

## Transport Events

Listen to transport events:

```typescript
transport.on("connect", ({ connectionId }) => {
  console.log(`Transport connected: ${connectionId}`);
});

transport.on("disconnect", ({ connectionId }) => {
  console.log(`Transport disconnected: ${connectionId}`);
});

transport.on("error", ({ error }) => {
  console.error("Transport error:", error);
});

transport.on("reconnecting", ({ attempt }) => {
  console.log(`Transport reconnecting... attempt ${attempt}`);
});
```

## Auto-Reconnection

Configure automatic reconnection:

```typescript
const publisher = new Publisher({
  events,
  transport,
  reconnectBaseDelay: 1000,    // Wait 1s between attempts
  reconnectMaxDelay: 30000,    // Cap backoff
  maxReconnectAttempts: 10,    // Give up after 10 attempts
});
```

## Choosing a Transport

| Scenario | Recommended Transport |
|----------|----------------------|
| Browser real-time app | WebSocket |
| Microservices | Redis |
| Mobile push notifications | SSE |
| IoT devices | WebSocket or MQTT (custom) |
| Serverless functions | Redis |

## Next Steps

- [WebSocket Transport](/transports/websocket/) - Real-time browser apps
- [Redis Transport](/transports/redis/) - Distributed systems
- [SSE Transport](/transports/sse/) - Server-to-client streaming
- [Custom Transports](/transports/custom/) - Build your own
