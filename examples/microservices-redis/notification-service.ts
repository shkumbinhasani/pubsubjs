/**
 * Notification Service - Sends notifications based on events
 *
 * This service:
 * - Listens for user and order events
 * - Sends appropriate notifications (simulated)
 * - Demonstrates subscriber middleware for idempotency, logging, and metrics
 *
 * Run with: bun examples/microservices-redis/notification-service.ts
 * Note: Requires Redis running on localhost:6379
 */

import {
  Subscriber,
  Publisher,
  createSubscriberLoggingMiddleware,
  createSubscriberTimingMiddleware,
  createIdempotencyMiddleware,
} from "@pubsubjs/core";
import { RedisTransport } from "@pubsubjs/transport-redis";
import { AllEvents, NotificationEvents } from "./events.ts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ============================================
// Idempotency Store (In-memory for demo)
// In production, use Redis or a database
// ============================================

const processedMessages = new Set<string>();

// ============================================
// Metrics Collection (for timing middleware)
// ============================================

interface EventMetrics {
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}

const metrics = new Map<string, EventMetrics>();

function recordTiming(eventName: string, durationMs: number): void {
  const existing = metrics.get(eventName);
  if (existing) {
    existing.count++;
    existing.totalDuration += durationMs;
    existing.avgDuration = existing.totalDuration / existing.count;
    existing.minDuration = Math.min(existing.minDuration, durationMs);
    existing.maxDuration = Math.max(existing.maxDuration, durationMs);
  } else {
    metrics.set(eventName, {
      count: 1,
      totalDuration: durationMs,
      avgDuration: durationMs,
      minDuration: durationMs,
      maxDuration: durationMs,
    });
  }
}

function printMetrics(): void {
  console.log("\n[NotificationService] Event Processing Metrics:");
  console.log("-".repeat(70));
  console.log(
    "Event".padEnd(30) +
      "Count".padStart(8) +
      "Avg(ms)".padStart(10) +
      "Min(ms)".padStart(10) +
      "Max(ms)".padStart(10)
  );
  console.log("-".repeat(70));
  for (const [event, m] of metrics.entries()) {
    console.log(
      event.padEnd(30) +
        m.count.toString().padStart(8) +
        m.avgDuration.toFixed(2).padStart(10) +
        m.minDuration.toFixed(2).padStart(10) +
        m.maxDuration.toFixed(2).padStart(10)
    );
  }
  console.log("-".repeat(70) + "\n");
}

// ============================================
// Service Setup
// ============================================

const transport = new RedisTransport({
  url: REDIS_URL,
  channelPrefix: "microservices",
});

// We subscribe to events from other services with middleware for:
// 1. Logging - For distributed tracing and debugging
// 2. Idempotency - Prevents duplicate notifications (critical for email/SMS)
// 3. Timing - For performance monitoring and alerting
const subscriber = new Subscriber({
  events: AllEvents,
  transport,
  middleware: [
    // Logging middleware - logs all incoming events with timing
    createSubscriberLoggingMiddleware(),
    // Idempotency middleware - prevents duplicate processing of redelivered messages
    createIdempotencyMiddleware({
      hasProcessed: async (messageId) => processedMessages.has(messageId),
      markProcessed: async (messageId) => {
        processedMessages.add(messageId);
        // In production: set TTL to eventually clean up old message IDs
        // e.g., using Redis SETEX or similar
      },
    }),
    // Timing middleware - collects metrics for monitoring dashboards
    createSubscriberTimingMiddleware(recordTiming),
  ],
  onError: (err, eventName, payload) => {
    console.error(`[NotificationService] Error handling ${eventName}:`, err);
    console.error("Payload:", payload);
  },
});

// We can also publish our own events
const publisher = new Publisher({
  events: NotificationEvents,
  transport,
});

// ============================================
// Email Templates (simulated)
// ============================================

const emailTemplates = {
  welcome: (data: { name: string }) => ({
    subject: "Welcome to Our Platform!",
    body: `Hi ${data.name},\n\nWelcome to our platform! We're excited to have you.`,
  }),

  orderConfirmation: (data: { orderId: string; total: number }) => ({
    subject: `Order Confirmation #${data.orderId}`,
    body: `Your order #${data.orderId} has been placed!\nTotal: $${data.total.toFixed(2)}`,
  }),

  orderShipped: (data: { orderId: string; trackingNumber: string; carrier: string }) => ({
    subject: `Your Order Has Shipped! #${data.orderId}`,
    body: `Your order is on its way!\nTracking: ${data.trackingNumber}\nCarrier: ${data.carrier}`,
  }),

  orderDelivered: (data: { orderId: string }) => ({
    subject: `Order Delivered! #${data.orderId}`,
    body: `Your order #${data.orderId} has been delivered. Enjoy!`,
  }),
};

