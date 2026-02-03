/**
 * Tests for basic-usage example
 */

import { test, expect, describe } from "bun:test";
import { Publisher, Subscriber, PubSub, defineEvent } from "../../packages/core/src/index.ts";
import { MemoryTransport } from "../../packages/react/src/index.ts";
import { z } from "zod";

// Define the same events as in the example
const UserEvents = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: z.string(),
      email: z.string().email(),
      name: z.string().min(1),
    }),
    description: "Emitted when a new user is created",
  },
  {
    name: "user.updated",
    schema: z.object({
      userId: z.string(),
      changes: z.record(z.unknown()),
    }),
  },
]);

const NotificationEvents = defineEvent([
  {
    name: "notification.send",
    schema: z.object({
      to: z.string().email(),
      message: z.string(),
      channel: z.enum(["email", "sms"]),
    }),
  },
]);

describe("Basic Usage Example", () => {
  test("publisher can publish events", async () => {
    const transport = new MemoryTransport();
    const publisher = new Publisher({
      events: UserEvents,
      transport,
    });

    await publisher.publish("user.created", {
      userId: "user-123",
      email: "john@example.com",
      name: "John Doe",
    });

    expect(publisher.isConnected).toBe(true);
    await publisher.disconnect();
  });

  test("subscriber receives events", async () => {
    const transport = new MemoryTransport();
    const publisher = new Publisher({ events: UserEvents, transport });
    
    const received: Array<{ userId: string; email: string; name: string }> = [];
    
    const subscriber = new Subscriber({
      events: UserEvents,
      transport,
    });

    subscriber.on("user.created", (payload) => {
      received.push(payload);
    });

    await subscriber.subscribe();

    await publisher.publish("user.created", {
      userId: "user-456",
      email: "jane@example.com",
      name: "Jane Smith",
    });

    // Wait for async delivery
    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({
      userId: "user-456",
      email: "jane@example.com",
      name: "Jane Smith",
    });

    await subscriber.unsubscribe();
    await publisher.disconnect();
  });

  test("pubsub bidirectional communication", async () => {
    const transport = new MemoryTransport();

    const pubsub = new PubSub({
      publishEvents: NotificationEvents,
      subscribeEvents: UserEvents,
      transport,
    });

    const notifications: Array<{ to: string; message: string; channel: "email" | "sms" }> = [];

    pubsub.on("user.created", async (payload, { publisher }) => {
      await publisher.publish("notification.send", {
        to: payload.email,
        message: `Welcome ${payload.name}!`,
        channel: "email",
      });
    });

    // Subscribe to notifications to verify they were sent
    const notificationSub = new Subscriber({
      events: NotificationEvents,
      transport,
    });
    notificationSub.on("notification.send", (payload) => {
      notifications.push(payload);
    });
    await notificationSub.subscribe();

    await pubsub.start();

    // Simulate external user creation
    const externalPublisher = new Publisher({ events: UserEvents, transport });
    await externalPublisher.publish("user.created", {
      userId: "user-789",
      email: "bob@example.com",
      name: "Bob Wilson",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(notifications.length).toBe(1);
    expect(notifications[0]).toEqual({
      to: "bob@example.com",
      message: "Welcome Bob Wilson!",
      channel: "email",
    });

    await pubsub.stop();
    await externalPublisher.disconnect();
    await notificationSub.unsubscribe();
  });

  test("zod validation rejects invalid data", async () => {
    const transport = new MemoryTransport();
    const publisher = new Publisher({
      events: UserEvents,
      transport,
    });

    // Invalid email
    await expect(
      publisher.publish("user.created", {
        userId: "user-999",
        email: "not-an-email",
        name: "Test User",
      })
    ).rejects.toThrow();

    // Empty name (too short)
    await expect(
      publisher.publish("user.created", {
        userId: "user-999",
        email: "valid@email.com",
        name: "",
      })
    ).rejects.toThrow();

    await publisher.disconnect();
  });

  test("subscriber receives context with messageId", async () => {
    const transport = new MemoryTransport();
    const publisher = new Publisher({ events: UserEvents, transport });
    
    let receivedMessageId: string | undefined;
    
    const subscriber = new Subscriber({
      events: UserEvents,
      transport,
    });

    subscriber.on("user.created", (_payload, { ctx }) => {
      receivedMessageId = ctx.messageId;
    });

    await subscriber.subscribe();

    await publisher.publish("user.created", {
      userId: "user-123",
      email: "test@example.com",
      name: "Test User",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMessageId).toBeDefined();
    expect(typeof receivedMessageId).toBe("string");

    await subscriber.unsubscribe();
    await publisher.disconnect();
  });
});
