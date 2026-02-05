---
title: Redis Transport
description: Distributed pub/sub with Redis
---

The Redis transport enables distributed pub/sub across multiple servers and processes.

## Installation

```bash
bun add @pubsubjs/transport-redis
```

## Basic Usage

```typescript
import { RedisTransport } from "@pubsubjs/transport-redis";
import { Publisher, Subscriber } from "@pubsubjs/core";
import { events } from "./events";

const transport = new RedisTransport({
  url: "redis://localhost:6379",
});

const publisher = new Publisher({ events, transport });
const subscriber = new Subscriber({ events, transport });

subscriber.on("order.placed", async (payload) => {
  console.log(`New order: ${payload.orderId}`);
  await processOrder(payload);
});

await subscriber.subscribe();
```

## Configuration Options

```typescript
const transport = new RedisTransport({
  // Connection URL
  url: "redis://localhost:6379",

  // Optional channel prefix for namespacing
  channelPrefix: "myapp",
});
```

## How It Works

Redis transport uses Redis Pub/Sub under the hood:

1. **Publisher** sends messages to Redis channels
2. **Redis** broadcasts to all subscribers of that channel
3. **Subscriber** receives messages from subscribed channels

```
┌──────────┐     ┌─────────┐     ┌──────────┐
│ Server 1 │────▶│  Redis  │────▶│ Server 2 │
│ Publisher│     │ Pub/Sub │     │Subscriber│
└──────────┘     └─────────┘     └──────────┘
                      │
                      ▼
               ┌──────────┐
               │ Server 3 │
               │Subscriber│
               └──────────┘
```

## Use Cases

### Microservices Communication

```typescript
// order-service.ts
const publisher = new Publisher({ events, transport });

await publisher.publish("order.placed", {
  orderId: "123",
  items: [...],
  total: 99.99,
});

// inventory-service.ts
const subscriber = new Subscriber({ events, transport });

subscriber.on("order.placed", async (payload) => {
  await reserveInventory(payload.items);
});

// notification-service.ts
const subscriber = new Subscriber({ events, transport });

subscriber.on("order.placed", async (payload) => {
  await sendOrderConfirmationEmail(payload);
});
```

### Serverless Functions

```typescript
// AWS Lambda / Vercel Functions
import { RedisTransport } from "@pubsubjs/transport-redis";
import { Publisher } from "@pubsubjs/core";

export async function handler(event) {
  const transport = new RedisTransport({
    url: process.env.REDIS_URL,
  });

  const publisher = new Publisher({ events, transport });

  await publisher.publish("webhook.received", {
    source: "stripe",
    payload: event.body,
  });

  await transport.disconnect();

  return { statusCode: 200 };
}
```

### Worker Queues

```typescript
// Producer
await publisher.publish("job.queued", {
  jobId: "job-123",
  type: "video-transcode",
  input: "s3://bucket/video.mp4",
});

// Worker (can be on different server)
subscriber.on("job.queued", async (payload) => {
  console.log(`Processing job: ${payload.jobId}`);
  await processJob(payload);

  await publisher.publish("job.completed", {
    jobId: payload.jobId,
    output: "s3://bucket/video-720p.mp4",
  });
});
```

## Best Practices

### Connection Management

```typescript
// Reuse transport across your application
const transport = new RedisTransport({ url: process.env.REDIS_URL });

// Graceful shutdown
process.on("SIGTERM", async () => {
  await subscriber.unsubscribe();
  await transport.disconnect();
  process.exit(0);
});
```

### Message Durability

Redis Pub/Sub doesn't persist messages. For durability, consider:

1. **Redis Streams** for message persistence
2. **Dead letter queues** for failed messages
3. **Idempotency middleware** for message deduplication

```typescript
const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    createIdempotencyMiddleware({
      hasProcessed: async (id) => redis.exists(`processed:${id}`),
      markProcessed: async (id) => redis.setex(`processed:${id}`, 86400, "1"),
    }),
  ],
});
```

### Monitoring

```typescript
// Monitor Redis connection
transport.on("connect", ({}) => {
  metrics.gauge("redis_connected", 1);
});

transport.on("disconnect", ({}) => {
  metrics.gauge("redis_connected", 0);
});

transport.on("error", ({ error }) => {
  metrics.counter("redis_errors", 1);
  logger.error("Redis error:", error);
});
```

## Limitations

- **No message persistence**: Messages are lost if no subscriber is listening
- **No message ordering**: Messages may arrive out of order under high load
- **No acknowledgments**: No built-in delivery confirmation

For these features, consider using Redis Streams or a dedicated message queue.

## Next Steps

- [WebSocket Transport](/transports/websocket/) - Real-time browser apps
- [SSE Transport](/transports/sse/) - Server-to-client streaming
- [Middleware](/concepts/middleware/) - Add idempotency and more
