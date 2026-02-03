# Production-Ready PubSub Example

A comprehensive reference implementation demonstrating best practices for building event-driven applications using the `@pubsubjs/core` library.

## Overview

This example showcases real-world patterns and practices for implementing PubSub architectures in production environments, including:

- **Comprehensive Event Definitions** - Type-safe events with Zod schemas
- **Middleware Patterns** - Logging, metrics, retry logic, circuit breaker
- **Error Handling** - Dead letter queues, structured error handling
- **Security** - Authentication, authorization, and monitoring patterns
- **Observability** - Distributed tracing and correlation IDs

## Quick Start

```bash
# Run the example
bun run examples/basic-usage/index.ts

# Run tests
bun test examples/basic-usage/index.test.ts
```

## Architecture

### Event Categories

The example defines events across multiple domains:

#### 1. Authentication Events (`AuthEvents`)
- `auth.login` - User login success
- `auth.logout` - User logout/session end
- `auth.login_failed` - Failed login attempts

#### 2. Security Events (`SecurityEvents`)
- `security.password_reset_requested` - Password reset initiation
- `security.password_reset_completed` - Password reset completion
- `security.email_verification_sent` - Email verification sent
- `security.email_verified` - Email verification confirmed
- `security.suspicious_activity` - Security alerts

#### 3. User Lifecycle Events (`UserLifecycleEvents`)
- `user.created` - New user registration
- `user.updated` - Profile updates
- `user.deactivated` - Account deactivation

#### 4. Notification Events (`NotificationEvents`)
- `notification.send_email` - Email dispatch
- `notification.send_sms` - SMS dispatch
- `notification.send_push` - Push notification

#### 5. Analytics Events (`AnalyticsEvents`)
- `analytics.event_tracked` - Generic analytics tracking

## Patterns Demonstrated

### 1. Publisher-Only Pattern

Use when a service only needs to emit events:

```typescript
const publisher = new Publisher({
  events: AuthEvents,
  transport,
  middleware: [
    createTracingMiddleware(),
    createLoggingMiddleware(),
    createRetryMiddleware(3, 100),
    createCircuitBreakerMiddleware(5, 30000),
  ],
});

await publisher.publish("auth.login", {
  userId: "...",
  email: "user@example.com",
  // ...
});
```

### 2. Subscriber-Only Pattern

Use when a service only needs to consume events:

```typescript
const subscriber = new Subscriber({
  events: NotificationEvents,
  transport,
  onError: createErrorHandler(),
});

subscriber
  .on("notification.send_email", (payload, { ctx }) => {
    // Handle email sending
  })
  .on("notification.send_sms", (payload) => {
    // Handle SMS sending
  });

await subscriber.subscribe();
```

### 3. Bidirectional PubSub Pattern

Use when a service needs to both publish and subscribe:

```typescript
const pubsub = new PubSub({
  publishEvents: NotificationEvents,
  subscribeEvents: UserLifecycleEvents,
  transport,
});

pubsub.on("user.created", async (payload, { publisher }) => {
  // Handle user creation and publish notifications
  await publisher.publish("notification.send_email", {
    to: payload.email,
    // ...
  });
});

await pubsub.start();
```

## Middleware

### Metrics Middleware

Tracks event publishing metrics:

```typescript
const metrics = createMetricsMiddleware();

const publisher = new Publisher({
  events: MyEvents,
  transport,
  middleware: [metrics.middleware],
});

// Access metrics
console.log(metrics.getMetrics());
// { eventsPublished: 10, eventsFailed: 0, totalLatency: 150 }
```

### Retry Middleware

Implements exponential backoff for transient failures:

```typescript
const retryMiddleware = createRetryMiddleware({
  maxRetries: 3,
  baseDelay: 100, // ms
});
```

Features:
- Only retries transient errors (not validation errors)
- Exponential backoff: 100ms, 200ms, 400ms
- Logs retry attempts

### Circuit Breaker Middleware

Prevents cascading failures:

```typescript
const circuitBreaker = createCircuitBreakerMiddleware({
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
});
```

States:
- **Closed**: Normal operation
- **Open**: Failing fast after threshold
- **Half-open**: Testing recovery

### Tracing Middleware

Adds distributed tracing support:

```typescript
const tracing = createTracingMiddleware();

// Automatically adds:
// - correlationId
// - traceId
// - timestamp
```

## Error Handling

### Dead Letter Queue

Captures failed events for later analysis:

```typescript
class DeadLetterQueue {
  async add(eventName: string, payload: unknown, error: Error, retryCount: number);
  getFailedEvents(): FailedEvent[];
  clear(): void;
}
```

### Error Handler

Structured error handling with context:

```typescript
const errorHandler = createErrorHandler();

const subscriber = new Subscriber({
  events: MyEvents,
  transport,
  onError: errorHandler,
});
```

Features:
- Structured logging
- DLQ integration
- Error categorization (ConnectionError, ValidationError)

## Best Practices

### 1. Event Naming

Use dot notation for clear domain separation:
```typescript
// Good
"user.created"
"order.shipped"
"payment.processed"

// Avoid
"userCreated"
"order_shipped"
```

### 2. Schema Design

- Use strict validation with Zod
- Include timestamps in ISO 8601 format
- Use UUIDs for identifiers
- Include metadata for extensibility

### 3. Error Handling

- Always provide `onError` handlers
- Use structured logging
- Implement DLQ for critical events
- Don't retry validation errors

### 4. Security

- Validate all inputs with Zod schemas
- Include IP addresses and user agents for audit
- Track authentication events
- Monitor for suspicious patterns

### 5. Observability

- Use correlation IDs for request tracing
- Track metrics for all operations
- Log structured data
- Include timing information

## Example Scenarios

### Authentication Service

Demonstrates:
- Login/logout tracking
- Failed attempt monitoring
- MFA usage logging
- Middleware composition

### Notification Service

Demonstrates:
- Multi-channel notifications (email, SMS, push)
- Priority handling
- Template-based messaging
- Error recovery

### User Service

Demonstrates:
- User lifecycle management
- Bidirectional communication
- Analytics tracking
- Profile update auditing

### Security Monitoring

Demonstrates:
- Brute force detection
- IP-based tracking
- Alert generation
- Pattern recognition

## Testing

Run the test suite:

```bash
bun test examples/basic-usage/index.test.ts
```

Tests cover:
- Event publishing
- Event subscription
- Bidirectional communication
- Schema validation
- Context propagation

## Production Considerations

### Transport Selection

This example uses `MemoryTransport` for simplicity. In production:

- **Redis**: For distributed systems
- **WebSocket**: For real-time client communication
- **SSE**: For server-to-client streaming

### Scaling

- Use separate publishers/subscribers per service
- Implement horizontal scaling with Redis
- Use channel strategies for routing
- Consider event partitioning for high volume

### Monitoring

- Export metrics to Prometheus/Datadog
- Set up alerts for DLQ growth
- Monitor circuit breaker state
- Track event processing latency

### Security

- Validate all events at boundaries
- Use authentication context
- Implement rate limiting
- Audit sensitive operations

## Further Reading

- [PubSub Core Documentation](../../packages/core/README.md)
- [React Integration](../../packages/react/README.md)
- [Redis Transport](../../packages/transport-redis/README.md)
- [WebSocket Transport](../../packages/transport-websocket/README.md)

## License

MIT
