---
title: Events & Schemas
description: Define type-safe events with schema validation
---

Events are the foundation of PubSubJS. They define what messages can be sent and received in your application.

## Defining Events

Use `defineEvent` to create a type-safe event registry:

```typescript
import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

const events = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: z.string(),
      email: z.string().email(),
      createdAt: z.string().datetime(),
    }),
  },
  {
    name: "user.updated",
    schema: z.object({
      userId: z.string(),
      changes: z.record(z.unknown()),
    }),
  },
  {
    name: "user.deleted",
    schema: z.object({
      userId: z.string(),
      deletedAt: z.string().datetime(),
    }),
  },
]);
```

## Schema Validation

PubSubJS validates payloads using [Standard Schema](https://github.com/standard-schema/standard-schema), which means you can use:

- **Zod** - Most popular, great TypeScript inference
- **Valibot** - Smaller bundle size
- **ArkType** - Runtime performance focused

### With Zod

```typescript
import { z } from "zod";

const events = defineEvent([
  {
    name: "order.placed",
    schema: z.object({
      orderId: z.string().uuid(),
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        price: z.number().positive(),
      })),
      total: z.number().positive(),
    }),
  },
]);
```

### With Valibot

```typescript
import * as v from "valibot";

const events = defineEvent([
  {
    name: "order.placed",
    schema: v.object({
      orderId: v.pipe(v.string(), v.uuid()),
      items: v.array(v.object({
        productId: v.string(),
        quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
        price: v.pipe(v.number(), v.minValue(0)),
      })),
      total: v.pipe(v.number(), v.minValue(0)),
    }),
  },
]);
```

## Event Options

Events can have additional options:

```typescript
const events = defineEvent([
  {
    name: "user.created",
    schema: userSchema,
    options: {
      // Custom channel name (defaults to event name)
      channel: "users",
      // Description for documentation
      description: "Emitted when a new user is created",
    },
  },
]);
```

## Type Inference

TypeScript automatically infers types from your event definitions:

```typescript
import type { EventNames, EventPayload } from "@pubsubjs/core";

type Events = typeof events;

// Get all event names as a union type
type AllEventNames = EventNames<Events>;
// => "user.created" | "user.updated" | "user.deleted"

// Get the payload type for a specific event
type UserCreatedPayload = EventPayload<Events, "user.created">;
// => { userId: string; email: string; createdAt: string }
```

## Validation Errors

When validation fails, a `ValidationError` is thrown:

```typescript
import { ValidationError } from "@pubsubjs/core";

try {
  await publisher.publish("user.created", {
    userId: 123, // Should be string
    email: "not-an-email",
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log("Validation failed:", error.issues);
    // [
    //   { path: ["userId"], message: "Expected string, received number" },
    //   { path: ["email"], message: "Invalid email" }
    // ]
  }
}
```

## Skipping Validation

In trusted environments (e.g., internal microservices), you can skip validation for performance:

```typescript
const publisher = new Publisher({
  events,
  transport,
  skipValidation: true, // Dangerous! Only use in trusted environments
});
```

:::caution
Skipping validation removes runtime type safety. Only use this when you're certain the data is valid.
:::

## Event Naming Conventions

We recommend using dot-notation for event names:

```typescript
// Good: Clear hierarchy
"user.created"
"user.profile.updated"
"order.payment.completed"

// Avoid: No clear structure
"userCreated"
"USER_CREATED"
"createUser"
```

## Organizing Events

For larger applications, organize events by domain:

```typescript
// events/user.ts
export const userEvents = defineEvent([
  { name: "user.created", schema: userCreatedSchema },
  { name: "user.updated", schema: userUpdatedSchema },
]);

// events/order.ts
export const orderEvents = defineEvent([
  { name: "order.placed", schema: orderPlacedSchema },
  { name: "order.shipped", schema: orderShippedSchema },
]);

// events/index.ts
import { userEvents } from "./user";
import { orderEvents } from "./order";

export const events = {
  ...userEvents,
  ...orderEvents,
};
```

## Next Steps

- [Publisher](/concepts/publisher/) - Learn how to publish events
- [Subscriber](/concepts/subscriber/) - Learn how to subscribe to events
- [Middleware](/concepts/middleware/) - Add cross-cutting concerns
