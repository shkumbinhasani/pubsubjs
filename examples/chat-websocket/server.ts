/**
 * Production-ready Chat Server using WebSocket transport
 *
 * Features:
 * - Room management (create, join, leave, list)
 * - User authentication/identification
 * - Message persistence (in-memory store)
 * - Typing indicators with debouncing
 * - User presence (online/offline/away/dnd)
 * - Message history when joining a room
 * - Rate limiting to prevent spam (per-connection)
 * - Subscriber middleware for logging and performance metrics
 * - Error handling and reconnection support
 *
 * This example showcases the new subscriber middleware feature:
 * - createSubscriberLoggingMiddleware() - logs all incoming events with timing
 * - createSubscriberTimingMiddleware() - collects handler performance metrics
 *
 * Run with: bun examples/chat-websocket/server.ts
 */

import {
  Subscriber,
  Publisher,
  generateMessageId,
  createSubscriberLoggingMiddleware,
  createSubscriberTimingMiddleware,
} from "@pubsubjs/core";
import { WebSocketServerTransport, type WebSocketData } from "@pubsubjs/transport-websocket";
import { ClientEvents, ServerEvents } from "./events.ts";

// ============================================
// Types
// ============================================

type UserStatus = "online" | "away" | "dnd" | "offline";

interface User {
  userId: string;
  username: string;
  connectionId: string;
  status: UserStatus;
  lastSeen: number;
  joinedAt: number;
  currentRoomId?: string;
}

interface Room {
  id: string;
  description?: string;
  createdBy: string;
  createdAt: number;
  users: Map<string, User>; // connectionId -> User
  messages: Array<{
    id: string;
    text: string;
    username: string;
    timestamp: number;
  }>;
  typingUsers: Map<string, number>; // username -> timeoutId
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// ============================================
// Configuration
// ============================================

const CONFIG = {
  PORT: 3000,
  MAX_MESSAGES_PER_ROOM: 1000,
  RECENT_MESSAGES_COUNT: 50,
  RATE_LIMIT: {
    MAX_REQUESTS: 30, // per minute
    WINDOW_MS: 60000, // 1 minute
  },
  TYPING_TIMEOUT_MS: 3000,
  PRESENCE_TIMEOUT_MS: 300000, // 5 minutes for away status
  HEARTBEAT_INTERVAL_MS: 30000,
};

// ============================================
// Server State
// ============================================

const rooms = new Map<string, Room>();
const users = new Map<string, User>(); // connectionId -> User
const rateLimits = new Map<string, RateLimitEntry>(); // connectionId -> RateLimit
const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>(); // roomId:username -> timeout

// ============================================
// Rate Limiting
// ============================================

function checkRateLimit(connectionId: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimits.get(connectionId);
  
  if (!entry || now > entry.resetTime) {
    // Reset or create new entry
    rateLimits.set(connectionId, {
      count: 1,
      resetTime: now + CONFIG.RATE_LIMIT.WINDOW_MS,
    });
    return { allowed: true, remaining: CONFIG.RATE_LIMIT.MAX_REQUESTS - 1, resetTime: now + CONFIG.RATE_LIMIT.WINDOW_MS };
  }
  
  if (entry.count >= CONFIG.RATE_LIMIT.MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }
  
  entry.count++;
  return { allowed: true, remaining: CONFIG.RATE_LIMIT.MAX_REQUESTS - entry.count, resetTime: entry.resetTime };
}

function cleanupRateLimit(connectionId: string) {
  rateLimits.delete(connectionId);
}

// ============================================
// Room Management
// ============================================

function createRoom(roomId: string, description: string | undefined, createdBy: string): Room {
  const room: Room = {
    id: roomId,
    description,
    createdBy,
    createdAt: Date.now(),
    users: new Map(),
    messages: [],
    typingUsers: new Map(),
  };
  rooms.set(roomId, room);
  return room;
}

function getOrCreateRoom(roomId: string, createdBy?: string): Room {
  let room = rooms.get(roomId);
  if (!room && createdBy) {
    room = createRoom(roomId, undefined, createdBy);
  }
  return room!;
}

function deleteRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room) {
    // Clear all typing timeouts for this room
    for (const [key, timeout] of typingTimeouts.entries()) {
      if (key.startsWith(`${roomId}:`)) {
        clearTimeout(timeout);
        typingTimeouts.delete(key);
      }
    }
    rooms.delete(roomId);
  }
}

