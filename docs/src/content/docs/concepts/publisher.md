---
title: Publisher
description: Publish type-safe events to subscribers
---

The `Publisher` class sends events to subscribers through a transport.

## Basic Usage

```typescript
import { Publisher } from "@pubsubjs/core";
import { events } from "./events";

const publisher = new Publisher({
  events,
  transport,
});

// Publish an event
await publisher.publish("user.created", {
  userId: "123",
  email: "user@example.com",
  createdAt: new Date().toISOString(),
});
```

## Publisher Options

```typescript
const publisher = new Publisher({
  // Required: Event definitions
  events,

  // Required: Transport to use
  transport,

  // Optional: Middleware chain
  middleware: [createLoggingMiddleware()],

  // Optional: Custom channel strategy
  channelStrategy: (eventName) => `app:${eventName}`,

  // Optional: Skip validation (dangerous!)
  skipValidation: false,

  // Optional: Auto-reconnect settings
  autoReconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
});
```

## Publish Options

Each `publish` call can include options:

```typescript
await publisher.publish("notification.sent", payload, {
  // Target specific connections (if transport supports)
  targetIds: ["conn-123", "conn-456"],

  // Custom channel override
  channel: "custom-channel",

  // Additional metadata
  metadata: {
    priority: "high",
    source: "api",
  },
});
```

## Connection Management

```typescript
// Explicitly connect
await publisher.connect();

// Check connection state
console.log(publisher.state); // "connected" | "disconnected" | "connecting"
console.log(publisher.isConnected); // true | false

// Disconnect when done
await publisher.disconnect();
```

:::note
You don't need to call `connect()` explicitly. The publisher auto-connects on first publish.
:::

## Publisher Middleware

Add cross-cutting concerns with middleware:

```typescript
import { Publisher, createLoggingMiddleware, type PublishMiddleware } from "@pubsubjs/core";

// Built-in logging middleware
const publisher = new Publisher({
  events,
  transport,
  middleware: [createLoggingMiddleware()],
});

// Custom middleware
const timingMiddleware: PublishMiddleware<typeof events> = async (
  eventName,
  payload,
  options,
  next
) => {
  const start = Date.now();
  await next();
  console.log(`Published ${eventName} in ${Date.now() - start}ms`);
};

const publisher = new Publisher({
  events,
  transport,
  middleware: [timingMiddleware, createLoggingMiddleware()],
});
```

## Channel Strategy

Control how event names map to transport channels:

```typescript
// Default: event name = channel name
// "user.created" -> channel "user.created"

// Custom: add prefix
const publisher = new Publisher({
  events,
  transport,
  channelStrategy: (eventName) => `myapp:${eventName}`,
});
// "user.created" -> channel "myapp:user.created"

// Custom: use category
const publisher = new Publisher({
  events,
  transport,
  channelStrategy: (eventName) => {
    const [category] = eventName.split(".");
    return `events:${category}`;
  },
});
// "user.created" -> channel "events:user"
// "user.updated" -> channel "events:user"
```

## Error Handling

```typescript
try {
  await publisher.publish("user.created", invalidPayload);
} catch (error) {
  if (error instanceof ValidationError) {
    // Payload validation failed
    console.error("Invalid payload:", error.issues);
  } else if (error instanceof ConnectionError) {
    // Transport connection failed
    console.error("Connection failed:", error.message);
  } else if (error instanceof UnknownEventError) {
    // Event not defined
    console.error("Unknown event:", error.eventName);
  }
}
```

## Batching Events

For high-throughput scenarios, batch multiple publishes:

```typescript
// Sequential (slower)
for (const user of users) {
  await publisher.publish("user.created", user);
}

// Parallel (faster)
await Promise.all(
  users.map((user) => publisher.publish("user.created", user))
);
```

## Type Safety

The publisher enforces type safety at compile time:

```typescript
// Type error: unknown event
await publisher.publish("typo.event", {});

// Type error: wrong payload shape
await publisher.publish("user.created", {
  wrongField: "value",
});

// Type error: wrong payload type
await publisher.publish("user.created", {
  userId: 123, // Should be string
  email: "test@example.com",
});
```

## Next Steps

- [Subscriber](/concepts/subscriber/) - Receive events
- [Middleware](/concepts/middleware/) - Add logging, validation, and more
- [Transports](/transports/overview/) - Choose a transport
