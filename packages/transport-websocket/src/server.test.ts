import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { WebSocketServerTransport } from "./server";
import type { TransportMessage } from "@pubsubjs/core";

describe("WebSocketServerTransport", () => {
  let server: WebSocketServerTransport;

  beforeEach(() => {
    server = new WebSocketServerTransport({ port: 0 }); // Auto-assign port
  });

  afterEach(async () => {
    await server.disconnect();
  });

  test("has correct capabilities", () => {
    expect(server.capabilities.canSubscribe).toBe(true);
    expect(server.capabilities.canPublish).toBe(true);
    expect(server.capabilities.bidirectional).toBe(true);
    expect(server.capabilities.supportsTargeting).toBe(true);
    expect(server.capabilities.supportsChannels).toBe(true);
  });

  test("connects and starts listening", async () => {
    expect(server.state).toBe("disconnected");

    await server.connect();

    expect(server.state).toBe("connected");
    expect(server.port).toBeGreaterThan(0);
  });

  test("disconnect stops the server", async () => {
    await server.connect();
    expect(server.state).toBe("connected");

    await server.disconnect();

    expect(server.state).toBe("disconnected");
    expect(server.connectionCount).toBe(0);
  });

  test("handles client connections via WebSocket", async () => {
    await server.connect();

    let connected = false;
    server.on("connect", () => {
      connected = true;
    });

    // Connect a client
    const ws = new WebSocket(`ws://localhost:${server.port}/ws`);

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    // Give time for server to process
    await new Promise((r) => setTimeout(r, 50));

    expect(connected).toBe(true);
    expect(server.connectionCount).toBe(1);

    ws.close();
  });

  test("server can subscribe and receive client messages", async () => {
    await server.connect();

    const received: TransportMessage[] = [];
    await server.subscribe("chat.message", (msg) => received.push(msg));

    // Connect client
    const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    // Client subscribes and publishes
    ws.send(JSON.stringify({ type: "subscribe", channel: "chat.message" }));
    ws.send(
      JSON.stringify({
        type: "publish",
        channel: "chat.message",
        payload: { text: "Hello!" },
        messageId: "msg-1",
      })
    );

    // Wait for message
    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBe(1);
    expect(received[0]?.payload).toEqual({ text: "Hello!" });
    expect(received[0]?.connectionId).toBeDefined();

    ws.close();
  });

  test("server can publish to subscribed clients", async () => {
    await server.connect();

    // Connect client
    const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
    const clientReceived: unknown[] = [];

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.type === "message") {
        clientReceived.push(msg.payload);
      }
    };

    // Client subscribes
    ws.send(JSON.stringify({ type: "subscribe", channel: "notifications" }));
    await new Promise((r) => setTimeout(r, 50));

    // Server publishes
    await server.publish("notifications", { alert: "System update" });

    await new Promise((r) => setTimeout(r, 100));

    expect(clientReceived.length).toBe(1);
    expect(clientReceived[0]).toEqual({ alert: "System update" });

    ws.close();
  });

  test("broadcast sends to all connected clients", async () => {
    await server.connect();

    const client1 = new WebSocket(`ws://localhost:${server.port}/ws`);
    const client2 = new WebSocket(`ws://localhost:${server.port}/ws`);

    const received1: unknown[] = [];
    const received2: unknown[] = [];

    await Promise.all([
      new Promise<void>((r) => (client1.onopen = () => r())),
      new Promise<void>((r) => (client2.onopen = () => r())),
    ]);

    client1.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "message") received1.push(msg.payload);
    };
    client2.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "message") received2.push(msg.payload);
    };

    server.broadcast("global", { message: "Hello everyone" });

    await new Promise((r) => setTimeout(r, 100));

    expect(received1.length).toBe(1);
    expect(received2.length).toBe(1);

    client1.close();
    client2.close();
  });
});