function getRoomList(): Array<{ id: string; description?: string; userCount: number; createdAt: number }> {
  return Array.from(rooms.values()).map(room => ({
    id: room.id,
    description: room.description,
    userCount: room.users.size,
    createdAt: room.createdAt,
  }));
}

// ============================================
// User Management
// ============================================

function createUser(connectionId: string, username: string): User {
  const user: User = {
    userId: generateMessageId(),
    username,
    connectionId,
    status: "online",
    lastSeen: Date.now(),
    joinedAt: Date.now(),
  };
  users.set(connectionId, user);
  return user;
}

function getUser(connectionId: string): User | undefined {
  return users.get(connectionId);
}

function updateUserStatus(connectionId: string, status: UserStatus) {
  const user = users.get(connectionId);
  if (user) {
    user.status = status;
    user.lastSeen = Date.now();
  }
}

function removeUser(connectionId: string): User | undefined {
  const user = users.get(connectionId);
  if (user) {
    // Remove from room if in one
    if (user.currentRoomId) {
      const room = rooms.get(user.currentRoomId);
      if (room) {
        room.users.delete(connectionId);
        room.typingUsers.delete(user.username);
        
        // Notify others in room
        const otherUsers = Array.from(room.users.values());
        if (otherUsers.length > 0) {
          publisher.publish(
            "room.userLeft",
            { roomId: room.id, username: user.username },
            { targetIds: otherUsers.map(u => u.connectionId) }
          );
          
          // Update typing indicators
          broadcastTypingUpdate(room, user.connectionId);
        }
        
        // Clean up empty rooms (except general)
        if (room.users.size === 0 && room.id !== "general") {
          deleteRoom(room.id);
        }
      }
    }
    
    users.delete(connectionId);
    cleanupRateLimit(connectionId);
  }
  return user;
}

// ============================================
// Typing Management
// ============================================

function startTyping(room: Room, username: string, connectionId: string) {
  const key = `${room.id}:${username}`;
  
  // Clear existing timeout
  const existingTimeout = typingTimeouts.get(key);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Add user to typing set
  room.typingUsers.set(username, Date.now());
  
  // Set new timeout to clear typing status
  const timeout = setTimeout(() => {
    stopTyping(room, username);
  }, CONFIG.TYPING_TIMEOUT_MS);
  
  typingTimeouts.set(key, timeout);
  
  // Broadcast to others
  broadcastTypingUpdate(room, connectionId);
}

function stopTyping(room: Room, username: string) {
  const key = `${room.id}:${username}`;
  
  // Clear timeout
  const timeout = typingTimeouts.get(key);
  if (timeout) {
    clearTimeout(timeout);
    typingTimeouts.delete(key);
  }
  
  // Remove from typing set
  if (room.typingUsers.has(username)) {
    room.typingUsers.delete(username);
    
    // Find user's connection ID
    for (const user of room.users.values()) {
      if (user.username === username) {
        broadcastTypingUpdate(room, user.connectionId);
        break;
      }
    }
  }
}

function broadcastTypingUpdate(room: Room, excludeConnectionId: string) {
  const typingUsernames = Array.from(room.typingUsers.keys());
  const otherUsers = Array.from(room.users.values())
    .filter(u => u.connectionId !== excludeConnectionId)
    .map(u => u.connectionId);
  
  if (otherUsers.length > 0) {
    publisher.publish(
      "typing.update",
      { roomId: room.id, usersTyping: typingUsernames },
      { targetIds: otherUsers }
    );
  }
}

// ============================================
// Message Management
// ============================================

function addMessage(room: Room, text: string, username: string) {
  const message = {
    id: generateMessageId(),
    text,
    username,
    timestamp: Date.now(),
  };
  
  room.messages.push(message);
  
  // Trim messages if exceeding max
  if (room.messages.length > CONFIG.MAX_MESSAGES_PER_ROOM) {
    room.messages = room.messages.slice(-CONFIG.MAX_MESSAGES_PER_ROOM);
  }
  
  return message;
}

function getMessageHistory(room: Room, limit: number = CONFIG.RECENT_MESSAGES_COUNT, before?: number) {
  let messages = room.messages;
  
  if (before) {
    messages = messages.filter(m => m.timestamp < before);
  }
  
  return messages.slice(-limit);
}

// ============================================
// Presence Management
// ============================================

