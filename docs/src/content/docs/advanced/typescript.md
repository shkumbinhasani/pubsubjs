---
title: TypeScript
description: Leverage TypeScript for maximum type safety
---

PubSubJS is built with TypeScript and provides comprehensive type inference.

## Type Inference

### Event Types

Event definitions automatically infer types:

```typescript
import { defineEvent, type EventNames, type EventPayload } from "@pubsubjs/core";
import { z } from "zod";

const events = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: z.string(),
      email: z.string().email(),
    }),
  },
  {
    name: "order.placed",
    schema: z.object({
      orderId: z.string(),
      total: z.number(),
    }),
  },
]);

// Extract event types
type Events = typeof events;

// Get all event names as union
type AllEventNames = EventNames<Events>;
// => "user.created" | "order.placed"

// Get payload type for specific event
type UserCreatedPayload = EventPayload<Events, "user.created">;
// => { userId: string; email: string }

type OrderPlacedPayload = EventPayload<Events, "order.placed">;
// => { orderId: string; total: number }
```

### Publisher Type Safety

```typescript
const publisher = new Publisher({ events, transport });

// Type-checked event names
await publisher.publish("user.created", payload); // OK
await publisher.publish("typo", payload);         // Error!

// Type-checked payloads
await publisher.publish("user.created", {
  userId: "123",
  email: "test@example.com",
}); // OK

await publisher.publish("user.created", {
  userId: 123,                    // Error: number not string
  email: "test@example.com",
});

await publisher.publish("user.created", {
  userId: "123",
  // Error: missing email
});
```

### Subscriber Type Safety

```typescript
const subscriber = new Subscriber({ events, transport });

// Handler payload is typed
subscriber.on("user.created", (payload) => {
  payload.userId;   // string
  payload.email;    // string
  payload.invalid;  // Error: Property does not exist
});

// Context is typed
subscriber.on("user.created", (payload, { ctx }) => {
  ctx.messageId;    // string
  ctx.timestamp;    // Date
});
```

## Generic Constraints

### Custom Context Types

```typescript
interface MyContext {
  messageId: string;
  timestamp: Date;
  userId: string;
  roles: string[];
}

const subscriber = new Subscriber<typeof events, MyContext>({
  events,
  transport,
  contextFactory: (metadata) => ({
    messageId: metadata.messageId,
    timestamp: new Date(),
    userId: metadata.userId as string,
    roles: (metadata.roles as string[]) || [],
  }),
});

subscriber.on("user.created", (payload, { ctx }) => {
  ctx.userId;  // string
  ctx.roles;   // string[]
});
```

### Typed Middleware

```typescript
import type { SubscribeMiddleware } from "@pubsubjs/core";

// Middleware with typed events and context
const myMiddleware: SubscribeMiddleware<typeof events, MyContext> = async (
  eventName,  // "user.created" | "order.placed"
  payload,    // unknown (validated by the time it reaches handler)
  context,    // MyContext
  next
) => {
  console.log(`User ${context.userId} processing ${eventName}`);
  await next();
};
```

## Utility Types

### Creating Type-Safe Event Maps

```typescript
import type { HandlerMap } from "@pubsubjs/core";

// Type-safe handler map
const handlers: HandlerMap<typeof events> = {
  "user.created": (payload) => {
    // payload is typed as { userId: string; email: string }
  },
  "order.placed": (payload) => {
    // payload is typed as { orderId: string; total: number }
  },
};

subscriber.onMany(handlers);
```

### Publisher Interface

```typescript
import type { PublisherInterface, EventRegistry } from "@pubsubjs/core";

// Use in dependency injection
class NotificationService {
  constructor(private publisher: PublisherInterface<typeof events>) {}

  async notifyUserCreated(userId: string, email: string) {
    await this.publisher.publish("user.created", { userId, email });
  }
}
```

## Schema Types

### Extracting Schema Types

```typescript
import { z } from "zod";
import type { InferOutput } from "@pubsubjs/core";

const userSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  profile: z.object({
    name: z.string(),
    age: z.number().optional(),
  }),
});

// Extract type from schema
type User = InferOutput<typeof userSchema>;
// => { userId: string; email: string; profile: { name: string; age?: number } }
```

### Standard Schema Support

PubSubJS works with any Standard Schema compatible library:

```typescript
// Zod
import { z } from "zod";
const zodSchema = z.object({ name: z.string() });

// Valibot
import * as v from "valibot";
const valibotSchema = v.object({ name: v.string() });

// Both work with defineEvent
const events = defineEvent([
  { name: "event1", schema: zodSchema },
  { name: "event2", schema: valibotSchema },
]);
```

## Advanced Patterns

### Discriminated Unions

```typescript
const events = defineEvent([
  {
    name: "notification",
    schema: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("email"),
        to: z.string().email(),
        subject: z.string(),
      }),
      z.object({
        type: z.literal("sms"),
        phone: z.string(),
        message: z.string(),
      }),
      z.object({
        type: z.literal("push"),
        deviceId: z.string(),
        title: z.string(),
      }),
    ]),
  },
]);

subscriber.on("notification", (payload) => {
  // TypeScript narrows the type based on discriminator
  if (payload.type === "email") {
    payload.to;      // string (email)
    payload.subject; // string
  } else if (payload.type === "sms") {
    payload.phone;   // string
    payload.message; // string
  } else {
    payload.deviceId; // string
    payload.title;    // string
  }
});
```

### Branded Types

```typescript
import { z } from "zod";

// Create branded types for type safety
const UserId = z.string().brand("UserId");
const OrderId = z.string().brand("OrderId");

type UserId = z.infer<typeof UserId>;
type OrderId = z.infer<typeof OrderId>;

const events = defineEvent([
  {
    name: "order.placed",
    schema: z.object({
      orderId: OrderId,
      userId: UserId,
      total: z.number(),
    }),
  },
]);

// Type-safe IDs
const userId: UserId = "user-123" as UserId;
const orderId: OrderId = "order-456" as OrderId;

// Can't mix up IDs
await publisher.publish("order.placed", {
  orderId: userId,  // Error! UserId is not OrderId
  userId: orderId,  // Error! OrderId is not UserId
  total: 99.99,
});
```

### Module Augmentation

Extend PubSubJS types:

```typescript
// types.d.ts
declare module "@pubsubjs/core" {
  interface TransportMetadata {
    userId?: string;
    traceId?: string;
    source?: string;
  }
}
```

## Next Steps

- [Testing](/advanced/testing/) - Test typed code
- [Events & Schemas](/concepts/events/) - Schema validation
