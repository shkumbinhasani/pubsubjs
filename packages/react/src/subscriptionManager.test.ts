import { test, expect, describe, mock, beforeEach } from "bun:test";
import { SubscriptionManager } from "./subscriptionManager";
import { defineEvent, type StandardSchema } from "@pubsubjs/core";
import type {
  Transport,
  TransportCapabilities,
  ConnectionState,
  TransportMessageHandler,
  TransportPublishOptions,
  TransportMessage,
} from "@pubsubjs/core";

// Helper to wait for async operations
const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 10));

// Create a simple mock schema
function createMockSchema<T>(): StandardSchema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => ({ value: value as T }),
    },
  };
}

// Mock transport
function createMockTransport(): Transport & {
  _state: ConnectionState;
  _handlers: Map<string, TransportMessageHandler>;
  simulateMessage: (channel: string, payload: unknown) => void;
} {
  const handlers = new Map<string, TransportMessageHandler>();

  const transport = {
    id: "mock-transport",
    _state: "disconnected" as ConnectionState,
    _handlers: handlers,
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
    publish: mock(async () => {}),
    on: mock(() => {}),
    off: mock(() => {}),
    simulateMessage(channel: string, payload: unknown) {
      const handler = handlers.get(channel);
      if (handler) {
        const message: TransportMessage = {
          channel,
          payload,
          messageId: `msg-${Date.now()}`,
        };
        handler(message);
      }
    },
  };

  return transport;
}

const events = defineEvent([
  { name: "test.event", schema: createMockSchema<{ value: number }>() },
  { name: "other.event", schema: createMockSchema<{ data: string }>() },
]);

describe("SubscriptionManager", () => {
  let transport: ReturnType<typeof createMockTransport>;
  let manager: SubscriptionManager<typeof events>;

  beforeEach(() => {
    transport = createMockTransport();
    manager = new SubscriptionManager(transport);
  });

  test("subscribes handler and receives messages", async () => {
    const received: Array<{ value: number }> = [];

    manager.subscribe("test.event", (payload) => {
      received.push(payload);
    });

    await waitForAsync();

    transport.simulateMessage("test.event", { value: 42 });

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({ value: 42 });
  });

  test("creates only one transport subscription per event", async () => {
    const handler1 = mock(() => {});
    const handler2 = mock(() => {});

    manager.subscribe("test.event", handler1);
    manager.subscribe("test.event", handler2);

    await waitForAsync();

    // Should only have one transport subscription
    expect(transport.subscribe).toHaveBeenCalledTimes(1);
    expect(manager.getHandlerCount("test.event")).toBe(2);
  });

  test("calls all handlers when message received", async () => {
    const calls: number[] = [];

    manager.subscribe("test.event", () => calls.push(1));
    manager.subscribe("test.event", () => calls.push(2));

    await waitForAsync();

    transport.simulateMessage("test.event", { value: 1 });

    expect(calls).toEqual([1, 2]);
  });

  test("removes handler on unsubscribe", async () => {
    const calls: number[] = [];

    const unsubscribe1 = manager.subscribe("test.event", () => calls.push(1));
    manager.subscribe("test.event", () => calls.push(2));

    await waitForAsync();

    transport.simulateMessage("test.event", { value: 1 });
    expect(calls).toEqual([1, 2]);

    unsubscribe1();

    transport.simulateMessage("test.event", { value: 2 });
    expect(calls).toEqual([1, 2, 2]); // Only handler 2 called
  });

  test("removes transport subscription when last handler unsubscribes", async () => {
    const unsubscribe = manager.subscribe("test.event", () => {});

    await waitForAsync();

    expect(manager.hasTransportSubscription("test.event")).toBe(true);

    unsubscribe();

    await waitForAsync();

    expect(manager.hasTransportSubscription("test.event")).toBe(false);
  });

  test("handles multiple events independently", async () => {
    const testCalls: number[] = [];
    const otherCalls: string[] = [];

    manager.subscribe("test.event", (p) => testCalls.push(p.value));
    manager.subscribe("other.event", (p) => otherCalls.push(p.data));

    await waitForAsync();

    transport.simulateMessage("test.event", { value: 1 });
    transport.simulateMessage("other.event", { data: "hello" });

    expect(testCalls).toEqual([1]);
    expect(otherCalls).toEqual(["hello"]);
  });

  test("dispose cleans up all subscriptions", async () => {
    manager.subscribe("test.event", () => {});
    manager.subscribe("other.event", () => {});

    await waitForAsync();

    expect(transport.state).toBe("connected");

    await manager.dispose();

    expect(manager.getHandlerCount("test.event")).toBe(0);
    expect(manager.getHandlerCount("other.event")).toBe(0);
    expect(transport.state).toBe("disconnected");
  });
});