function broadcastPresenceUpdate(user: User, status: UserStatus) {
  // Broadcast to all rooms the user is in
  if (user.currentRoomId) {
    const room = rooms.get(user.currentRoomId);
    if (room) {
      const otherUsers = Array.from(room.users.values())
        .filter(u => u.connectionId !== user.connectionId)
        .map(u => u.connectionId);
      
      if (otherUsers.length > 0) {
        publisher.publish(
          "presence.update",
          {
            username: user.username,
            status,
            lastSeen: user.lastSeen,
          },
          { targetIds: otherUsers }
        );
      }
    }
  }
}

// ============================================
// Server Setup
// ============================================

const transport = new WebSocketServerTransport({
  port: CONFIG.PORT,
  onUpgrade: (req) => {
    // Extract auth token from query params (simplified auth)
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    
    return {
      connectionId: generateMessageId(),
      subscriptions: new Set<string>(),
      token,
    } as WebSocketData;
  },
});

// Publisher for sending events to clients
const publisher = new Publisher({
  events: ServerEvents,
  transport,
});

// ============================================
// Subscriber Middleware Setup
// ============================================

// Event timing metrics storage (for monitoring/metrics)
const eventMetrics = new Map<string, { count: number; totalMs: number; avgMs: number }>();

// Timing callback for metrics collection
function recordEventTiming(eventName: string, durationMs: number) {
  const existing = eventMetrics.get(eventName) || { count: 0, totalMs: 0, avgMs: 0 };
  existing.count++;
  existing.totalMs += durationMs;
  existing.avgMs = existing.totalMs / existing.count;
  eventMetrics.set(eventName, existing);

  // Log slow handlers (> 100ms) as warnings
  if (durationMs > 100) {
    console.warn(`[Performance] Slow handler for ${eventName}: ${durationMs}ms`);
  }
}

// Export metrics for potential monitoring endpoint
export function getEventMetrics() {
  return Object.fromEntries(eventMetrics);
}

// Subscriber for receiving events from clients
// Using the new subscriber middleware feature for logging and timing
const subscriber = new Subscriber({
  events: ClientEvents,
  transport,
  publisher,
  contextFactory: (metadata) => ({
    messageId: metadata.messageId,
    timestamp: new Date(),
    connectionId: metadata.connectionId as string,
    metadata,
  }),
  // Subscriber middleware chain: logging -> timing -> handler
  middleware: [
    createSubscriberLoggingMiddleware(),
    createSubscriberTimingMiddleware(recordEventTiming),
  ],
});

// ============================================
// Event Handlers
// ============================================

