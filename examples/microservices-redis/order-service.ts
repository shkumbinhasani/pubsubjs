/**
 * Order Service - Handles order processing
 *
 * This service:
 * - Processes new orders
 * - Listens for inventory events
 * - Publishes order lifecycle events
 * - Demonstrates subscriber middleware for logging and idempotency
 *
 * Run with: bun examples/microservices-redis/order-service.ts
 * Note: Requires Redis running on localhost:6379
 */

import {
  Subscriber,
  Publisher,
  generateMessageId,
  createSubscriberLoggingMiddleware,
  createIdempotencyMiddleware,
} from "@pubsubjs/core";
import { RedisTransport } from "@pubsubjs/transport-redis";
import { OrderEvents, InventoryEvents } from "./events.ts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ============================================
// Idempotency Store
// ============================================

const processedMessages = new Set<string>();

// ============================================
// Service Setup
// ============================================

const transport = new RedisTransport({
  url: REDIS_URL,
  channelPrefix: "microservices",
});

// Publisher for order events
const publisher = new Publisher({
  events: OrderEvents,
  transport,
});

// Subscriber for inventory events with middleware
const subscriber = new Subscriber({
  events: InventoryEvents,
  transport,
  middleware: [
    // Log incoming inventory events for debugging
    createSubscriberLoggingMiddleware(),
    // Prevent duplicate processing of inventory responses
    createIdempotencyMiddleware({
      hasProcessed: async (messageId) => processedMessages.has(messageId),
      markProcessed: async (messageId) => {
        processedMessages.add(messageId);
      },
    }),
  ],
  onError: (err, eventName) => {
    console.error(`[OrderService] Error handling ${eventName}:`, err);
  },
});

// Helper to provide a unified interface similar to PubSub
const orderService = {
  publish: publisher.publish.bind(publisher),
  on: subscriber.on.bind(subscriber),
  async start() {
    await publisher.connect();
    await subscriber.subscribe();
  },
  async stop() {
    await subscriber.unsubscribe();
    await publisher.disconnect();
  },
};

// ============================================
// Order State (in-memory for demo)
// ============================================

interface Order {
  id: string;
  userId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  total: number;
  status: "pending" | "reserved" | "paid" | "shipped" | "delivered" | "cancelled";
  createdAt: number;
}

const orders = new Map<string, Order>();
const pendingReservations = new Map<string, Order>(); // orderId -> order waiting for reservation

// ============================================
// Order Processing Logic
// ============================================

async function placeOrder(
  userId: string,
  items: Array<{ productId: string; quantity: number; price: number }>
) {
  const orderId = `order_${generateMessageId()}`;
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order: Order = {
    id: orderId,
    userId,
    items,
    total,
    status: "pending",
    createdAt: Date.now(),
  };

  orders.set(orderId, order);
  pendingReservations.set(orderId, order);

  console.log(`[OrderService] Creating order ${orderId} for user ${userId}`);
  console.log(`[OrderService] Items: ${items.map((i) => `${i.productId}x${i.quantity}`).join(", ")}`);
  console.log(`[OrderService] Total: $${total.toFixed(2)}`);

  // Publish order.placed event
  // The inventory service will listen and reserve stock
  await orderService.publish("order.placed", {
    orderId,
    userId,
    items,
    total,
    placedAt: Date.now(),
  });

  console.log(`[OrderService] Published order.placed event`);

  return order;
}

async function processPayment(orderId: string) {
  const order = orders.get(orderId);
  if (!order) {
    console.log(`[OrderService] Order ${orderId} not found`);
    return;
  }

  if (order.status !== "reserved") {
    console.log(`[OrderService] Order ${orderId} is not ready for payment (status: ${order.status})`);
    return;
  }

  console.log(`[OrderService] Processing payment for order ${orderId}`);

  // Simulate payment processing
  await new Promise((r) => setTimeout(r, 500));

  order.status = "paid";
  const paymentId = `pay_${generateMessageId()}`;

  await orderService.publish("order.paid", {
    orderId,
    userId: order.userId,
    paymentId,
    amount: order.total,
    paidAt: Date.now(),
  });

  console.log(`[OrderService] Payment processed: ${paymentId}`);
}

