import { test, expect, describe, beforeEach } from "bun:test";
import { MemoryTransport } from "./memory";
import type { TransportMessage } from "@pubsubjs/core";

describe("MemoryTransport", () => {
  let transport: MemoryTransport;

  beforeEach(() => {
    transport = new MemoryTransport();
  });

  test("has correct capabilities", () => {
    expect(transport.capabilities.canSubscribe).toBe(true);
    expect(transport.capabilities.canPublish).toBe(true);
    expect(transport.capabilities.bidirectional).toBe(true);
    expect(transport.capabilities.supportsChannels).toBe(true);
  });

  test("connects and disconnects", async () => {
    expect(transport.state).toBe("disconnected");

    await transport.connect();
    expect(transport.state).toBe("connected");

    await transport.disconnect();
    expect(transport.state).toBe("disconnected");
  });

  test("publishes and receives messages synchronously", async () => {
    await transport.connect();

    const received: TransportMessage[] = [];
    await transport.subscribe("test-channel", (msg) => received.push(msg));

    await transport.publish("test-channel", { hello: "world" });

    expect(received.length).toBe(1);
    expect(received[0]?.payload).toEqual({ hello: "world" });
    expect(received[0]?.channel).toBe("test-channel");
  });

  test("only delivers to subscribed channels", async () => {
    await transport.connect();

    const receivedA: TransportMessage[] = [];
    const receivedB: TransportMessage[] = [];

    await transport.subscribe("channel-a", (msg) => receivedA.push(msg));
    await transport.subscribe("channel-b", (msg) => receivedB.push(msg));

    await transport.publish("channel-a", { data: "a" });
    await transport.publish("channel-b", { data: "b" });

    expect(receivedA.length).toBe(1);
    expect(receivedB.length).toBe(1);
    expect((receivedA[0]?.payload as { data: string }).data).toBe("a");
    expect((receivedB[0]?.payload as { data: string }).data).toBe("b");
  });

  test("unsubscribe stops receiving messages", async () => {
    await transport.connect();

    const received: TransportMessage[] = [];
    const unsubscribe = await transport.subscribe("test", (msg) =>
      received.push(msg)
    );

    await transport.publish("test", { n: 1 });
    expect(received.length).toBe(1);

    unsubscribe();

    await transport.publish("test", { n: 2 });
    expect(received.length).toBe(1); // Still 1, not 2
  });

  test("multiple handlers receive same message", async () => {
    await transport.connect();

    const received1: TransportMessage[] = [];
    const received2: TransportMessage[] = [];

    await transport.subscribe("test", (msg) => received1.push(msg));
    await transport.subscribe("test", (msg) => received2.push(msg));

    await transport.publish("test", { value: 42 });

    expect(received1.length).toBe(1);
    expect(received2.length).toBe(1);
  });
});