// Authentication
subscriber.on("auth.login", async (payload, { ctx, publisher }) => {
  const { username } = payload;
  const connectionId = ctx.connectionId;
  
  // Check rate limit
  const rateLimit = checkRateLimit(connectionId);
  if (!rateLimit.allowed) {
    await publisher.publish(
      "auth.error",
      { code: "RATE_LIMITED", message: "Too many login attempts. Please try again later." },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  // Create user
  const user = createUser(connectionId, username);
  
  console.log(`[Server] User authenticated: ${username} (${connectionId})`);
  
  await publisher.publish(
    "auth.success",
    { username: user.username, userId: user.userId },
    { targetIds: [connectionId] }
  );
});

subscriber.on("auth.logout", async (payload, { ctx, publisher }) => {
  const connectionId = ctx.connectionId;
  const user = removeUser(connectionId);
  
  if (user) {
    console.log(`[Server] User logged out: ${user.username}`);
  }
});

// Room Management
subscriber.on("room.create", async (payload, { ctx, publisher }) => {
  const { roomId, description } = payload;
  const connectionId = ctx.connectionId;
  
  // Check rate limit
  const rateLimit = checkRateLimit(connectionId);
  if (!rateLimit.allowed) {
    await publisher.publish(
      "rateLimit.warning",
      { remaining: 0, resetTime: rateLimit.resetTime, message: "Rate limit exceeded" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  const user = getUser(connectionId);
  if (!user) {
    await publisher.publish(
      "error",
      { code: "NOT_AUTHENTICATED", message: "You must login first" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  // Check if room already exists
  if (rooms.has(roomId)) {
    await publisher.publish(
      "error",
      { code: "ROOM_EXISTS", message: `Room '${roomId}' already exists` },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  // Create room
  const room = createRoom(roomId, description, user.username);
  
  console.log(`[Server] Room created: ${roomId} by ${user.username}`);
  
  await publisher.publish(
    "room.created",
    { roomId, description, createdBy: user.username },
    { targetIds: [connectionId] }
  );
});

subscriber.on("room.list", async (payload, { ctx, publisher }) => {
  const connectionId = ctx.connectionId;
  
  const roomList = getRoomList();
  
  await publisher.publish(
    "room.list",
    { rooms: roomList },
    { targetIds: [connectionId] }
  );
});

subscriber.on("room.join", async (payload, { ctx, publisher }) => {
  const { roomId, username } = payload;
  const connectionId = ctx.connectionId;
  
  // Check rate limit
  const rateLimit = checkRateLimit(connectionId);
  if (!rateLimit.allowed) {
    await publisher.publish(
      "rateLimit.warning",
      { remaining: 0, resetTime: rateLimit.resetTime, message: "Rate limit exceeded" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  // Get or create user
  let user = getUser(connectionId);
  if (!user) {
    user = createUser(connectionId, username);
    
    // Send auth success
    await publisher.publish(
      "auth.success",
      { username: user.username, userId: user.userId },
      { targetIds: [connectionId] }
    );
  }
  
  // Leave current room if in one
  if (user.currentRoomId && user.currentRoomId !== roomId) {
    const currentRoom = rooms.get(user.currentRoomId);
    if (currentRoom) {
      currentRoom.users.delete(connectionId);
      currentRoom.typingUsers.delete(user.username);
      
      // Notify others in old room
      const otherUsers = Array.from(currentRoom.users.values());
      if (otherUsers.length > 0) {
        await publisher.publish(
          "room.userLeft",
          { roomId: currentRoom.id, username: user.username },
          { targetIds: otherUsers.map(u => u.connectionId) }
        );
      }
    }
  }
  
  // Get or create room
  const room = getOrCreateRoom(roomId, user.username);
  
  // Add user to room
  room.users.set(connectionId, user);
  user.currentRoomId = roomId;
  user.status = "online";
  
  console.log(`[Server] ${user.username} joined room ${roomId}`);
  
  // Send room info to joining user
  const recentMessages = getMessageHistory(room, CONFIG.RECENT_MESSAGES_COUNT);
  await publisher.publish(
    "room.joined",
    {
      roomId,
      users: Array.from(room.users.values()).map(u => u.username),
      recentMessages,
    },
    { targetIds: [connectionId] }
  );
  
  // Notify others in room
  const otherUsers = Array.from(room.users.values())
    .filter(u => u.connectionId !== connectionId)
    .map(u => u.connectionId);
  
  if (otherUsers.length > 0) {
    await publisher.publish(
      "room.userJoined",
      { roomId, username: user.username },
      { targetIds: otherUsers }
    );
    
    // Send presence update
    await publisher.publish(
      "presence.update",
      { username: user.username, status: "online" },
      { targetIds: otherUsers }
    );
  }
});

subscriber.on("room.leave", async (payload, { ctx, publisher }) => {
  const { roomId } = payload;
  const connectionId = ctx.connectionId;
  
  const user = getUser(connectionId);
  if (!user) return;
  
  const room = rooms.get(roomId);
  if (!room) return;
  
  // Remove user from room
  room.users.delete(connectionId);
  room.typingUsers.delete(user.username);
  user.currentRoomId = undefined;
  
  console.log(`[Server] ${user.username} left room ${roomId}`);
  
  // Notify others
  const remainingUsers = Array.from(room.users.values());
  if (remainingUsers.length > 0) {
    await publisher.publish(
      "room.userLeft",
      { roomId, username: user.username },
      { targetIds: remainingUsers.map(u => u.connectionId) }
    );
  }
  
  // Clean up empty rooms (except general)
  if (room.users.size === 0 && room.id !== "general") {
    deleteRoom(room.id);
  }
});

// Message Handling
subscriber.on("message.send", async (payload, { ctx, publisher }) => {
  const { text, roomId } = payload;
  const connectionId = ctx.connectionId;
  
  // Check rate limit
  const rateLimit = checkRateLimit(connectionId);
  if (!rateLimit.allowed) {
    await publisher.publish(
      "rateLimit.warning",
      { remaining: 0, resetTime: rateLimit.resetTime, message: "Rate limit exceeded. Slow down!" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  const user = getUser(connectionId);
  if (!user) {
    await publisher.publish(
      "error",
      { code: "NOT_AUTHENTICATED", message: "You must login first" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  const room = rooms.get(roomId);
  if (!room) {
    await publisher.publish(
      "error",
      { code: "ROOM_NOT_FOUND", message: "Room not found" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  // Check if user is in room
  if (!room.users.has(connectionId)) {
    await publisher.publish(
      "error",
      { code: "NOT_IN_ROOM", message: "You must join the room first" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  // Add message
  const message = addMessage(room, text, user.username);
  
  // Clear typing indicator
  stopTyping(room, user.username);
  
  console.log(`[Server] Message in ${roomId} from ${user.username}: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`);
  
  // Broadcast to all users in room
  const roomUsers = Array.from(room.users.values()).map(u => u.connectionId);
  await publisher.publish(
    "message.received",
    { ...message, roomId },
    { targetIds: roomUsers }
  );
  
  // Send rate limit warning if close to limit
  if (rateLimit.remaining <= 5) {
    await publisher.publish(
      "rateLimit.warning",
      { remaining: rateLimit.remaining, resetTime: rateLimit.resetTime, message: "Approaching rate limit" },
      { targetIds: [connectionId] }
    );
  }
});

subscriber.on("message.history", async (payload, { ctx, publisher }) => {
  const { roomId, limit = 50, before } = payload;
  const connectionId = ctx.connectionId;
  
  const room = rooms.get(roomId);
  if (!room) {
    await publisher.publish(
      "error",
      { code: "ROOM_NOT_FOUND", message: "Room not found" },
      { targetIds: [connectionId] }
    );
    return;
  }
  
  const messages = getMessageHistory(room, limit, before);
  const hasMore = before ? room.messages.some(m => m.timestamp < before) : room.messages.length > limit;
  
  await publisher.publish(
    "message.history",
    { roomId, messages, hasMore },
    { targetIds: [connectionId] }
  );
});

// Typing Indicators
subscriber.on("typing.start", async (payload, { ctx, publisher }) => {
  const { roomId } = payload;
  const connectionId = ctx.connectionId;
  
  const user = getUser(connectionId);
  if (!user) return;
  
  const room = rooms.get(roomId);
  if (!room || !room.users.has(connectionId)) return;
  
  startTyping(room, user.username, connectionId);
});

subscriber.on("typing.stop", async (payload, { ctx, publisher }) => {
  const { roomId } = payload;
  const connectionId = ctx.connectionId;
  
  const user = getUser(connectionId);
  if (!user) return;
  
  const room = rooms.get(roomId);
  if (!room) return;
  
  stopTyping(room, user.username);
});

// Presence
subscriber.on("presence.update", async (payload, { ctx, publisher }) => {
  const { status } = payload;
  const connectionId = ctx.connectionId;
  
  const user = getUser(connectionId);
  if (!user) return;
  
  updateUserStatus(connectionId, status);
  broadcastPresenceUpdate(user, status);
});

// ============================================
// Connection Management
// ============================================

transport.on("disconnect", (data) => {
  const { connectionId } = data as { connectionId: string };
  const user = removeUser(connectionId);
  
  if (user) {
    console.log(`[Server] ${user.username} disconnected`);
  }
});

// ============================================
// Heartbeat & Cleanup
// ============================================

setInterval(() => {
  const now = Date.now();
  
  // Clean up old rate limit entries
  for (const [connectionId, entry] of rateLimits.entries()) {
    if (now > entry.resetTime) {
      rateLimits.delete(connectionId);
    }
  }
  
  // Check for inactive users and mark as away
  for (const [connectionId, user] of users.entries()) {
    const inactiveTime = now - user.lastSeen;
    
    if (inactiveTime > CONFIG.PRESENCE_TIMEOUT_MS && user.status === "online") {
      updateUserStatus(connectionId, "away");
      broadcastPresenceUpdate(user, "away");
    }
  }
}, CONFIG.HEARTBEAT_INTERVAL_MS);

// ============================================
// Start Server
// ============================================

async function main() {
  // Create default general room
  createRoom("general", "General chat room for everyone", "system");
  
  await transport.connect();
  await subscriber.subscribe();
  
  console.log(`
╔═══════════════════════════════════════════════════╗
║         Chat Server Running on Port ${CONFIG.PORT}          ║
╠═══════════════════════════════════════════════════╣
║  WebSocket URL: ws://localhost:${CONFIG.PORT}/ws             ║
║                                                   ║
║  Features:                                        ║
║  • Room management (create, join, leave, list)    ║
║  • User authentication                            ║
║  • Message persistence                            ║
║  • Typing indicators                              ║
║  • User presence (online/away/dnd/offline)        ║
║  • Message history                                ║
║  • Rate limiting (per-connection)                 ║
║  • Subscriber middleware (logging + timing)       ║
║                                                   ║
║  Run the client:                                  ║
║  bun examples/chat-websocket/client.ts            ║
╚═══════════════════════════════════════════════════╝
`);
}

main().catch(console.error);
