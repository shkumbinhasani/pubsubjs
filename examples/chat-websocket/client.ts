/**
 * Production-ready Chat Client using WebSocket transport
 *
 * Features:
 * - Interactive CLI interface
 * - Room management commands
 * - Typing indicators with debouncing
 * - Message history loading
 * - User presence display
 * - Rate limit warnings
 * - Auto-reconnection
 * - Graceful error handling
 *
 * Run with: bun examples/chat-websocket/client.ts [username] [room]
 */

import { PubSub } from "@pubsubjs/core";
import { WebSocketClientTransport } from "@pubsubjs/transport-websocket";
import { ClientEvents, ServerEvents } from "./events.ts";
import * as readline from "readline";

// ============================================
// Configuration
// ============================================

const CONFIG = {
  SERVER_URL: "ws://localhost:3000/ws",
  TYPING_DEBOUNCE_MS: 2000,
  RECONNECT_DELAY_MS: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
};

// ============================================
// CLI Arguments
// ============================================

const USERNAME = process.argv[2] || `User${Math.floor(Math.random() * 1000)}`;
const ROOM_ID = process.argv[3] || "general";

// ============================================
// State
// ============================================

interface ChatState {
  isConnected: boolean;
  isAuthenticated: boolean;
  currentRoom: string | null;
  usersInRoom: string[];
  typingUsers: string[];
  isTyping: boolean;
  typingTimeout: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  messageHistory: Array<{ id: string; text: string; username: string; timestamp: number }>;
}

const state: ChatState = {
  isConnected: false,
  isAuthenticated: false,
  currentRoom: null,
  usersInRoom: [],
  typingUsers: [],
  isTyping: false,
  typingTimeout: null,
  reconnectAttempts: 0,
  messageHistory: [],
};

// ============================================
// Setup PubSub
// ============================================

const transport = new WebSocketClientTransport({
  url: `${CONFIG.SERVER_URL}?token=demo-token`,
  autoReconnect: true,
  reconnectDelay: CONFIG.RECONNECT_DELAY_MS,
  maxReconnectAttempts: CONFIG.MAX_RECONNECT_ATTEMPTS,
});

const chat = new PubSub({
  publishEvents: ClientEvents,
  subscribeEvents: ServerEvents,
  transport,
});

// ============================================
// UI Helpers
// ============================================

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clearLine() {
  process.stdout.write("\r\x1b[K");
}

function showTypingIndicator() {
  clearLine();
  if (state.typingUsers.length === 1) {
    process.stdout.write(`✏️  ${state.typingUsers[0]} is typing...`);
  } else if (state.typingUsers.length === 2) {
    process.stdout.write(`✏️  ${state.typingUsers[0]} and ${state.typingUsers[1]} are typing...`);
  } else if (state.typingUsers.length > 2) {
    process.stdout.write(`✏️  ${state.typingUsers.length} people are typing...`);
  }
}

function printMessage(msg: { id: string; text: string; username: string; timestamp: number }, isHistory = false) {
  clearLine();
  const prefix = isHistory ? "📜 " : "";
  const time = formatTime(msg.timestamp);
  const isMe = msg.username === USERNAME;
  const username = isMe ? "You" : msg.username;
  console.log(`${prefix}[${time}] ${username}: ${msg.text}`);
  
  if (state.typingUsers.length > 0) {
    showTypingIndicator();
  }
}

function printSystemMessage(message: string) {
  clearLine();
  console.log(`\n🔔 ${message}\n`);
}

function printError(code: string, message: string) {
  clearLine();
  console.log(`\n❌ Error [${code}]: ${message}\n`);
}

function printSuccess(message: string) {
  clearLine();
  console.log(`\n✅ ${message}\n`);
}

// ============================================
// Event Handlers
// ============================================

chat.on("auth.success", (payload) => {
  state.isAuthenticated = true;
  printSuccess(`Authenticated as ${payload.username}`);
});

chat.on("auth.error", (payload) => {
  printError(payload.code, payload.message);
});

chat.on("room.created", (payload) => {
  printSuccess(`Room '${payload.roomId}' created`);
  if (payload.description) {
    console.log(`   Description: ${payload.description}`);
  }
});

chat.on("room.list", (payload) => {
  clearLine();
  console.log("\n📋 Available Rooms:");
  console.log("─".repeat(60));
  if (payload.rooms.length === 0) {
    console.log("   No rooms available. Create one with /create <room-name>");
  } else {
    payload.rooms.forEach((room) => {
      const desc = room.description ? ` - ${room.description}` : "";
      console.log(`   • ${room.id} (${room.userCount} users)${desc}`);
    });
  }
  console.log("─".repeat(60) + "\n");
});

