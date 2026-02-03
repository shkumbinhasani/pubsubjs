import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { WindowTransport } from "./window";
import type { TransportMessage } from "@pubsubjs/core";

// Mock window for testing
const mockWindow = {
  listeners: new Map<string, Set<EventListener>>(),
  addEventListener(type: string, listener: EventListener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  },
  removeEventListener(type: string, listener: EventListener) {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(listener);
    }
  },
  dispatchEvent(event: Event) {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
    return true;
  },
};

// Replace global window with mock
const originalWindow = globalThis.window;

describe("WindowTransport", () => {
  let transport: WindowTransport;

  beforeEach(() => {
    // @ts-expect-error - mock window
    globalThis.window = mockWindow;
    mockWindow.listeners.clear();
    transport = new WindowTransport();
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  test("has correct capabilities", () => {
    expect(transport.capabilities.canSubscribe).toBe(true);
    expect(transport.capabilities.canPublish).toBe(true);
    expect(transport.capabilities.bidirectional).toBe(true);
    expect(transport.capabilities.supportsChannels).toBe(true);
  });

  test("connects and sets up window listener", async () => {
    expect(transport.state).toBe("disconnected");

    await transport.connect();

    expect(transport.state).toBe("connected");
    expect(mockWindow.listeners.has("__pubsub__")).toBe(true);
  });

  test("disconnect removes window listener", async () => {
    await transport.connect();
    expect(mockWindow.listeners.get("__pubsub__")?.size).toBe(1);

    await transport.disconnect();

    expect(mockWindow.listeners.get("__pubsub__")?.size ?? 0).toBe(0);
    expect(transport.state).toBe("disconnected");
  });

  test("publishes via window events", async () => {
    await transport.connect();

    const received: TransportMessage[] = [];
    await transport.subscribe("test-channel", (msg) => received.push(msg));

    await transport.publish("test-channel", { data: "test" });

    expect(received.length).toBe(1);
    expect(received[0]?.channel).toBe("test-channel");
    expect(received[0]?.payload).toEqual({ data: "test" });
  });

  test("cross-transport communication", async () => {
    // Two separate transports simulating cross-component communication
    const transport1 = new WindowTransport();
    const transport2 = new WindowTransport();

    await transport1.connect();
    await transport2.connect();

    const received: TransportMessage[] = [];
    await transport2.subscribe("shared-channel", (msg) => received.push(msg));

    await transport1.publish("shared-channel", { from: "transport1" });

    expect(received.length).toBe(1);
    expect((received[0]?.payload as { from: string }).from).toBe("transport1");
  });
});
