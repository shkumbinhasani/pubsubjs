import { test, expect, describe } from "bun:test";
import { Publisher, Subscriber, PubSub, defineEvent } from "./index";
import { WebSocketServerTransport } from "../../transport-websocket/src/index";
import { MemoryTransport } from "../../react/src/index";

// Test with Zod-like validation (simulated)
function createZodLikeSchema<T>(
  validator: (value: unknown) => { success: boolean; data?: T; error?: Error }
) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "zod",
      validate: (value: unknown) => {
        const result = validator(value);
        if (result.success) {
          return { value: result.data as T };
        }
        return {
          issues: [{ message: result.error?.message ?? "Validation failed" }],
        };
      },
      types: {} as { input: T; output: T },
    },
  };
}

// Example schemas
const userCreatedSchema = createZodLikeSchema<{
  userId: string;
  email: string;
  name: string;
}>((value) => {
  if (typeof value !== "object" || value === null) {
    return { success: false, error: new Error("Expected object") };
  }
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.userId === "string" &&
    typeof obj.email === "string" &&
    typeof obj.name === "string"
  ) {
    return {
      success: true,
      data: { userId: obj.userId, email: obj.email, name: obj.name },
    };
  }
  return { success: false, error: new Error("Invalid user data") };
});

const orderPlacedSchema = createZodLikeSchema<{
  orderId: string;
  userId: string;
  total: number;
}>((value) => {
  if (typeof value !== "object" || value === null) {
    return { success: false, error: new Error("Expected object") };
  }
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.orderId === "string" &&
    typeof obj.userId === "string" &&
    typeof obj.total === "number"
  ) {
    return {
      success: true,
      data: { orderId: obj.orderId, userId: obj.userId, total: obj.total },
    };
  }
  return { success: false, error: new Error("Invalid order data") };
});

// Define events
const UserEvents = defineEvent([
  { 
    name: "user.created", 
    schema: userCreatedSchema,
    description: "Emitted when a new user is created",
  },
]);

const OrderEvents = defineEvent([
  { 
    name: "order.placed", 
    schema: orderPlacedSchema,
    description: "Emitted when an order is placed",
  },
]);

const AllEvents = { ...UserEvents, ...OrderEvents };

describe("Integration: Publisher/Subscriber Pattern", () => {
  test("publisher and subscriber communicate via memory transport", async () => {
    const transport = new MemoryTransport();
    const received: Array<{ userId: string; email: string; name: string }> = [];

    const publisher = new Publisher({
      events: UserEvents,
      transport,
    });

    const subscriber = new Subscriber({
      events: UserEvents,
      transport,
    });

    subscriber.on("user.created", (payload) => { received.push(payload!); });

    await subscriber.subscribe();

    await publisher.publish("user.created", {
      userId: "user-1",
      email: "john@example.com",
      name: "John Doe",
    });

    expect(received.length).toBe(1);
    expect(received[0]!.name).toBe("John Doe");

    await subscriber.unsubscribe();
    await publisher.disconnect();
  });

  test("multiple subscribers receive same event", async () => {
    const transport = new MemoryTransport();
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    const publisher = new Publisher({
      events: UserEvents,
      transport,
    });

    const subscriber1 = new Subscriber({
      events: UserEvents,
      transport,
    });

    const subscriber2 = new Subscriber({
      events: UserEvents,
      transport,
    });

    subscriber1.on("user.created", (p) => { received1.push(p); });
    subscriber2.on("user.created", (p) => { received2.push(p); });

    await subscriber1.subscribe();
    await subscriber2.subscribe();

    await publisher.publish("user.created", {
      userId: "user-2",
      email: "jane@example.com",
      name: "Jane Doe",
    });

    expect(received1.length).toBe(1);
    expect(received2.length).toBe(1);

    await subscriber1.unsubscribe();
    await subscriber2.unsubscribe();
    await publisher.disconnect();
  });
});