// ============================================
// Simulated Email Sender
// ============================================

async function sendEmail(to: string, subject: string, body: string) {
  // In a real service, this would call an email API (SendGrid, SES, etc.)
  console.log(`
📧 Sending Email:
   To: ${to}
   Subject: ${subject}
   Body: ${body.substring(0, 50)}...
`);

  // Simulate network delay
  await new Promise((r) => setTimeout(r, 100));

  return { messageId: `msg_${Date.now()}` };
}

async function sendPushNotification(userId: string, title: string, body: string) {
  // In a real service, this would call a push notification service (FCM, APNs, etc.)
  console.log(`
📱 Sending Push Notification:
   User: ${userId}
   Title: ${title}
   Body: ${body}
`);
}

// ============================================
// Event Handlers
// ============================================

// Handle new user registration
subscriber.on("user.created", async (payload) => {
  console.log(`[NotificationService] New user: ${payload.name}`);

  const template = emailTemplates.welcome({ name: payload.name });
  const result = await sendEmail(payload.email, template.subject, template.body);

  await publisher.publish("notification.email.sent", {
    messageId: result.messageId,
    to: payload.email,
    sentAt: Date.now(),
  });
});

// Handle order placed
subscriber.on("order.placed", async (payload) => {
  console.log(`[NotificationService] Order placed: ${payload.orderId}`);

  // In a real service, you'd look up user email from a database
  const userEmail = `user_${payload.userId}@example.com`;

  const template = emailTemplates.orderConfirmation({
    orderId: payload.orderId,
    total: payload.total,
  });

  await sendEmail(userEmail, template.subject, template.body);

  // Also send push notification
  await sendPushNotification(
    payload.userId,
    "Order Placed!",
    `Your order #${payload.orderId} has been placed.`
  );
});

// Handle order shipped
subscriber.on("order.shipped", async (payload) => {
  console.log(`[NotificationService] Order shipped: ${payload.orderId}`);

  const userEmail = `user_${payload.userId}@example.com`;

  const template = emailTemplates.orderShipped({
    orderId: payload.orderId,
    trackingNumber: payload.trackingNumber,
    carrier: payload.carrier,
  });

  await sendEmail(userEmail, template.subject, template.body);

  await sendPushNotification(
    payload.userId,
    "Order Shipped!",
    `Track your order: ${payload.trackingNumber}`
  );
});

// Handle order delivered
subscriber.on("order.delivered", async (payload) => {
  console.log(`[NotificationService] Order delivered: ${payload.orderId}`);

  const userEmail = `user_${payload.userId}@example.com`;

  const template = emailTemplates.orderDelivered({ orderId: payload.orderId });
  await sendEmail(userEmail, template.subject, template.body);

  await sendPushNotification(payload.userId, "Order Delivered!", "Your order has arrived!");
});

// Handle low stock alerts (notify admin)
subscriber.on("inventory.lowStock", async (payload) => {
  console.log(`[NotificationService] Low stock alert: ${payload.productId}`);

  await sendEmail(
    "admin@example.com",
    `Low Stock Alert: ${payload.productId}`,
    `Product ${payload.productId} is running low.\nCurrent: ${payload.currentStock}\nThreshold: ${payload.threshold}`
  );
});

// ============================================
// Main
// ============================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║          Notification Service                     ║
╠═══════════════════════════════════════════════════╣
║  Redis: ${REDIS_URL.padEnd(41)}║
║  Listening for:                                   ║
║    - user.created                                 ║
║    - order.placed                                 ║
║    - order.shipped                                ║
║    - order.delivered                              ║
║    - inventory.lowStock                           ║
║                                                   ║
║  Middleware enabled:                              ║
║    - Subscriber Logging (distributed tracing)     ║
║    - Idempotency (duplicate prevention)           ║
║    - Timing (performance metrics)                 ║
╚═══════════════════════════════════════════════════╝
`);

  console.log("[NotificationService] Connecting to Redis...");
  await subscriber.subscribe();
  console.log("[NotificationService] Connected and listening for events!\n");

  // Print metrics every 30 seconds
  setInterval(() => {
    if (metrics.size > 0) {
      printMetrics();
    }
  }, 30000);

  // Keep service running
  console.log("[NotificationService] Waiting for events... Press Ctrl+C to stop.\n");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[NotificationService] Shutting down...");
  await subscriber.unsubscribe();
  await publisher.disconnect();
  process.exit(0);
});

main().catch(console.error);
