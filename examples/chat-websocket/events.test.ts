/**
 * Tests for chat-websocket example events
 */

import { test, expect, describe } from "bun:test";
import { ClientEvents, ServerEvents } from "./events.ts";

describe("Chat WebSocket Events", () => {
  test("ClientEvents has all expected events", () => {
    expect(Object.keys(ClientEvents)).toContain("auth.login");
    expect(Object.keys(ClientEvents)).toContain("auth.logout");
    expect(Object.keys(ClientEvents)).toContain("room.create");
    expect(Object.keys(ClientEvents)).toContain("room.list");
    expect(Object.keys(ClientEvents)).toContain("room.join");
    expect(Object.keys(ClientEvents)).toContain("room.leave");
    expect(Object.keys(ClientEvents)).toContain("message.send");
    expect(Object.keys(ClientEvents)).toContain("message.history");
    expect(Object.keys(ClientEvents)).toContain("typing.start");
    expect(Object.keys(ClientEvents)).toContain("typing.stop");
    expect(Object.keys(ClientEvents)).toContain("presence.update");
  });

  test("ServerEvents has all expected events", () => {
    expect(Object.keys(ServerEvents)).toContain("auth.success");
    expect(Object.keys(ServerEvents)).toContain("auth.error");
    expect(Object.keys(ServerEvents)).toContain("room.created");
    expect(Object.keys(ServerEvents)).toContain("room.list");
    expect(Object.keys(ServerEvents)).toContain("room.joined");
    expect(Object.keys(ServerEvents)).toContain("room.userJoined");
    expect(Object.keys(ServerEvents)).toContain("room.userLeft");
    expect(Object.keys(ServerEvents)).toContain("message.received");
    expect(Object.keys(ServerEvents)).toContain("message.history");
    expect(Object.keys(ServerEvents)).toContain("typing.update");
    expect(Object.keys(ServerEvents)).toContain("presence.update");
    expect(Object.keys(ServerEvents)).toContain("rateLimit.warning");
    expect(Object.keys(ServerEvents)).toContain("error");
  });

  test("ClientEvents have correct schema types", () => {
    const messageSendSchema = ClientEvents["message.send"].schema;
    expect(messageSendSchema).toBeDefined();
    
    const roomJoinSchema = ClientEvents["room.join"].schema;
    expect(roomJoinSchema).toBeDefined();
    
    const authLoginSchema = ClientEvents["auth.login"].schema;
    expect(authLoginSchema).toBeDefined();
  });

  test("ServerEvents have correct schema types", () => {
    const messageReceivedSchema = ServerEvents["message.received"].schema;
    expect(messageReceivedSchema).toBeDefined();
    
    const roomJoinedSchema = ServerEvents["room.joined"].schema;
    expect(roomJoinedSchema).toBeDefined();
    
    const authSuccessSchema = ServerEvents["auth.success"].schema;
    expect(authSuccessSchema).toBeDefined();
  });

  test("event names are literal types", () => {
    type ClientEventName = keyof typeof ClientEvents;
    type ServerEventName = keyof typeof ServerEvents;
    
    const clientEvent: ClientEventName = "message.send";
    const serverEvent: ServerEventName = "message.received";
    
    expect(clientEvent).toBe("message.send");
    expect(serverEvent).toBe("message.received");
  });
});