async function shipOrder(orderId: string) {
  const order = orders.get(orderId);
  if (!order || order.status !== "paid") {
    console.log(`[OrderService] Order ${orderId} cannot be shipped`);
    return;
  }

  console.log(`[OrderService] Shipping order ${orderId}`);

  order.status = "shipped";
  const trackingNumber = `TRACK${Date.now()}`;

  await orderService.publish("order.shipped", {
    orderId,
    userId: order.userId,
    trackingNumber,
    carrier: "FastShip",
    shippedAt: Date.now(),
  });

  console.log(`[OrderService] Order shipped with tracking: ${trackingNumber}`);
}

async function deliverOrder(orderId: string) {
  const order = orders.get(orderId);
  if (!order || order.status !== "shipped") {
    console.log(`[OrderService] Order ${orderId} cannot be delivered`);
    return;
  }

  console.log(`[OrderService] Delivering order ${orderId}`);

  order.status = "delivered";

  await orderService.publish("order.delivered", {
    orderId,
    userId: order.userId,
    deliveredAt: Date.now(),
  });

  console.log(`[OrderService] Order delivered!`);
}

async function cancelOrder(orderId: string, reason: string) {
  const order = orders.get(orderId);
  if (!order) {
    console.log(`[OrderService] Order ${orderId} not found`);
    return;
  }

  if (order.status === "delivered") {
    console.log(`[OrderService] Cannot cancel delivered order ${orderId}`);
    return;
  }

  console.log(`[OrderService] Cancelling order ${orderId}: ${reason}`);

  order.status = "cancelled";

  await orderService.publish("order.cancelled", {
    orderId,
    userId: order.userId,
    reason,
    cancelledAt: Date.now(),
  });

  console.log(`[OrderService] Order cancelled`);
}

// ============================================
// Event Handlers
// ============================================

// Listen for inventory reservation confirmation
orderService.on("inventory.reserved", async (payload) => {
  const order = pendingReservations.get(payload.orderId);
  if (order) {
    console.log(`[OrderService] Inventory reserved for order ${payload.orderId}`);
    order.status = "reserved";
    pendingReservations.delete(payload.orderId);

    // Auto-process payment in demo
    await processPayment(payload.orderId);
  }
});

// Listen for inventory release (when order is cancelled externally)
orderService.on("inventory.released", async (payload) => {
  const order = orders.get(payload.orderId);
  if (order && order.status !== "cancelled") {
    console.log(`[OrderService] Inventory released for order ${payload.orderId}`);
    // This might happen if inventory runs out
  }
});

// ============================================
// Demo: Simulate Order Flow
// ============================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║             Order Service                         ║
╠═══════════════════════════════════════════════════╣
║  Redis: ${REDIS_URL.padEnd(41)}║
║  Publishing: order.* events                       ║
║  Listening: inventory.* events                    ║
║                                                   ║
║  Middleware enabled:                              ║
║    - Subscriber Logging (event tracing)           ║
║    - Idempotency (duplicate prevention)           ║
╚═══════════════════════════════════════════════════╝
`);

  console.log("[OrderService] Connecting to Redis...");
  await orderService.start();
  console.log("[OrderService] Connected!\n");

  // Wait a bit for other services to connect
  await new Promise((r) => setTimeout(r, 1000));

  console.log("=== Simulating Order Flow ===\n");

  // Place an order
  const order = await placeOrder("user_123", [
    { productId: "WIDGET-001", quantity: 2, price: 29.99 },
    { productId: "GADGET-002", quantity: 1, price: 49.99 },
  ]);

  // Wait for inventory reservation and payment
  await new Promise((r) => setTimeout(r, 2000));

  // Ship the order
  await shipOrder(order.id);

  await new Promise((r) => setTimeout(r, 1000));

  // Deliver the order
  await deliverOrder(order.id);

  console.log("\n[OrderService] Demo complete!");

  // Place another order and cancel it
  await new Promise((r) => setTimeout(r, 2000));

  console.log("\n=== Simulating Cancelled Order ===\n");

  const cancelledOrder = await placeOrder("user_456", [
    { productId: "GIZMO-003", quantity: 5, price: 19.99 },
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  await cancelOrder(cancelledOrder.id, "Customer requested cancellation");

  console.log("\n[OrderService] Keeping service running... Press Ctrl+C to stop.\n");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[OrderService] Shutting down...");
  await orderService.stop();
  process.exit(0);
});

main().catch(console.error);
