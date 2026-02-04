---
title: Testing
description: Test PubSubJS applications effectively
---

Learn how to test publishers, subscribers, and middleware.

## Test Setup

Create a test transport for isolated testing:

```typescript
// test-utils.ts
import { BaseTransport } from "@pubsubjs/core";
import type { TransportMessageHandler, UnsubscribeFn } from "@pubsubjs/core";

export class TestTransport extends BaseTransport {
  private handlers = new Map<string, Set<TransportMessageHandler>>();
  public publishedMessages: Array<{ channel: string; payload: unknown }> = [];

  constructor() {
    super({
      canPublish: true,
      canSubscribe: true,
      bidirectional: true,
      supportsTargeting: false,
      supportsChannels: true,
    });
  }

  async connect() {
    this.setState("connected");
  }

  async disconnect() {
    this.handlers.clear();
    this.setState("disconnected");
  }

  async publish(channel: string, payload: unknown) {
    this.publishedMessages.push({ channel, payload });

    // Deliver to subscribers
    const handlers = this.handlers.get(channel);
    if (handlers) {
      const message = {
        channel,
        payload,
        messageId: crypto.randomUUID(),
      };
      for (const handler of handlers) {
        await handler(message);
      }
    }
  }

  async subscribe(channel: string, handler: TransportMessageHandler): Promise<UnsubscribeFn> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);

    return () => {
      this.handlers.get(channel)?.delete(handler);
    };
  }

  // Test helper: simulate incoming message
  simulateMessage(channel: string, payload: unknown) {
    const handlers = this.handlers.get(channel);
    if (handlers) {
      const message = {
        channel,
        payload,
        messageId: crypto.randomUUID(),
      };
      for (const handler of handlers) {
        handler(message);
      }
    }
  }

  // Test helper: clear state
  reset() {
    this.publishedMessages = [];
    this.handlers.clear();
  }
}
```

## Testing Publishers

```typescript
import { test, expect } from "bun:test";
import { Publisher } from "@pubsubjs/core";
import { z } from "zod";
import { TestTransport } from "./test-utils";

const events = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: z.string(),
      email: z.string().email(),
    }),
  },
]);

test("publisher sends events", async () => {
  const transport = new TestTransport();
  const publisher = new Publisher({ events, transport });

  await publisher.publish("user.created", {
    userId: "123",
    email: "test@example.com",
  });

  expect(transport.publishedMessages).toHaveLength(1);
  expect(transport.publishedMessages[0]).toEqual({
    channel: "user.created",
    payload: { userId: "123", email: "test@example.com" },
  });
});

test("publisher validates payloads", async () => {
  const transport = new TestTransport();
  const publisher = new Publisher({ events, transport });

  await expect(
    publisher.publish("user.created", {
      userId: "123",
      email: "not-an-email",
    })
  ).rejects.toThrow();
});
```

## Testing Subscribers

```typescript
import { test, expect, mock } from "bun:test";
import { Subscriber } from "@pubsubjs/core";
import { TestTransport } from "./test-utils";

test("subscriber receives events", async () => {
  const transport = new TestTransport();
  const subscriber = new Subscriber({ events, transport });

  const handler = mock(() => {});
  subscriber.on("user.created", handler);
  await subscriber.subscribe();

  transport.simulateMessage("user.created", {
    userId: "123",
    email: "test@example.com",
  });

  // Wait for async handler
  await new Promise((r) => setTimeout(r, 10));

  expect(handler).toHaveBeenCalledWith(
    { userId: "123", email: "test@example.com" },
    expect.objectContaining({ ctx: expect.any(Object) })
  );
});

test("subscriber validates incoming messages", async () => {
  const transport = new TestTransport();
  const errors: Error[] = [];

  const subscriber = new Subscriber({
    events,
    transport,
    onError: (error) => errors.push(error),
  });

  const handler = mock(() => {});
  subscriber.on("user.created", handler);
  await subscriber.subscribe();

  // Send invalid message
  transport.simulateMessage("user.created", { invalid: "data" });

  await new Promise((r) => setTimeout(r, 10));

  expect(handler).not.toHaveBeenCalled();
  expect(errors).toHaveLength(1);
});
```

## Testing Middleware

