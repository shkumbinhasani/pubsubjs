/**
 * SSE Notifications CLI Client
 *
 * This demonstrates using the SSE transport to receive notifications
 * from a command line application.
 *
 * Features demonstrated:
 * - Server-Sent Events transport
 * - Subscriber middleware:
 *   - Logging middleware for debugging
 *   - Idempotency middleware to prevent duplicate notifications
 *   - Rate limiting middleware to prevent notification spam
 *
 * Run with: bun examples/sse-notifications/client.ts
 * (Make sure server is running first)
 */

import {
  Subscriber,
  createSubscriberLoggingMiddleware,
  createIdempotencyMiddleware,
  createRateLimitMiddleware,
} from "@pubsubjs/core";
import { SSEClientTransport } from "@pubsubjs/transport-sse";
import { NotificationEvents } from "./events.ts";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001/events";

// ============================================
// Subscriber Middleware Setup
// ============================================

// Track processed message IDs for idempotency (prevents duplicate notifications)
const processedMessages = new Set<string>();

// Logging middleware - logs all incoming events with timing info
const loggingMiddleware = createSubscriberLoggingMiddleware();

// Idempotency middleware - prevents processing the same notification twice
// This is useful when:
// - SSE reconnects and replays missed events
// - Network issues cause duplicate delivery
// - Server retries failed deliveries
const idempotencyMiddleware = createIdempotencyMiddleware({
  hasProcessed: (id) => processedMessages.has(id),
  markProcessed: (id) => {
    processedMessages.add(id);
    // Clean up old message IDs to prevent memory growth
    // In production, you'd use Redis or a database with TTL
    if (processedMessages.size > 1000) {
      const oldest = processedMessages.values().next().value;
      if (oldest) processedMessages.delete(oldest);
    }
  },
});

// Rate limiting middleware - prevents notification spam
// This protects the client from being overwhelmed by too many notifications
const rateLimitMiddleware = createRateLimitMiddleware({
  maxEvents: 50, // Maximum 50 events
  windowMs: 5000, // Per 5 seconds
  onLimit: (eventName, _payload) => {
    console.log(`\n[Rate Limit] Dropped ${eventName} - too many notifications`);
  },
});

// ============================================
// Setup
// ============================================

const transport = new SSEClientTransport({
  url: SERVER_URL,
  autoReconnect: true,
});

// Enable verbose logging via environment variable
const VERBOSE = process.env.VERBOSE === "true";

const subscriber = new Subscriber({
  events: NotificationEvents,
  transport,
  // Middleware chain: logging -> idempotency -> rate limiting
  // Order matters! Logging first to see all events, then idempotency
  // to drop duplicates early, then rate limiting for the rest.
  middleware: VERBOSE
    ? [loggingMiddleware, idempotencyMiddleware, rateLimitMiddleware]
    : [idempotencyMiddleware, rateLimitMiddleware],
  onError: (err, eventName) => {
    console.error(`Error handling ${eventName}:`, err);
  },
});

// ============================================
// Notification Handlers
// ============================================

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

subscriber.on("notification.info", (payload) => {
  console.log(`
ℹ️  [INFO] ${payload.title}
   ${payload.message}
   ${formatTime(payload.timestamp)}
`);
});

subscriber.on("notification.success", (payload) => {
  console.log(`
✅ [SUCCESS] ${payload.title}
   ${payload.message}
   ${formatTime(payload.timestamp)}
`);
});

subscriber.on("notification.warning", (payload) => {
  console.log(`
⚠️  [WARNING] ${payload.title}
   ${payload.message}
   ${formatTime(payload.timestamp)}
`);
});

subscriber.on("notification.error", (payload) => {
  console.log(`
❌ [ERROR] ${payload.title}
   ${payload.message}
   ${formatTime(payload.timestamp)}
`);
});

subscriber.on("notification.progress", (payload) => {
  const barLength = 30;
  const filled = Math.round((payload.progress / 100) * barLength);
  const bar = "█".repeat(filled) + "░".repeat(barLength - filled);

  process.stdout.write(`\r📊 ${payload.title}: [${bar}] ${payload.progress}% - ${payload.status}`);

  if (payload.progress >= 100) {
    console.log("\n");
  }
});

subscriber.on("system.announcement", (payload) => {
  const priorityIcon = {
    low: "📢",
    medium: "📣",
    high: "🚨",
  };

  console.log(`
${priorityIcon[payload.priority]} [ANNOUNCEMENT] ${payload.priority.toUpperCase()}
   ${payload.message}
   ${formatTime(payload.timestamp)}
`);
});

subscriber.on("user.activity", (payload) => {
  console.log(`👤 ${payload.username} ${payload.action} - ${formatTime(payload.timestamp)}`);
});

// ============================================
// Main
// ============================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║         SSE Notifications Client                  ║
╠═══════════════════════════════════════════════════╣
║  Server: ${SERVER_URL.padEnd(40)}║
║                                                   ║
║  Middleware enabled:                              ║
║    - Idempotency (prevents duplicate handling)    ║
║    - Rate limiting (max 50 events / 5 seconds)    ║${VERBOSE ? `
║    - Logging (verbose mode enabled)               ║` : ""}
║                                                   ║
║  Set VERBOSE=true for detailed event logging      ║
╚═══════════════════════════════════════════════════╝
`);

  console.log("Connecting to server...\n");

  try {
    await subscriber.subscribe();
    console.log("Connected! Listening for notifications...\n");
    console.log("Press Ctrl+C to exit.\n");
    console.log("─".repeat(50) + "\n");
  } catch (error) {
    console.error("Failed to connect:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\nDisconnecting...");
  await subscriber.unsubscribe();
  process.exit(0);
});

main().catch(console.error);
