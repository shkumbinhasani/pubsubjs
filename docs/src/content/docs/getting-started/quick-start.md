---
title: Quick Start
description: Build your first PubSubJS application
---

This guide walks you through building a simple real-time notification system.

## Prerequisites

Make sure you have:
- Node.js 18+ or Bun
- TypeScript configured in your project
- PubSubJS packages installed (see [Installation](/getting-started/installation/))

## Step 1: Define Events

First, define the events your application will use:

```typescript
// events.ts
import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

export const events = defineEvent([
  {
    name: "notification.created",
    schema: z.object({
      id: z.string(),
      userId: z.string(),
      title: z.string(),
      message: z.string(),
      type: z.enum(["info", "warning", "error"]),
      createdAt: z.string().datetime(),
    }),
  },
  {
    name: "notification.read",
    schema: z.object({
      id: z.string(),
      userId: z.string(),
      readAt: z.string().datetime(),
    }),
  },
]);

// TypeScript infers the event types automatically
export type Events = typeof events;
```

## Step 2: Create a Transport

Choose a transport based on your use case. For this example, we'll use WebSocket:

```typescript
// server.ts
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";

const transport = new WebSocketServerTransport({
  port: 8080,
});

console.log("WebSocket server running on ws://localhost:8080");
```

## Step 3: Set Up the Publisher

Create a publisher to send events:

```typescript
// publisher.ts
import { Publisher } from "@pubsubjs/core";
import { events } from "./events";

export function createNotificationPublisher(transport) {
  const publisher = new Publisher({
    events,
    transport,
  });

  return {
    async sendNotification(userId: string, title: string, message: string, type: "info" | "warning" | "error") {
      await publisher.publish("notification.created", {
        id: crypto.randomUUID(),
        userId,
        title,
        message,
        type,
        createdAt: new Date().toISOString(),
      });
    },

    async markAsRead(id: string, userId: string) {
      await publisher.publish("notification.read", {
        id,
        userId,
        readAt: new Date().toISOString(),
      });
    },
  };
}
```

## Step 4: Set Up the Subscriber

Create a subscriber to receive events:

```typescript
// subscriber.ts
import { Subscriber } from "@pubsubjs/core";
import { events } from "./events";

export function createNotificationSubscriber(transport) {
  const subscriber = new Subscriber({
    events,
    transport,
    onError: (error, eventName, payload) => {
      console.error(`Error handling ${eventName}:`, error);
    },
  });

  subscriber.on("notification.created", (payload, { ctx }) => {
    console.log(`[${ctx.messageId}] New notification for user ${payload.userId}:`);
    console.log(`  ${payload.type.toUpperCase()}: ${payload.title}`);
    console.log(`  ${payload.message}`);
  });

  subscriber.on("notification.read", (payload) => {
    console.log(`Notification ${payload.id} marked as read by user ${payload.userId}`);
  });

  return subscriber;
}
```

## Step 5: Put It Together

```typescript
// main.ts
import { WebSocketServerTransport } from "@pubsubjs/transport-websocket";
import { events } from "./events";
import { createNotificationPublisher } from "./publisher";
import { createNotificationSubscriber } from "./subscriber";

async function main() {
  // Create transport
  const transport = new WebSocketServerTransport({ port: 8080 });

  // Create publisher and subscriber
  const notifications = createNotificationPublisher(transport);
  const subscriber = createNotificationSubscriber(transport);

  // Start subscribing
  await subscriber.subscribe();
  console.log("Notification system ready!");

  // Send a test notification
  await notifications.sendNotification(
    "user-123",
    "Welcome!",
    "Thanks for trying PubSubJS",
    "info"
  );

  // Mark it as read after 2 seconds
  setTimeout(async () => {
    await notifications.markAsRead("notif-1", "user-123");
  }, 2000);
}

main().catch(console.error);
```

## Step 6: Run It

```bash
bun main.ts
```

You should see:

```
WebSocket server running on ws://localhost:8080
Notification system ready!
[abc123] New notification for user user-123:
  INFO: Welcome!
  Thanks for trying PubSubJS
Notification notif-1 marked as read by user user-123
```

## Adding Middleware

Enhance your subscriber with middleware:

```typescript
import {
  Subscriber,
  createSubscriberLoggingMiddleware,
  createRateLimitMiddleware,
} from "@pubsubjs/core";

const subscriber = new Subscriber({
  events,
  transport,
  middleware: [
    createSubscriberLoggingMiddleware(),
    createRateLimitMiddleware({
      maxEvents: 100,
      windowMs: 1000,
      onLimit: (eventName) => {
        console.warn(`Rate limit exceeded for ${eventName}`);
      },
    }),
  ],
});
```

## Next Steps

- [Events & Schemas](/concepts/events/) - Learn more about event definitions
- [Middleware](/concepts/middleware/) - Add logging, rate limiting, and more
- [Transports](/transports/overview/) - Explore different transport options
- [React Integration](/react/setup/) - Use PubSubJS in React applications
