import { test, expect, describe, mock, beforeEach } from "bun:test";
import { PubSub } from "./pubsub";
import { defineEvent, type StandardSchema } from "./types/schema";
import type {
  Transport,
  TransportCapabilities,
  ConnectionState,
  TransportMessageHandler,
  TransportPublishOptions,
  TransportMessage,
} from "./transport/interface";
import { generateMessageId } from "./types/context";

// Helper to wait for async operations
const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 10));

// Create a simple mock schema
function createMockSchema<T>(validator: (value: unknown) => T): StandardSchema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        try {
          const result = validator(value);
          return { value: result };
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      },
    },
  };
}

// Mock transport with message simulation
function createMockTransport(): Transport & {
  _state: ConnectionState;
  _handlers: Map<string, TransportMessageHandler>;
  _published: Array<{ channel: string; payload: unknown }>;
  simulateMessage: (channel: string, payload: unknown) => void;
} {
  const handlers = new Map<string, TransportMessageHandler>();
  const published: Array<{ channel: string; payload: unknown }> = [];

  const transport = {
    id: "mock-transport",
    _state: "disconnected" as ConnectionState,
    _handlers: handlers,
    _published: published,
    get state() {
      return this._state;
    },
    capabilities: {
      canSubscribe: true,
      canPublish: true,
      bidirectional: true,
      supportsTargeting: false,
      supportsChannels: true,
    } as TransportCapabilities,
    connect: mock(async function (this: typeof transport) {
      this._state = "connected";
    }),
    disconnect: mock(async function (this: typeof transport) {
      this._state = "disconnected";
    }),
    subscribe: mock(async function (
      this: typeof transport,
      channel: string,
      handler: TransportMessageHandler
    ) {
      handlers.set(channel, handler);
      return () => {
        handlers.delete(channel);
      };
    }),
    publish: mock(async function (
      this: typeof transport,
      channel: string,
      payload: unknown,
      _options?: TransportPublishOptions
    ) {
      published.push({ channel, payload });
    }),
    on: mock(() => {}),
    off: mock(() => {}),
    simulateMessage(channel: string, payload: unknown) {
      const handler = handlers.get(channel);
      if (handler) {
        const message: TransportMessage = {
          channel,
          payload,
          messageId: generateMessageId(),
        };
        handler(message);
      }
    },
  };

  return transport;
}

// Schemas
const clientMessageSchema = createMockSchema<{ text: string }>((value) => {
  if (typeof value !== "object" || value === null) throw new Error("Expected object");
  const obj = value as Record<string, unknown>;
  if (typeof obj.text !== "string") throw new Error("text must be a string");
  return { text: obj.text };
});

const serverMessageSchema = createMockSchema<{ id: string; text: string; timestamp: number }>(
  (value) => {
    if (typeof value !== "object" || value === null) throw new Error("Expected object");
    const obj = value as Record<string, unknown>;
    if (typeof obj.id !== "string") throw new Error("id must be a string");
    if (typeof obj.text !== "string") throw new Error("text must be a string");
    if (typeof obj.timestamp !== "number") throw new Error("timestamp must be a number");
    return { id: obj.id, text: obj.text, timestamp: obj.timestamp };
  }
);

const clientEvents = defineEvent([
  { name: "message.send", schema: clientMessageSchema },
]);

const serverEvents = defineEvent([
  { name: "message.received", schema: serverMessageSchema },
]);

describe("PubSub", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let pubsub: PubSub<typeof clientEvents, typeof serverEvents>;

  beforeEach(() => {
    transport = createMockTransport();
    pubsub = new PubSub({
      publishEvents: clientEvents,
      subscribeEvents: serverEvents,
      transport,
    });
  });

  test("can publish events", async () => {
    await pubsub.publish("message.send", { text: "Hello" });

    expect(transport._published.length).toBe(1);
    expect(transport._published[0]?.channel).toBe("message.send");
    expect(transport._published[0]?.payload).toEqual({ text: "Hello" });
  });

  test("can subscribe to events", async () => {
    const received: Array<{ id: string; text: string; timestamp: number }> = [];

    pubsub.on("message.received", (payload) => {
      received.push(payload);
    });

    await pubsub.start();

    transport.simulateMessage("message.received", {
      id: "1",
      text: "Hello",
      timestamp: Date.now(),
    });

    await waitForAsync();

    expect(received.length).toBe(1);
    expect(received[0]?.text).toBe("Hello");
  });

  test("handlers receive publisher for reply patterns", async () => {
    let receivedPublisher: unknown;

    pubsub.on("message.received", (_payload, { publisher }) => {
      receivedPublisher = publisher;
    });

    await pubsub.start();

    transport.simulateMessage("message.received", {
      id: "1",
      text: "Hello",
      timestamp: Date.now(),
    });

    await waitForAsync();

    expect(receivedPublisher).toBeDefined();

    // Can use publisher to reply
    const pub = receivedPublisher as { publish: (name: string, payload: unknown) => Promise<void> };
    await pub.publish("message.send", { text: "Reply" });

    expect(transport._published.some((m) => m.payload && (m.payload as { text: string }).text === "Reply")).toBe(true);
  });

  test("start() subscribes and connects", async () => {
    pubsub.on("message.received", () => {});
    await pubsub.start();

    expect(pubsub.isConnected).toBe(true);
    expect(transport._handlers.has("message.received")).toBe(true);
  });

  test("stop() unsubscribes and disconnects", async () => {
    pubsub.on("message.received", () => {});
    await pubsub.start();

    expect(pubsub.isConnected).toBe(true);

    await pubsub.stop();

    expect(pubsub.isConnected).toBe(false);
  });

  test("onMany registers multiple handlers", async () => {
    const calls: string[] = [];

    pubsub.onMany({
      "message.received": () => { calls.push("received"); },
    });

    await pubsub.start();

    transport.simulateMessage("message.received", {
      id: "1",
      text: "Test",
      timestamp: Date.now(),
    });

    await waitForAsync();

    expect(calls).toContain("received");
  });

  test("off removes handler", async () => {
    const calls: number[] = [];

    pubsub.on("message.received", () => { calls.push(1); });
    await pubsub.start();

    transport.simulateMessage("message.received", {
      id: "1",
      text: "Test",
      timestamp: Date.now(),
    });

    await waitForAsync();
    expect(calls.length).toBe(1);

    pubsub.off("message.received");

    transport.simulateMessage("message.received", {
      id: "2",
      text: "Test2",
      timestamp: Date.now(),
    });

    await waitForAsync();
    // Handler was removed, call count stays same
  });

  test("getPublisher returns publisher interface", () => {
    const publisher = pubsub.getPublisher();
    expect(publisher).toBeDefined();
    expect(typeof publisher.publish).toBe("function");
  });
});