chat.on("room.joined", (payload) => {
  state.currentRoom = payload.roomId;
  state.usersInRoom = payload.users;
  
  clearLine();
  console.log(`\n🏠 Joined room: ${payload.roomId}`);
  console.log(`👥 Users in room: ${payload.users.join(", ") || "(empty)"}`);
  
  if (payload.recentMessages.length > 0) {
    console.log("\n📜 Recent messages:");
    console.log("─".repeat(60));
    payload.recentMessages.forEach((msg) => printMessage(msg, true));
    console.log("─".repeat(60));
  }
  
  console.log("\n💬 Type a message and press Enter to send.");
  console.log("   Type /help for available commands.\n");
});

chat.on("room.userJoined", (payload) => {
  clearLine();
  console.log(`\n🟢 ${payload.username} joined the room\n`);
  if (!state.usersInRoom.includes(payload.username)) {
    state.usersInRoom.push(payload.username);
  }
});

chat.on("room.userLeft", (payload) => {
  clearLine();
  console.log(`\n🔴 ${payload.username} left the room\n`);
  state.usersInRoom = state.usersInRoom.filter((u) => u !== payload.username);
  state.typingUsers = state.typingUsers.filter((u) => u !== payload.username);
});

chat.on("message.received", (payload) => {
  printMessage(payload);
});

chat.on("message.history", (payload) => {
  clearLine();
  if (payload.messages.length > 0) {
    console.log(`\n📜 Message history (${payload.messages.length} messages):`);
    console.log("─".repeat(60));
    payload.messages.forEach((msg) => printMessage(msg, true));
    console.log("─".repeat(60));
    if (payload.hasMore) {
      console.log("   (More messages available. Use /history to load more)\n");
    }
  } else {
    console.log("\n📜 No more message history\n");
  }
});

chat.on("typing.update", (payload) => {
  state.typingUsers = payload.usersTyping;
  showTypingIndicator();
});

chat.on("presence.update", (payload) => {
  const statusEmoji = {
    online: "🟢",
    away: "🌙",
    dnd: "🔴",
    offline: "⚫",
  }[payload.status];
  
  clearLine();
  console.log(`\n${statusEmoji} ${payload.username} is now ${payload.status}\n`);
});

chat.on("rateLimit.warning", (payload) => {
  clearLine();
  console.log(`\n⚠️  Rate Limit Warning: ${payload.message}`);
  console.log(`   Remaining: ${payload.remaining} | Reset: ${new Date(payload.resetTime).toLocaleTimeString()}\n`);
});

chat.on("error", (payload) => {
  printError(payload.code, payload.message);
});

// Handle transport events
transport.on("connect", () => {
  state.isConnected = true;
  state.reconnectAttempts = 0;
  printSuccess("Connected to server");
});

transport.on("disconnect", () => {
  state.isConnected = false;
  printSystemMessage("Disconnected from server. Attempting to reconnect...");
});

transport.on("reconnect", (attempt) => {
  state.reconnectAttempts = attempt;
  printSystemMessage(`Reconnection attempt ${attempt}/${CONFIG.MAX_RECONNECT_ATTEMPTS}...`);
});

transport.on("reconnect_failed", () => {
  printError("RECONNECT_FAILED", "Failed to reconnect after maximum attempts. Please restart the client.");
  process.exit(1);
});

// ============================================
// Typing Management
// ============================================

function startTyping() {
  if (!state.isTyping && state.currentRoom) {
    state.isTyping = true;
    chat.publish("typing.start", { roomId: state.currentRoom });
  }
  
  // Reset typing timeout
  if (state.typingTimeout) {
    clearTimeout(state.typingTimeout);
  }
  
  state.typingTimeout = setTimeout(() => {
    stopTyping();
  }, CONFIG.TYPING_DEBOUNCE_MS);
}

function stopTyping() {
  if (state.isTyping && state.currentRoom) {
    state.isTyping = false;
    if (state.typingTimeout) {
      clearTimeout(state.typingTimeout);
      state.typingTimeout = null;
    }
    chat.publish("typing.stop", { roomId: state.currentRoom });
  }
}

// ============================================
// Command Handlers
// ============================================

