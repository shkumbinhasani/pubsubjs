---
title: Attributes & Filtering
description: Attach attributes to events and filter subscriptions
---

Attributes are lightweight, index-like fields attached to events to support filtering without inspecting the payload. They are optional and can be strongly typed with an `attributesSchema`.

## Define Attributes

Use `attributesSchema` in your event definition to type attributes:

```typescript
import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

export const events = defineEvent([
  {
    name: "order.created",
    schema: z.object({
      orderId: z.string(),
      total: z.number(),
    }),
    attributesSchema: z.object({
      userId: z.string(),
      region: z.string(),
      amount: z.number(),
    }),
  },
]);
```

## Publish With Attributes

Pass attributes in the publish options:

```typescript
await publisher.publish("order.created", payload, {
  attributes: {
    userId: "user-123",
    region: "us-east-1",
    amount: 120,
  },
});
```

## Filter Subscriptions

Provide a filter when registering the handler:

```typescript
subscriber.on(
  "order.created",
  (payload) => {
    console.log("Matched order:", payload.orderId);
  },
  {
    filter: {
      userId: "user-123",
      amount: { $gte: 100 },
    },
  }
);
```

## Operators

Supported filter operators:

```typescript
{
  userId: "user-123",            // exact match
  status: { $in: ["active", "pending"] },
  deletedAt: { $exists: false },
  eventType: { $prefix: "order." },
  amount: { $ne: 0 },
  score: { $gt: 50 },
  score: { $gte: 50 },
  score: { $lt: 100 },
  score: { $lte: 100 },
  price: { $between: [10, 50] },
}
```

Semantics:

- Multiple keys are **AND**
- Multiple conditions on the same key are **OR**

## Nested Attributes

You can filter nested attributes with dot notation:

```typescript
attributesSchema: z.object({
  user: z.object({ id: z.string() }),
}),

// Filter
filter: { "user.id": "user-123" }
```

## Notes

- If a filter is provided and no attributes exist on a message, it will not match.
- Filters are per-handler. Each handler registered with `on()` can have its own independent filter policy, evaluated before the handler runs.
- Multiple handlers on the same event can have different filters — only matching handlers are invoked.

## Next Steps

- [Events & Schemas](/concepts/events/) - Define events and schemas
- [Subscriber](/concepts/subscriber/) - Subscribe to events
