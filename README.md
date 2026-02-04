<p align="center">
  <img src="https://i.imgur.com/F5nNu5k.jpeg" alt="PubSubJS" width="600" />
</p>

# @pubsubjs

Type-safe, schema-validated pub/sub library with middleware support.

## Packages

| Package | Description |
|---------|-------------|
| [@pubsubjs/core](./packages/core) | Core pub/sub functionality with middleware support |
| [@pubsubjs/transport-websocket](./packages/transport-websocket) | WebSocket transport (client & server) |
| [@pubsubjs/transport-redis](./packages/transport-redis) | Redis transport for horizontal scaling |
| [@pubsubjs/transport-sse](./packages/transport-sse) | Server-Sent Events transport |
| [@pubsubjs/react](./packages/react) | React hooks and bindings |

## Installation

```bash
bun add @pubsubjs/core @pubsubjs/transport-websocket zod
```

## Quick Start

```typescript
import { defineEvents, Publisher, Subscriber } from "@pubsubjs/core";
import { WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { z } from "zod";

// Define type-safe events
const events = defineEvents({
  "chat.message": {
    schema: z.object({
      userId: z.string(),
      message: z.string(),
    }),
  },
});

// Create transport
const transport = new WebSocketClientTransport({ url: "ws://localhost:3000/ws" });

// Publisher
const publisher = new Publisher({ events, transport });
await publisher.publish("chat.message", { userId: "1", message: "Hello!" });

// Subscriber
const subscriber = new Subscriber({ events, transport });
subscriber.on("chat.message", (payload, ctx) => {
  console.log(`${payload.userId}: ${payload.message}`);
});
await subscriber.subscribe();
```

## Features

- **Type-safe events** - Full TypeScript support with inferred types
- **Schema validation** - Zod, Valibot, or any Standard Schema compatible library
- **Middleware** - Logging, timing, rate limiting, idempotency
- **Multiple transports** - WebSocket, Redis, SSE
- **React integration** - Hooks for easy React integration

## Documentation

Visit the docs at https://pubsubjs.shkumbinhsn.com/

## Examples

See the [examples](./examples) directory for complete examples:

- [Basic Usage](./examples/basic-usage)
- [Chat WebSocket](./examples/chat-websocket)
- [Scalable WebSocket](./examples/scalable-websocket) - Horizontal scaling with Redis
- [Microservices Redis](./examples/microservices-redis)
- [SSE Notifications](./examples/sse-notifications)
- [React Example](./examples/react-example)

## License

MIT
