/**
 * Integration tests for chat-websocket example
 */

import { test, expect, describe } from "bun:test";
import { Publisher, Subscriber } from "../../packages/core/src/index.ts";
import { MemoryTransport } from "../../packages/react/src/index.ts";
import { ClientEvents, ServerEvents } from "./events.ts";

describe("Chat WebSocket Integration", () => {
  test("client can authenticate", async () => {
    const transport = new MemoryTransport();
    const clientPublisher = new Publisher({
      events: ClientEvents,
      transport,
    });

    const serverSubscriber = new Subscriber({
      events: ClientEvents,
      transport,
    });

    const authEvents: Array<{ username: string; password?: string }> = [];

    serverSubscriber.on("auth.login", (payload) => {
      authEvents.push(payload);
    });

    await serverSubscriber.subscribe();

    await clientPublisher.publish("auth.login", {
      username: "Alice",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(authEvents.length).toBe(1);
    expect(authEvents[0]).toEqual({ username: "Alice" });

    await serverSubscriber.unsubscribe();
    await clientPublisher.disconnect();
  });

  test("client can create and list rooms", async () => {
    const transport = new MemoryTransport();
    const clientPublisher = new Publisher({
      events: ClientEvents,
      transport,
    });

    const serverSubscriber = new Subscriber({
      events: ClientEvents,
      transport,
    });

    const roomEvents: Array<{ type: string; roomId?: string; description?: string }> = [];

    serverSubscriber.on("room.create", (payload) => {
      roomEvents.push({ type: "create", roomId: payload.roomId, description: payload.description });
    });

    serverSubscriber.on("room.list", () => {
      roomEvents.push({ type: "list" });
    });

    await serverSubscriber.subscribe();

    await clientPublisher.publish("room.create", {
      roomId: "test-room",
      description: "A test room",
    });

    await clientPublisher.publish("room.list", {});

    await new Promise((r) => setTimeout(r, 50));

    expect(roomEvents.length).toBe(2);
    expect(roomEvents[0]).toEqual({ type: "create", roomId: "test-room", description: "A test room" });
    expect(roomEvents[1]).toEqual({ type: "list" });

    await serverSubscriber.unsubscribe();
    await clientPublisher.disconnect();
  });

  test("client can send message to server", async () => {
    const transport = new MemoryTransport();
    const clientPublisher = new Publisher({
      events: ClientEvents,
      transport,
    });

    const serverSubscriber = new Subscriber({
      events: ClientEvents,
      transport,
    });

    const receivedMessages: Array<{ text: string; roomId: string }> = [];

    serverSubscriber.on("message.send", (payload) => {
      receivedMessages.push(payload);
    });

    await serverSubscriber.subscribe();

    await clientPublisher.publish("message.send", {
      text: "Hello, world!",
      roomId: "room-123",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]).toEqual({
      text: "Hello, world!",
      roomId: "room-123",
    });

    await serverSubscriber.unsubscribe();
    await clientPublisher.disconnect();
  });

  test("server can broadcast message to clients", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    const receivedMessages: Array<{ id: string; text: string; roomId: string; username: string; timestamp: number }> = [];

    clientSubscriber.on("message.received", (payload) => {
      receivedMessages.push(payload);
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("message.received", {
      id: "msg-1",
      text: "Welcome to the room!",
      roomId: "room-123",
      username: "Server",
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].text).toBe("Welcome to the room!");

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });

  test("client can join and leave rooms", async () => {
    const transport = new MemoryTransport();
    const clientPublisher = new Publisher({
      events: ClientEvents,
      transport,
    });

    const serverSubscriber = new Subscriber({
      events: ClientEvents,
      transport,
    });

    const roomActions: Array<{ action: string; roomId: string; username?: string }> = [];

    serverSubscriber.on("room.join", (payload) => {
      roomActions.push({ action: "join", roomId: payload.roomId, username: payload.username });
    });

    serverSubscriber.on("room.leave", (payload) => {
      roomActions.push({ action: "leave", roomId: payload.roomId });
    });

    await serverSubscriber.subscribe();

    await clientPublisher.publish("room.join", {
      roomId: "room-456",
      username: "Alice",
    });

    await clientPublisher.publish("room.leave", {
      roomId: "room-456",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(roomActions.length).toBe(2);
    expect(roomActions[0]).toEqual({ action: "join", roomId: "room-456", username: "Alice" });
    expect(roomActions[1]).toEqual({ action: "leave", roomId: "room-456" });

    await serverSubscriber.unsubscribe();
    await clientPublisher.disconnect();
  });

  test("typing indicators work", async () => {
    const transport = new MemoryTransport();
    const clientPublisher = new Publisher({
      events: ClientEvents,
      transport,
    });

    const serverSubscriber = new Subscriber({
      events: ClientEvents,
      transport,
    });

    const typingEvents: Array<{ type: string; roomId: string }> = [];

    serverSubscriber.on("typing.start", (payload) => {
      typingEvents.push({ type: "start", roomId: payload.roomId });
    });

    serverSubscriber.on("typing.stop", (payload) => {
      typingEvents.push({ type: "stop", roomId: payload.roomId });
    });

    await serverSubscriber.subscribe();

    await clientPublisher.publish("typing.start", { roomId: "room-789" });
    await clientPublisher.publish("typing.stop", { roomId: "room-789" });

    await new Promise((r) => setTimeout(r, 50));

    expect(typingEvents.length).toBe(2);
    expect(typingEvents[0]).toEqual({ type: "start", roomId: "room-789" });
    expect(typingEvents[1]).toEqual({ type: "stop", roomId: "room-789" });

    await serverSubscriber.unsubscribe();
    await clientPublisher.disconnect();
  });

  test("server can send room join confirmation", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    let roomJoinedPayload: { roomId: string; users: string[]; recentMessages: unknown[] } | undefined;

    clientSubscriber.on("room.joined", (payload) => {
      roomJoinedPayload = payload;
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("room.joined", {
      roomId: "room-abc",
      users: ["Alice", "Bob"],
      recentMessages: [],
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(roomJoinedPayload).toBeDefined();
    expect(roomJoinedPayload!.roomId).toBe("room-abc");
    expect(roomJoinedPayload!.users).toEqual(["Alice", "Bob"]);

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });

  test("server can notify about user join/leave", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    const userEvents: Array<{ type: string; roomId: string; username: string }> = [];

    clientSubscriber.on("room.userJoined", (payload) => {
      userEvents.push({ type: "joined", roomId: payload.roomId, username: payload.username });
    });

    clientSubscriber.on("room.userLeft", (payload) => {
      userEvents.push({ type: "left", roomId: payload.roomId, username: payload.username });
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("room.userJoined", {
      roomId: "room-def",
      username: "Charlie",
    });

    await serverPublisher.publish("room.userLeft", {
      roomId: "room-def",
      username: "David",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(userEvents.length).toBe(2);
    expect(userEvents[0]).toEqual({ type: "joined", roomId: "room-def", username: "Charlie" });
    expect(userEvents[1]).toEqual({ type: "left", roomId: "room-def", username: "David" });

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });

  test("server can send typing updates", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    let typingUpdate: { roomId: string; usersTyping: string[] } | undefined;

    clientSubscriber.on("typing.update", (payload) => {
      typingUpdate = payload;
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("typing.update", {
      roomId: "room-ghi",
      usersTyping: ["Alice", "Bob"],
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(typingUpdate).toBeDefined();
    expect(typingUpdate!.roomId).toBe("room-ghi");
    expect(typingUpdate!.usersTyping).toEqual(["Alice", "Bob"]);

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });

  test("server can send errors", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    let errorPayload: { code: string; message: string } | undefined;

    clientSubscriber.on("error", (payload) => {
      errorPayload = payload;
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("error", {
      code: "ROOM_NOT_FOUND",
      message: "The requested room does not exist",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(errorPayload).toBeDefined();
    expect(errorPayload!.code).toBe("ROOM_NOT_FOUND");
    expect(errorPayload!.message).toBe("The requested room does not exist");

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });

  test("server can send message history", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    let historyPayload: { roomId: string; messages: unknown[]; hasMore: boolean } | undefined;

    clientSubscriber.on("message.history", (payload) => {
      historyPayload = payload;
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("message.history", {
      roomId: "room-jkl",
      messages: [
        { id: "1", text: "Hello", username: "Alice", timestamp: Date.now() },
        { id: "2", text: "Hi!", username: "Bob", timestamp: Date.now() },
      ],
      hasMore: false,
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(historyPayload).toBeDefined();
    expect(historyPayload!.roomId).toBe("room-jkl");
    expect(historyPayload!.messages.length).toBe(2);
    expect(historyPayload!.hasMore).toBe(false);

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });

  test("server can send rate limit warnings", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    let rateLimitPayload: { remaining: number; resetTime: number; message: string } | undefined;

    clientSubscriber.on("rateLimit.warning", (payload) => {
      rateLimitPayload = payload;
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("rateLimit.warning", {
      remaining: 5,
      resetTime: Date.now() + 60000,
      message: "Approaching rate limit",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(rateLimitPayload).toBeDefined();
    expect(rateLimitPayload!.remaining).toBe(5);
    expect(rateLimitPayload!.message).toBe("Approaching rate limit");

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });

  test("server can send presence updates", async () => {
    const transport = new MemoryTransport();
    const serverPublisher = new Publisher({
      events: ServerEvents,
      transport,
    });

    const clientSubscriber = new Subscriber({
      events: ServerEvents,
      transport,
    });

    let presencePayload: { username: string; status: "online" | "away" | "dnd" | "offline"; lastSeen?: number } | undefined;

    clientSubscriber.on("presence.update", (payload) => {
      presencePayload = payload;
    });

    await clientSubscriber.subscribe();

    await serverPublisher.publish("presence.update", {
      username: "Alice",
      status: "away",
      lastSeen: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(presencePayload).toBeDefined();
    expect(presencePayload!.username).toBe("Alice");
    expect(presencePayload!.status).toBe("away");

    await clientSubscriber.unsubscribe();
    await serverPublisher.disconnect();
  });
});
