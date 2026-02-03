/**
 * Simple test script to verify chat functionality
 * This runs automated tests against the running server
 */

import { PubSub } from "@pubsubjs/core";
import { WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { ClientEvents, ServerEvents } from "./events.ts";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  console.log("🧪 Testing Chat Application...\n");
  
  const transport = new WebSocketClientTransport({
    url: "ws://localhost:3000/ws?token=test",
    autoReconnect: true,
  });
  
  const chat = new PubSub({
    publishEvents: ClientEvents,
    subscribeEvents: ServerEvents,
    transport,
  });
  
  const events: string[] = [];
  const messages: Array<{ text: string; username: string }> = [];
  
  // Set up event listeners
  chat.on("auth.success", (payload) => {
    events.push(`auth.success: ${payload.username}`);
  });
  
  chat.on("room.joined", (payload) => {
    events.push(`room.joined: ${payload.roomId} (${payload.users.length} users)`);
  });
  
  chat.on("message.received", (payload) => {
    events.push(`message.received: ${payload.username}: ${payload.text}`);
    messages.push({ text: payload.text, username: payload.username });
  });
  
  chat.on("room.userJoined", (payload) => {
    events.push(`room.userJoined: ${payload.username}`);
  });
  
  chat.on("typing.update", (payload) => {
    events.push(`typing.update: ${payload.usersTyping.join(", ") || "none"}`);
  });
  
  chat.on("error", (payload) => {
    events.push(`error: ${payload.code} - ${payload.message}`);
  });
  
  try {
    // Connect
    console.log("1️⃣  Connecting to server...");
    await chat.start();
    await sleep(500);
    
    // Authenticate
    console.log("2️⃣  Authenticating...");
    await chat.publish("auth.login", { username: "TestUser" });
    await sleep(500);
    
    // Join room
    console.log("3️⃣  Joining room...");
    await chat.publish("room.join", { roomId: "test-room", username: "TestUser" });
    await sleep(500);
    
    // Send a message
    console.log("4️⃣  Sending message...");
    await chat.publish("message.send", { text: "Hello, World!", roomId: "test-room" });
    await sleep(500);
    
    // Test typing indicator
    console.log("5️⃣  Testing typing indicator...");
    await chat.publish("typing.start", { roomId: "test-room" });
    await sleep(500);
    await chat.publish("typing.stop", { roomId: "test-room" });
    await sleep(500);
    
    // List rooms
    console.log("6️⃣  Listing rooms...");
    await chat.publish("room.list", {});
    await sleep(500);
    
    // Leave room
    console.log("7️⃣  Leaving room...");
    await chat.publish("room.leave", { roomId: "test-room" });
    await sleep(500);
    
    // Disconnect
    console.log("8️⃣  Disconnecting...");
    await chat.publish("auth.logout", {});
    await chat.stop();
    
    // Print results
    console.log("\n✅ Test completed!\n");
    console.log("Events received:");
    events.forEach((e) => console.log(`  • ${e}`));
    
    console.log("\nMessages received:");
    messages.forEach((m) => console.log(`  • ${m.username}: ${m.text}`));
    
    // Verify results
    const success = 
      events.some((e) => e.includes("auth.success")) &&
      events.some((e) => e.includes("room.joined")) &&
      events.some((e) => e.includes("message.received"));
    
    if (success) {
      console.log("\n🎉 All tests passed!");
      process.exit(0);
    } else {
      console.log("\n❌ Some tests failed!");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    process.exit(1);
  }
}

runTest();
