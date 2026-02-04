---
title: Middleware
description: Add cross-cutting concerns with composable middleware
---

Middleware allows you to intercept and modify the publish/subscribe flow, adding features like logging, validation, rate limiting, and more.

## How Middleware Works

Middleware functions wrap around the core publish or subscribe operation:

```
Request → Middleware 1 → Middleware 2 → Handler → Middleware 2 → Middleware 1 → Done
```

Each middleware can:
- Execute code before the next middleware/handler
- Execute code after the next middleware/handler
- Short-circuit the chain by not calling `next()`
- Catch and handle errors

## Publisher Middleware

### Built-in Middleware

```typescript
import { Publisher, createLoggingMiddleware } from "@pubsubjs/core";

const publisher = new Publisher({
  events,
  transport,
  middleware: [createLoggingMiddleware()],
});
```

### Custom Publisher Middleware

```typescript
import type { PublishMiddleware } from "@pubsubjs/core";

const timingMiddleware: PublishMiddleware<typeof events> = async (
  eventName,
  payload,
  options,
  next
) => {
  const start = Date.now();
  console.log(`Publishing ${eventName}...`);

  try {
    await next();
    console.log(`Published ${eventName} in ${Date.now() - start}ms`);
  } catch (error) {
    console.error(`Failed to publish ${eventName}:`, error);
    throw error;
  }
};

const publisher = new Publisher({
  events,
  transport,
  middleware: [timingMiddleware],
});
```

## Subscriber Middleware

### Built-in Middleware

PubSubJS provides several built-in subscriber middleware:

#### Logging Middleware

```typescript
import { createSubscriberLoggingMiddleware } from "@pubsubjs/core";

const subscriber = new Subscriber({
  events,
  transport,
  middleware: [createSubscriberLoggingMiddleware()],
});

// Logs:
// [PubSub] Received user.created { payload: {...}, messageId: "..." }
// [PubSub] Handled user.created in 5ms
```

#### Timing Middleware

```typescript
import { createSubscriberTimingMiddleware } from "@pubsubjs/core";

const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    createSubscriberTimingMiddleware((eventName, durationMs) => {
      // Report to your metrics system
      metrics.histogram("event_handler_duration", durationMs, { event: eventName });
    }),
  ],
});
```

#### Idempotency Middleware

Prevents processing duplicate messages:

```typescript
import { createIdempotencyMiddleware } from "@pubsubjs/core";

const processedMessages = new Set<string>();

const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    createIdempotencyMiddleware({
      hasProcessed: (messageId) => processedMessages.has(messageId),
      markProcessed: (messageId) => processedMessages.add(messageId),
    }),
  ],
});
```

For production, use a persistent store:

```typescript
const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    createIdempotencyMiddleware({
      hasProcessed: async (messageId) => {
        return await redis.exists(`processed:${messageId}`);
      },
      markProcessed: async (messageId) => {
        await redis.setex(`processed:${messageId}`, 86400, "1"); // 24h TTL
      },
    }),
  ],
});
```

#### Rate Limit Middleware

Limits the rate of event processing:

```typescript
import { createRateLimitMiddleware } from "@pubsubjs/core";

const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    createRateLimitMiddleware({
      maxEvents: 100,    // Max 100 events
      windowMs: 1000,    // Per second
      onLimit: (eventName, payload) => {
        console.warn(`Rate limited: ${eventName}`);
        // Optionally: queue for later processing
      },
    }),
  ],
});
```

### Custom Subscriber Middleware

```typescript
import type { SubscribeMiddleware } from "@pubsubjs/core";

const authMiddleware: SubscribeMiddleware<typeof events, MyContext> = async (
  eventName,
  payload,
  context,
  next
) => {
  // Check if user is authorized
  if (!context.userId) {
    console.warn(`Unauthorized access to ${eventName}`);
    return; // Don't call next() - blocks the handler
  }

  // Add audit log
  console.log(`User ${context.userId} processing ${eventName}`);

  await next();

  console.log(`User ${context.userId} completed ${eventName}`);
};
```

## Middleware Order

Middleware executes in order. Place middleware strategically:

```typescript
const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    // 1. Logging first - see all events
    createSubscriberLoggingMiddleware(),

    // 2. Idempotency early - skip duplicates before processing
    createIdempotencyMiddleware({ hasProcessed, markProcessed }),

    // 3. Rate limiting - protect downstream systems
    createRateLimitMiddleware({ maxEvents: 100, windowMs: 1000 }),

    // 4. Custom auth/validation last - only for non-duplicate, non-limited events
    authMiddleware,
  ],
});
```

## Middleware Patterns

### Error Handling

```typescript
const errorHandlerMiddleware: SubscribeMiddleware<typeof events> = async (
  eventName,
  payload,
  context,
  next
) => {
  try {
    await next();
  } catch (error) {
    // Log error
    console.error(`Error in ${eventName}:`, error);

    // Report to error tracking
    errorTracker.captureException(error, { eventName, payload });

    // Re-throw or swallow based on your needs
    throw error;
  }
};
```

### Retry Logic

```typescript
const retryMiddleware: SubscribeMiddleware<typeof events> = async (
  eventName,
  payload,
  context,
  next
) => {
  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await next();
      return; // Success
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt}/${maxRetries} failed for ${eventName}`);

      if (attempt < maxRetries) {
        await sleep(1000 * attempt); // Exponential backoff
      }
    }
  }

  throw lastError;
};
```

### Validation

```typescript
const validationMiddleware: SubscribeMiddleware<typeof events> = async (
  eventName,
  payload,
  context,
  next
) => {
  // Additional business validation
  if (eventName === "order.placed" && payload.total <= 0) {
    console.error("Invalid order total");
    return; // Skip handler
  }

  await next();
};
```

### Metrics Collection

```typescript
const metricsMiddleware: SubscribeMiddleware<typeof events> = async (
  eventName,
  payload,
  context,
  next
) => {
  const start = Date.now();
  const labels = { event: eventName };

  metrics.counter("events_received_total", 1, labels);

  try {
    await next();
    metrics.counter("events_processed_total", 1, labels);
  } catch (error) {
    metrics.counter("events_failed_total", 1, labels);
    throw error;
  } finally {
    metrics.histogram("event_duration_seconds", (Date.now() - start) / 1000, labels);
  }
};
```

## Middleware Type Signature

### Publisher Middleware

```typescript
type PublishMiddleware<TEvents extends EventRegistry> = (
  eventName: EventNames<TEvents>,
  payload: unknown,
  options: PublishOptions | undefined,
  next: () => Promise<void>
) => Promise<void>;
```

### Subscriber Middleware

```typescript
type SubscribeMiddleware<
  TEvents extends EventRegistry,
  TContext extends BaseContext = BaseContext,
> = (
  eventName: EventNames<TEvents>,
  payload: unknown,
  context: TContext,
  next: () => Promise<void>
) => Promise<void>;
```

## Next Steps

- [Context](/concepts/context/) - Customize handler context
- [Error Handling](/advanced/error-handling/) - Handle errors gracefully
- [Testing](/advanced/testing/) - Test middleware
