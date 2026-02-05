---
title: Error Handling
description: Handle errors gracefully in PubSubJS
---

Proper error handling ensures your application remains stable and debuggable.

## Error Types

PubSubJS provides specific error types:

```typescript
import {
  ValidationError,
  UnknownEventError,
  ConnectionError,
} from "@pubsubjs/core";
```

### ValidationError

Thrown when payload validation fails:

```typescript
try {
  await publisher.publish("user.created", {
    userId: 123, // Should be string
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log("Validation issues:", error.issues);
    // [{ path: ["userId"], message: "Expected string, received number" }]
  }
}
```

### UnknownEventError

Thrown when publishing/subscribing to undefined events:

```typescript
try {
  await publisher.publish("undefined.event", {});
} catch (error) {
  if (error instanceof UnknownEventError) {
    console.log("Unknown event:", error.eventName);
  }
}
```

### ConnectionError

Thrown when transport connection fails:

```typescript
try {
  await transport.connect();
} catch (error) {
  if (error instanceof ConnectionError) {
    console.log("Connection failed:", error.message);
  }
}
```

## Subscriber Error Handling

### onError Handler

Handle errors in event handlers:

```typescript
const subscriber = new Subscriber({
  events,
  transport,
  onError: (error, eventName, payload) => {
    console.error(`Error handling ${eventName}:`, error);

    // Log to error tracking service
    errorTracker.captureException(error, {
      extra: { eventName, payload },
    });
  },
});
```

### Error Middleware

Use middleware for advanced error handling:

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
    // Log error with context
    logger.error("Event handler failed", {
      eventName,
      messageId: context.messageId,
      error: error.message,
    });

    // Optionally re-throw
    throw error;
  }
};
```

### Retry Logic

Implement retry with exponential backoff:

```typescript
const retryMiddleware: SubscribeMiddleware<typeof events> = async (
  eventName,
  payload,
  context,
  next
) => {
  const maxRetries = 3;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await next();
      return; // Success
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 100; // Exponential backoff
        console.warn(`Retry ${attempt}/${maxRetries} for ${eventName} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
};
```

## Dead Letter Queue

Handle failed messages by sending them to a DLQ:

```typescript
interface DeadLetterMessage {
  originalEvent: string;
  payload: unknown;
  error: string;
  failedAt: string;
  attempts: number;
}

const dlqEvents = defineEvent([
  {
    name: "dlq.failed",
    schema: z.object({
      originalEvent: z.string(),
      payload: z.unknown(),
      error: z.string(),
      failedAt: z.string(),
      attempts: z.number(),
    }),
  },
]);

const dlqPublisher = new Publisher({ events: dlqEvents, transport });

const dlqMiddleware: SubscribeMiddleware<typeof events> = async (
  eventName,
  payload,
  context,
  next
) => {
  try {
    await next();
  } catch (error) {
    // Send to dead letter queue
    await dlqPublisher.publish("dlq.failed", {
      originalEvent: eventName,
      payload,
      error: error.message,
      failedAt: new Date().toISOString(),
      attempts: 1,
    });

    // Don't re-throw - message is now in DLQ
  }
};
```

## Publisher Error Handling

### Try-Catch Pattern

```typescript
async function safePublish(eventName, payload) {
  try {
    await publisher.publish(eventName, payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn("Invalid payload", { eventName, issues: error.issues });
      return { success: false, error: "validation" };
    }

    if (error instanceof ConnectionError) {
      logger.error("Connection failed", { eventName });
      // Queue for retry
      await retryQueue.add({ eventName, payload });
      return { success: false, error: "connection" };
    }

    throw error; // Re-throw unknown errors
  }

  return { success: true };
}
```

### Publish Middleware for Errors

```typescript
const errorLoggingMiddleware: PublishMiddleware<typeof events> = async (
  eventName,
  payload,
  options,
  next
) => {
  try {
    await next();
  } catch (error) {
    logger.error("Publish failed", {
      eventName,
      error: error.message,
    });
    throw error;
  }
};
```

## Transport Errors

Handle transport-level errors:

```typescript
transport.on("error", ({ error }) => {
  console.error("Transport error:", error);

  // Track in metrics
  if (error) {
    metrics.counter("transport_errors_total", 1, {
      transport: transport.id,
      error: error.name,
    });
  }
});

transport.on("disconnect", ({ connectionId }) => {
  console.warn(`Transport disconnected: ${connectionId}`);
  // UI feedback, reconnection logic, etc.
});
```

## React Error Boundaries

Use error boundaries with PubSubJS:

```tsx
class PubSubErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logger.error("React error in PubSub component", {
      error: error.message,
      stack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong with real-time updates.</div>;
    }
    return this.props.children;
  }
}

// Usage
function App() {
  return (
    <PubSubErrorBoundary>
      <PubSubProvider>
        <YourApp />
      </PubSubProvider>
    </PubSubErrorBoundary>
  );
}
```

## Best Practices

1. **Always use onError**: Don't let errors crash your subscriber silently
2. **Log with context**: Include eventName, messageId, and payload in logs
3. **Use error tracking**: Send errors to services like Sentry
4. **Implement DLQ**: Don't lose failed messages
5. **Monitor error rates**: Alert on high error rates
6. **Graceful degradation**: Show fallback UI when real-time fails

## Next Steps

- [Testing](/advanced/testing/) - Test error scenarios
- [Middleware](/concepts/middleware/) - Error handling middleware
