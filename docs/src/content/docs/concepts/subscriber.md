---
title: Subscriber
description: Subscribe to events and handle incoming messages
---

The `Subscriber` class receives events from publishers through a transport.

## Basic Usage

```typescript
import { Subscriber } from "@pubsubjs/core";
import { events } from "./events";

const subscriber = new Subscriber({
  events,
  transport,
});

// Register a handler
subscriber.on("user.created", (payload, { ctx }) => {
  console.log(`New user: ${payload.email}`);
  console.log(`Message ID: ${ctx.messageId}`);
});

// Start subscribing
await subscriber.subscribe();
```

## Subscriber Options

```typescript
const subscriber = new Subscriber({
  // Required: Event definitions
  events,

  // Required: Transport to use
  transport,

  // Optional: Middleware chain
  middleware: [
    createSubscriberLoggingMiddleware(),
    createIdempotencyMiddleware({ hasProcessed, markProcessed }),
  ],

  // Optional: Context factory for custom context
  contextFactory: (metadata) => ({
    messageId: metadata.messageId,
    timestamp: new Date(),
    userId: metadata.userId,
  }),

  // Optional: Publisher for reply patterns
  publisher,

  // Optional: Error handler
  onError: (error, eventName, payload) => {
    console.error(`Error in ${eventName}:`, error);
  },

  // Optional: Custom channel strategy
  channelStrategy: (eventName) => `app:${eventName}`,

  // Optional: Skip validation
  skipValidation: false,

  // Optional: Auto-reconnect settings
  autoReconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
});
```

## Registering Handlers

### Single Handler

`on()` returns an unsubscribe function that removes that specific handler:

```typescript
const unsubscribe = subscriber.on("user.created", (payload, context) => {
  // Handle the event
});

// Later, remove just this handler
unsubscribe();
```

### Multiple Handlers Per Event

You can register multiple handlers for the same event. Each receives its own copy of the message independently:

```typescript
const unsub1 = subscriber.on("user.created", (payload) => {
  console.log("Handler 1:", payload.userId);
});

const unsub2 = subscriber.on("user.created", (payload) => {
  analytics.track("user_created", { userId: payload.userId });
});

// Remove only the first handler — the second keeps receiving events
unsub1();
```

If one handler throws an error, the other handlers still execute.

### Register Multiple Event Handlers

`onMany()` returns a single unsubscribe function that removes all registered handlers:

```typescript
const unsubscribe = subscriber.onMany({
  "user.created": (payload) => {
    console.log("User created:", payload.userId);
  },
  "user.updated": (payload) => {
    console.log("User updated:", payload.userId);
  },
  "user.deleted": (payload) => {
    console.log("User deleted:", payload.userId);
  },
});

// Remove all three handlers at once
unsubscribe();
```

### Remove All Handlers for an Event

`off()` removes all handlers registered for a given event and tears down the transport subscription:

```typescript
subscriber.off("user.created");
```

## Handler Context

Handlers receive a context object with useful information:

```typescript
subscriber.on("user.created", (payload, { ctx, publisher }) => {
  // ctx contains message metadata
  console.log(ctx.messageId);  // Unique message ID
  console.log(ctx.timestamp);  // Message timestamp
  console.log(ctx.channel);    // Channel name

  // publisher is available if configured
  if (publisher) {
    await publisher.publish("user.welcomed", { userId: payload.userId });
  }
});
```

## Subscriber Middleware

Add cross-cutting concerns with middleware:

```typescript
import {
  Subscriber,
  createSubscriberLoggingMiddleware,
  createSubscriberTimingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
} from "@pubsubjs/core";

const processedMessages = new Set<string>();

const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    // Log all incoming events
    createSubscriberLoggingMiddleware(),

    // Report handler timing
    createSubscriberTimingMiddleware((eventName, durationMs) => {
      metrics.recordTiming(eventName, durationMs);
    }),

    // Skip duplicate messages
    createIdempotencyMiddleware({
      hasProcessed: (id) => processedMessages.has(id),
      markProcessed: (id) => processedMessages.add(id),
    }),

    // Limit throughput
    createRateLimitMiddleware({
      maxEvents: 100,
      windowMs: 1000,
      onLimit: (eventName) => {
        console.warn(`Rate limited: ${eventName}`);
      },
    }),
  ],
});
```

### Custom Middleware

```typescript
import type { SubscribeMiddleware } from "@pubsubjs/core";

const authMiddleware: SubscribeMiddleware<typeof events> = async (
  eventName,
  payload,
  context,
  next
) => {
  // Check authorization
  if (!context.userId) {
    console.warn(`Unauthorized event: ${eventName}`);
    return; // Don't call next() to block the handler
  }

  await next();
};
```

## Custom Context

Create custom context with additional data:

```typescript
interface MyContext {
  messageId: string;
  timestamp: Date;
  userId?: string;
  traceId?: string;
}

const subscriber = new Subscriber<typeof events, MyContext>({
  events,
  transport,
  contextFactory: (metadata) => ({
    messageId: metadata.messageId,
    timestamp: new Date(),
    userId: metadata.userId as string | undefined,
    traceId: metadata.traceId as string | undefined,
  }),
});

subscriber.on("user.created", (payload, { ctx }) => {
  console.log(`Trace: ${ctx.traceId}`);
  console.log(`User: ${ctx.userId}`);
});
```

## Error Handling

Handle errors gracefully:

```typescript
const subscriber = new Subscriber({
  events,
  transport,
  onError: (error, eventName, payload) => {
    // Log the error
    console.error(`Error handling ${eventName}:`, error);

    // Send to error tracking service
    errorTracker.captureException(error, {
      eventName,
      payload,
    });

    // Optionally: publish to dead letter queue
    dlqPublisher.publish("dlq.failed", {
      originalEvent: eventName,
      payload,
      error: error.message,
    });
  },
});
```

## Reply Pattern

Use the publisher option to enable request-reply patterns:

```typescript
const publisher = new Publisher({ events, transport });
const subscriber = new Subscriber({
  events,
  transport,
  publisher,
});

subscriber.on("order.placed", async (payload, { publisher }) => {
  // Process the order
  const result = await processOrder(payload);

  // Reply with the result
  await publisher.publish("order.confirmed", {
    orderId: payload.orderId,
    status: result.status,
  });
});
```

## Lifecycle

```typescript
// Register handlers before subscribing
const unsub = subscriber.on("user.created", handler);

// Start subscribing
await subscriber.subscribe();

// Check state
console.log(subscriber.state);       // "connected"
console.log(subscriber.isConnected); // true

// Add handlers after subscribe() — they auto-subscribe (late-binding)
const unsub2 = subscriber.on("order.placed", orderHandler);

// Remove individual handlers at any time
unsub();

// Stop subscribing (tears down all transport subscriptions)
await subscriber.unsubscribe();
```

## Type Safety

The subscriber enforces type safety:

```typescript
// Type error: unknown event
subscriber.on("typo.event", handler);

// Type error: wrong payload shape in handler
subscriber.on("user.created", (payload) => {
  console.log(payload.wrongField); // TypeScript error!
});
```

## Next Steps

- [Middleware](/concepts/middleware/) - Learn more about middleware
- [Context](/concepts/context/) - Customize handler context
- [Error Handling](/advanced/error-handling/) - Advanced error handling
