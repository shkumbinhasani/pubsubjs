---
title: React Setup
description: Set up PubSubJS in your React application
---

The `@pubsubjs/react` package provides React hooks and utilities for using PubSubJS in React applications.

## Installation

```bash
bun add @pubsubjs/core @pubsubjs/react
```

## Basic Setup

### 1. Define Events

```typescript
// events.ts
import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

export const events = defineEvent([
  {
    name: "notification.received",
    schema: z.object({
      id: z.string(),
      message: z.string(),
      type: z.enum(["info", "warning", "error"]),
    }),
  },
  {
    name: "user.statusChanged",
    schema: z.object({
      userId: z.string(),
      status: z.enum(["online", "offline", "away"]),
    }),
  },
]);

export type Events = typeof events;
```

### 2. Create PubSub Instance

```typescript
// pubsub.ts
import { createPubSub } from "@pubsubjs/react";
import { WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { events } from "./events";

const transport = new WebSocketClientTransport({
  url: "ws://localhost:8080",
});

export const { useSubscribe, usePublish } = createPubSub({
  events,
  transport,
});
```

### 3. Use Hooks

```tsx
// NotificationList.tsx
import { useState } from "react";
import { useSubscribe, usePublish } from "./pubsub";

export function NotificationList() {
  const [notifications, setNotifications] = useState([]);

  // Subscribe to events
  useSubscribe(
    "notification.received",
    (payload) => {
      setNotifications((prev) => [...prev, payload]);
    },
    []
  );

  // Publish events
  const { publish } = usePublish();

  const sendNotification = () => {
    publish("notification.received", {
      id: crypto.randomUUID(),
      message: "Hello from React!",
      type: "info",
    });
  };

  return (
    <div>
      <button onClick={sendNotification}>Send Notification</button>
      <ul>
        {notifications.map((n) => (
          <li key={n.id}>{n.message}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Configuration Options

```typescript
const { useSubscribe, usePublish } = createPubSub({
  // Required: Event definitions
  events,

  // Required: Transport
  transport,

  // Optional: Skip validation (dangerous!)
  skipValidation: false,
});
```

## TypeScript Support

The hooks are fully typed:

```tsx
// TypeScript knows the payload type
useSubscribe(
  "notification.received",
  (payload) => {
    // payload.message is typed as string
    console.log(payload.message);

    // TypeScript error: Property 'invalid' does not exist
    console.log(payload.invalid);
  },
  []
);

// TypeScript enforces correct payload
const { publish } = usePublish();

// OK
publish("notification.received", {
  id: "1",
  message: "Hello",
  type: "info",
});

// TypeScript error: missing 'type'
publish("notification.received", {
  id: "1",
  message: "Hello",
});
```

## Next Steps

- [Hooks](/react/hooks/) - Detailed hook documentation
- [Examples](/react/examples/) - Real-world examples