const commands: Record<string, (args: string[]) => void | Promise<void>> = {
  help: () => {
    clearLine();
    console.log(`
📖 Available Commands:
────────────────────────────────────────────────────────
  /help                    Show this help message
  /quit, /exit             Leave the chat and exit
  
Room Commands:
  /rooms                   List all available rooms
  /create <name> [desc]    Create a new room
  /join <room>            Join a different room
  /leave                   Leave current room
  /users                   Show users in current room
  
Message Commands:
  /history [limit]         Load message history
  /clear                   Clear the screen
  
Presence Commands:
  /away                    Set status to away
  /dnd                     Set status to do not disturb
  /online                  Set status to online
────────────────────────────────────────────────────────
`);
  },
  
  quit: async () => {
    await leaveAndExit();
  },
  
  exit: async () => {
    await leaveAndExit();
  },
  
  rooms: async () => {
    await chat.publish("room.list", {});
  },
  
  create: async (args) => {
    if (args.length < 1) {
      printError("INVALID_COMMAND", "Usage: /create <room-name> [description]");
      return;
    }
    const roomId = args[0];
    const description = args.slice(1).join(" ");
    await chat.publish("room.create", { roomId, description });
  },
  
  join: async (args) => {
    if (args.length < 1) {
      printError("INVALID_COMMAND", "Usage: /join <room-name>");
      return;
    }
    const roomId = args[0];
    await chat.publish("room.join", { roomId, username: USERNAME });
  },
  
  leave: async () => {
    if (!state.currentRoom) {
      printError("NOT_IN_ROOM", "You are not in a room");
      return;
    }
    await chat.publish("room.leave", { roomId: state.currentRoom });
    state.currentRoom = null;
    state.usersInRoom = [];
    state.typingUsers = [];
    printSuccess("Left the room");
  },
  
  users: () => {
    if (!state.currentRoom) {
      printError("NOT_IN_ROOM", "You are not in a room");
      return;
    }
    clearLine();
    console.log(`\n👥 Users in ${state.currentRoom}: ${state.usersInRoom.join(", ")}\n`);
  },
  
  history: async (args) => {
    if (!state.currentRoom) {
      printError("NOT_IN_ROOM", "You are not in a room");
      return;
    }
    const limit = args[0] ? parseInt(args[0], 10) : 50;
    await chat.publish("message.history", { roomId: state.currentRoom, limit });
  },
  
  clear: () => {
    console.clear();
    printSuccess("Screen cleared");
  },
  
  away: async () => {
    await chat.publish("presence.update", { status: "away" });
  },
  
  dnd: async () => {
    await chat.publish("presence.update", { status: "dnd" });
  },
  
  online: async () => {
    await chat.publish("presence.update", { status: "online" });
  },
};

async function leaveAndExit() {
  printSystemMessage("Leaving chat...");
  
  if (state.currentRoom) {
    try {
      await chat.publish("room.leave", { roomId: state.currentRoom });
    } catch {
      // Ignore errors during shutdown
    }
  }
  
  try {
    await chat.publish("auth.logout", {});
  } catch {
    // Ignore errors during shutdown
  }
  
  await chat.stop();
  console.log("👋 Goodbye!\n");
  process.exit(0);
}

// ============================================
// Input Handling
// ============================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", async (input) => {
  const trimmed = input.trim();
  
  if (!trimmed) return;
  
  // Handle commands
  if (trimmed.startsWith("/")) {
    const parts = trimmed.slice(1).split(" ");
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    const handler = commands[command];
    if (handler) {
      try {
        await handler(args);
      } catch (error) {
        printError("COMMAND_ERROR", String(error));
      }
    } else {
      printError("UNKNOWN_COMMAND", `Unknown command: /${command}. Type /help for available commands.`);
    }
    return;
  }
  
  // Handle messages
  if (!state.currentRoom) {
    printError("NOT_IN_ROOM", "Join a room first with /join <room-name>");
    return;
  }
  
  stopTyping();
  
  try {
    await chat.publish("message.send", {
      text: trimmed,
      roomId: state.currentRoom,
    });
  } catch (error) {
    printError("SEND_FAILED", String(error));
  }
});

// Detect typing
process.stdin.on("data", () => {
  if (state.currentRoom) {
    startTyping();
  }
});

// ============================================
// Graceful Shutdown
// ============================================

process.on("SIGINT", async () => {
  console.log("\n");
  await leaveAndExit();
});

process.on("SIGTERM", async () => {
  await leaveAndExit();
});

// ============================================
// Main
// ============================================

async function main() {
  console.clear();
  console.log(`
╔═══════════════════════════════════════════════════╗
║               Chat Client                         ║
╠═══════════════════════════════════════════════════╣
║  Username: ${USERNAME.padEnd(38)}║
║  Room: ${ROOM_ID.padEnd(42)}║
╚═══════════════════════════════════════════════════╝
`);
  
  console.log("🔌 Connecting to server...\n");
  
  try {
    await chat.start();
    
    // Authenticate
    await chat.publish("auth.login", { username: USERNAME });
    
    // Join room
    await chat.publish("room.join", {
      roomId: ROOM_ID,
      username: USERNAME,
    });
  } catch (error) {
    printError("CONNECTION_FAILED", String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  printError("FATAL_ERROR", String(error));
  process.exit(1);
});
