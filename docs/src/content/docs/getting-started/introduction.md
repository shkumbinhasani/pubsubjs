---
title: Introduction
description: Learn what PubSubJS is and why you should use it
---

PubSubJS is a type-safe, schema-validated publish/subscribe library for TypeScript. It provides a robust foundation for building real-time applications with confidence.

## What is Pub/Sub?

The publish/subscribe (pub/sub) pattern is a messaging pattern where:

- **Publishers** send messages (events) without knowing who will receive them
- **Subscribers** receive messages they're interested in without knowing who sent them
- A **transport** handles the delivery of messages between publishers and subscribers

This decoupling makes it easier to build scalable, maintainable applications.

## Why PubSubJS?

### Type Safety

PubSubJS leverages TypeScript to provide full type inference:

```typescript
// Event names are type-checked
publisher.publish("user.created", payload); // OK
publisher.publish("typo.event", payload);   // TypeScript error!

// Payloads are type-checked
subscriber.on("user.created", (payload) => {
  console.log(payload.email);    // OK - TypeScript knows the type
  console.log(payload.invalid);  // TypeScript error!
});
```

### Schema Validation

Validate payloads at runtime to catch errors early:

```typescript
import { z } from "zod";

const events = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: z.string().uuid(),
      email: z.string().email(),
      age: z.number().min(0).max(150),
    }),
  },
]);

// Invalid payloads are rejected at runtime
await publisher.publish("user.created", {
  userId: "not-a-uuid",  // Validation error!
  email: "invalid",      // Validation error!
  age: -5,               // Validation error!
});
```

### Transport Agnostic

Switch between transports without changing your application code:

```typescript
// Development: In-memory transport
const transport = new MemoryTransport();

// Production: Redis for distributed systems
const transport = new RedisTransport({ url: "redis://localhost:6379" });

// Real-time: WebSocket for browser clients
const transport = new WebSocketServerTransport({ port: 8080 });
```

### Middleware Support

Add cross-cutting concerns with composable middleware:

```typescript
const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    createSubscriberLoggingMiddleware(),
    createIdempotencyMiddleware({
      hasProcessed: (id) => cache.has(id),
      markProcessed: (id) => cache.set(id, true),
    }),
    createRateLimitMiddleware({ maxEvents: 100, windowMs: 1000 }),
  ],
});
```

## Use Cases

PubSubJS is ideal for:

- **Real-time applications**: Chat, notifications, live dashboards
- **Microservices**: Event-driven communication between services
- **Frontend state management**: React applications with real-time updates
- **IoT applications**: Sensor data streaming and device communication
- **Gaming**: Multiplayer game state synchronization

## Next Steps

- [Installation](/getting-started/installation/) - Install PubSubJS packages
- [Quick Start](/getting-started/quick-start/) - Build your first pub/sub application
- [Core Concepts](/concepts/events/) - Deep dive into events and schemas
