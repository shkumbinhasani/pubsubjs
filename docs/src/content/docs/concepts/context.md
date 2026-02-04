---
title: Context
description: Customize handler context with metadata and request-specific data
---

Context provides metadata and request-specific data to event handlers.

## Default Context

By default, handlers receive a `BaseContext`:

```typescript
interface BaseContext {
  messageId: string;  // Unique message identifier
  timestamp: Date;    // When the message was created
}
```

Usage:

```typescript
subscriber.on("user.created", (payload, { ctx }) => {
  console.log(`Message ID: ${ctx.messageId}`);
  console.log(`Timestamp: ${ctx.timestamp}`);
});
```

## Custom Context

Create custom context with additional data using a context factory:

```typescript
interface MyContext extends BaseContext {
  userId?: string;
  traceId?: string;
  requestId?: string;
  environment: string;
}

const subscriber = new Subscriber<typeof events, MyContext>({
  events,
  transport,
  contextFactory: (metadata) => ({
    messageId: metadata.messageId,
    timestamp: new Date(),
    userId: metadata.userId as string | undefined,
    traceId: metadata.traceId as string | undefined,
    requestId: metadata.requestId as string | undefined,
    environment: process.env.NODE_ENV || "development",
  }),
});

subscriber.on("user.created", (payload, { ctx }) => {
  console.log(`User: ${ctx.userId}`);
  console.log(`Trace: ${ctx.traceId}`);
  console.log(`Environment: ${ctx.environment}`);
});
```

## Transport Metadata

The context factory receives metadata from the transport:

```typescript
interface TransportMetadata {
  messageId: string;
  channel?: string;
  connectionId?: string;
  [key: string]: unknown; // Additional metadata
}
```

Publishers can include custom metadata:

```typescript
await publisher.publish("user.created", payload, {
  metadata: {
    userId: "user-123",
    traceId: "trace-abc",
    source: "api",
  },
});
```

This metadata is passed to the subscriber's context factory.

## Context Patterns

### Authentication Context

```typescript
interface AuthContext extends BaseContext {
  userId?: string;
  roles: string[];
  isAuthenticated: boolean;
}

const subscriber = new Subscriber<typeof events, AuthContext>({
  events,
  transport,
  contextFactory: async (metadata) => {
    const userId = metadata.userId as string | undefined;
    const user = userId ? await userService.getUser(userId) : null;

    return {
      messageId: metadata.messageId,
      timestamp: new Date(),
      userId,
      roles: user?.roles || [],
      isAuthenticated: !!user,
    };
  },
});

subscriber.on("admin.action", (payload, { ctx }) => {
  if (!ctx.roles.includes("admin")) {
    throw new Error("Unauthorized");
  }
  // Handle admin action
});
```

### Distributed Tracing

```typescript
interface TracingContext extends BaseContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

const subscriber = new Subscriber<typeof events, TracingContext>({
  events,
  transport,
  contextFactory: (metadata) => ({
    messageId: metadata.messageId,
    timestamp: new Date(),
    traceId: (metadata.traceId as string) || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: metadata.spanId as string | undefined,
  }),
});

subscriber.on("order.placed", async (payload, { ctx, publisher }) => {
  // Start a span
  const span = tracer.startSpan("process-order", {
    traceId: ctx.traceId,
    parentSpanId: ctx.spanId,
  });

  try {
    await processOrder(payload);

    // Propagate trace context to downstream events
    await publisher.publish("order.confirmed", confirmation, {
      metadata: {
        traceId: ctx.traceId,
        spanId: span.spanId,
      },
    });
  } finally {
    span.end();
  }
});
```

### Request Scoping

```typescript
interface RequestContext extends BaseContext {
  requestId: string;
  startTime: number;
  logger: Logger;
}

const subscriber = new Subscriber<typeof events, RequestContext>({
  events,
  transport,
  contextFactory: (metadata) => {
    const requestId = metadata.requestId as string || generateRequestId();
    return {
      messageId: metadata.messageId,
      timestamp: new Date(),
      requestId,
      startTime: Date.now(),
      logger: createLogger({ requestId }),
    };
  },
});

subscriber.on("data.process", (payload, { ctx }) => {
  ctx.logger.info("Processing started");

  // Process data...

  ctx.logger.info(`Completed in ${Date.now() - ctx.startTime}ms`);
});
```

## Context in Middleware

Middleware receives the same context:

```typescript
const loggingMiddleware: SubscribeMiddleware<typeof events, MyContext> = async (
  eventName,
  payload,
  context,
  next
) => {
  console.log(`[${context.traceId}] Processing ${eventName}`);
  await next();
  console.log(`[${context.traceId}] Completed ${eventName}`);
};
```

## Async Context Factory

The context factory can be async:

```typescript
const subscriber = new Subscriber<typeof events, MyContext>({
  events,
  transport,
  contextFactory: async (metadata) => {
    // Fetch user from database
    const user = await userService.getUser(metadata.userId as string);

    // Validate token
    const isValid = await authService.validateToken(metadata.token as string);

    return {
      messageId: metadata.messageId,
      timestamp: new Date(),
      user,
      isAuthenticated: isValid,
    };
  },
});
```

## Type Safety

TypeScript enforces context types:

```typescript
interface MyContext extends BaseContext {
  userId: string;
}

subscriber.on("user.created", (payload, { ctx }) => {
  // TypeScript knows ctx.userId is a string
  console.log(ctx.userId.toUpperCase());

  // TypeScript error: Property 'invalid' does not exist
  console.log(ctx.invalid);
});
```

## Next Steps

- [Middleware](/concepts/middleware/) - Use context in middleware
- [Error Handling](/advanced/error-handling/) - Context in error handlers
- [Testing](/advanced/testing/) - Mock context in tests