```typescript
import { test, expect, mock } from "bun:test";
import {
  Subscriber,
  createSubscriberLoggingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
} from "@pubsubjs/core";
import { TestTransport } from "./test-utils";

test("middleware executes in order", async () => {
  const transport = new TestTransport();
  const order: string[] = [];

  const middleware1 = async (_e, _p, _c, next) => {
    order.push("mw1-before");
    await next();
    order.push("mw1-after");
  };

  const middleware2 = async (_e, _p, _c, next) => {
    order.push("mw2-before");
    await next();
    order.push("mw2-after");
  };

  const subscriber = new Subscriber({
    events,
    transport,
    middleware: [middleware1, middleware2],
  });

  subscriber.on("user.created", () => order.push("handler"));
  await subscriber.subscribe();

  transport.simulateMessage("user.created", {
    userId: "123",
    email: "test@example.com",
  });

  await new Promise((r) => setTimeout(r, 10));

  expect(order).toEqual([
    "mw1-before",
    "mw2-before",
    "handler",
    "mw2-after",
    "mw1-after",
  ]);
});

test("idempotency middleware prevents duplicates", async () => {
  const transport = new TestTransport();
  const processedIds = new Set<string>();

  const subscriber = new Subscriber({
    events,
    transport,
    middleware: [
      createIdempotencyMiddleware({
        hasProcessed: (id) => processedIds.has(id),
        markProcessed: (id) => processedIds.add(id),
      }),
    ],
  });

  const handler = mock(() => {});
  subscriber.on("user.created", handler);
  await subscriber.subscribe();

  // Simulate same message twice
  const message = { userId: "123", email: "test@example.com" };
  transport.simulateMessage("user.created", message);
  await new Promise((r) => setTimeout(r, 10));

  transport.simulateMessage("user.created", message);
  await new Promise((r) => setTimeout(r, 10));

  // Handler should only be called once
  expect(handler).toHaveBeenCalledTimes(1);
});

test("rate limit middleware enforces limits", async () => {
  const transport = new TestTransport();
  const limitedEvents: string[] = [];

  const subscriber = new Subscriber({
    events,
    transport,
    middleware: [
      createRateLimitMiddleware({
        maxEvents: 2,
        windowMs: 1000,
        onLimit: (eventName) => limitedEvents.push(eventName),
      }),
    ],
  });

  const handler = mock(() => {});
  subscriber.on("user.created", handler);
  await subscriber.subscribe();

  // Send 4 messages quickly
  for (let i = 0; i < 4; i++) {
    transport.simulateMessage("user.created", {
      userId: `${i}`,
      email: `test${i}@example.com`,
    });
    await new Promise((r) => setTimeout(r, 10));
  }

  expect(handler).toHaveBeenCalledTimes(2);
  expect(limitedEvents).toHaveLength(2);
});
```

## Testing React Components

```tsx
import { render, screen, act } from "@testing-library/react";
import { test, expect } from "bun:test";
import { TestTransport } from "./test-utils";
import { createPubSub } from "@pubsubjs/react";

const transport = new TestTransport();
const { useSubscribe, PubSubProvider } = createPubSub({
  events,
  transport,
});

function TestComponent() {
  const [messages, setMessages] = useState([]);

  useSubscribe("user.created", (payload) => {
    setMessages((prev) => [...prev, payload]);
  });

  return (
    <ul>
      {messages.map((m, i) => (
        <li key={i}>{m.email}</li>
      ))}
    </ul>
  );
}

test("component receives events", async () => {
  render(
    <PubSubProvider>
      <TestComponent />
    </PubSubProvider>
  );

  await act(async () => {
    transport.simulateMessage("user.created", {
      userId: "123",
      email: "test@example.com",
    });
    await new Promise((r) => setTimeout(r, 10));
  });

  expect(screen.getByText("test@example.com")).toBeDefined();
});
```

## Integration Testing

Test with real transports:

```typescript
import { test, expect, beforeAll, afterAll } from "bun:test";
import { WebSocketServerTransport, WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { Publisher, Subscriber } from "@pubsubjs/core";

let serverTransport: WebSocketServerTransport;
let clientTransport: WebSocketClientTransport;

beforeAll(async () => {
  serverTransport = new WebSocketServerTransport({ port: 9999 });
  clientTransport = new WebSocketClientTransport({ url: "ws://localhost:9999" });
});

afterAll(async () => {
  await clientTransport.disconnect();
  await serverTransport.disconnect();
});

test("end-to-end messaging", async () => {
  const publisher = new Publisher({ events, transport: serverTransport });
  const subscriber = new Subscriber({ events, transport: clientTransport });

  const received: unknown[] = [];
  subscriber.on("user.created", (payload) => {
    received.push(payload);
  });

  await subscriber.subscribe();

  await publisher.publish("user.created", {
    userId: "123",
    email: "test@example.com",
  });

  // Wait for message delivery
  await new Promise((r) => setTimeout(r, 100));

  expect(received).toHaveLength(1);
});
```

## Next Steps

- [TypeScript](/advanced/typescript/) - Type system integration
- [Error Handling](/advanced/error-handling/) - Test error scenarios