describe("Integration: Bidirectional PubSub", () => {
  test("PubSub allows publish and subscribe on same instance", async () => {
    const transport = new MemoryTransport();

    const pubsub = new PubSub({
      publishEvents: AllEvents,
      subscribeEvents: AllEvents,
      transport,
    });

    const receivedUsers: unknown[] = [];
    const receivedOrders: unknown[] = [];

    pubsub.on("user.created", (p) => { receivedUsers.push(p); });
    pubsub.on("order.placed", (p) => { receivedOrders.push(p); });

    await pubsub.start();

    await pubsub.publish("user.created", {
      userId: "u1",
      email: "test@test.com",
      name: "Test",
    });

    await pubsub.publish("order.placed", {
      orderId: "o1",
      userId: "u1",
      total: 99.99,
    });

    expect(receivedUsers.length).toBe(1);
    expect(receivedOrders.length).toBe(1);

    await pubsub.stop();
  });

  test("handler can reply using publisher", async () => {
    const transport = new MemoryTransport();
    const replies: unknown[] = [];

    const pubsub = new PubSub({
      publishEvents: AllEvents,
      subscribeEvents: AllEvents,
      transport,
    });

    pubsub.on("user.created", async (payload, { publisher }) => {
      // When a user is created, automatically create a welcome order
      await publisher.publish("order.placed", {
        orderId: "welcome-order",
        userId: payload!.userId,
        total: 0,
      });
    });

    pubsub.on("order.placed", (p) => { replies.push(p); });

    await pubsub.start();

    await pubsub.publish("user.created", {
      userId: "new-user",
      email: "new@user.com",
      name: "New User",
    });

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 50));

    expect(replies.length).toBe(1);
    expect((replies[0] as { orderId: string }).orderId).toBe("welcome-order");

    await pubsub.stop();
  });
});

describe("Integration: WebSocket Server", () => {
  test("server handles pub/sub with real WebSocket clients", async () => {
    const server = new WebSocketServerTransport({ port: 0 });
    await server.connect();

    const serverReceived: unknown[] = [];
    await server.subscribe("messages", (msg) => { serverReceived.push(msg.payload); });

    // Connect client
    const client = new WebSocket(`ws://localhost:${server.port}/ws`);
    const clientReceived: unknown[] = [];

    await new Promise<void>((resolve) => {
      client.onopen = () => resolve();
    });

    client.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.type === "message") {
        clientReceived.push(msg.payload);
      }
    };

    // Client subscribes and sends a message
    client.send(JSON.stringify({ type: "subscribe", channel: "messages" }));
    await new Promise((r) => setTimeout(r, 50));

    client.send(
      JSON.stringify({
        type: "publish",
        channel: "messages",
        payload: { text: "Hello from client" },
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(serverReceived.length).toBe(1);
    expect((serverReceived[0] as { text: string }).text).toBe("Hello from client");

    // Server responds
    await server.publish("messages", { text: "Hello from server" });

    await new Promise((r) => setTimeout(r, 100));

    expect(clientReceived.length).toBe(1);
    expect((clientReceived[0] as { text: string }).text).toBe("Hello from server");

    client.close();
    await server.disconnect();
  });
});

describe("Integration: Error Handling", () => {
  test("validation errors are caught and reported", async () => {
    const transport = new MemoryTransport();
    const errors: Error[] = [];

    const subscriber = new Subscriber({
      events: UserEvents,
      transport,
      onError: (err) => errors.push(err),
    });

    subscriber.on("user.created", () => {
      // This won't be called due to validation error
    });

    await subscriber.subscribe();

    // Directly simulate invalid message (bypass publisher validation)
    await transport.connect();
    await transport.publish("user.created", { invalid: "data" });

    await new Promise((r) => setTimeout(r, 50));

    expect(errors.length).toBe(1);
    expect(errors[0]?.message).toContain("Validation failed");

    await subscriber.unsubscribe();
  });

  test("publisher rejects invalid payloads", async () => {
    const transport = new MemoryTransport();

    const publisher = new Publisher({
      events: UserEvents,
      transport,
    });

    await expect(
      publisher.publish("user.created", { invalid: "data" } as never)
    ).rejects.toThrow();

    await publisher.disconnect();
  });
});

describe("Integration: Middleware", () => {
  test("logging middleware tracks all publishes", async () => {
    const transport = new MemoryTransport();
    const logged: string[] = [];

    const publisher = new Publisher({
      events: UserEvents,
      transport,
      middleware: [
        async (eventName, _payload, _options, next) => {
          logged.push(`start:${eventName}`);
          await next();
          logged.push(`end:${eventName}`);
        },
      ],
    });

    await publisher.publish("user.created", {
      userId: "1",
      email: "test@test.com",
      name: "Test",
    });

    expect(logged).toEqual(["start:user.created", "end:user.created"]);

    await publisher.disconnect();
  });

  test("middleware can transform or filter events", async () => {
    const transport = new MemoryTransport();
    const received: unknown[] = [];

    const publisher = new Publisher({
      events: UserEvents,
      transport,
      middleware: [
        async (eventName, _payload, _options, next) => {
          // Only allow user.created events (filter example)
          if (eventName === "user.created") {
            await next();
          }
        },
      ],
    });

    const subscriber = new Subscriber({
      events: UserEvents,
      transport,
    });

    subscriber.on("user.created", (p) => { received.push(p); });
    await subscriber.subscribe();

    await publisher.publish("user.created", {
      userId: "1",
      email: "a@b.com",
      name: "A",
    });

    expect(received.length).toBe(1);

    await subscriber.unsubscribe();
    await publisher.disconnect();
  });
});
