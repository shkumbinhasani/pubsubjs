/**
 * Inventory Service - Manages product stock
 *
 * This service:
 * - Listens for order events
 * - Reserves and releases inventory
 * - Publishes inventory events
 * - Demonstrates subscriber middleware for idempotency and logging
 *
 * Run with: bun examples/microservices-redis/inventory-service.ts
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
import { OrderEvents, InventoryEvents } from "./events.ts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ============================================
// Idempotency Store (In-memory for demo)
// In production, use Redis or a database for durability
// This is critical for inventory operations to prevent
// double-reservations when messages are redelivered
// ============================================

const processedMessages = new Set<string>();

// ============================================
// Metrics Collection
// ============================================

interface EventMetrics {
  count: number;
  totalDuration: number;
  avgDuration: number;
}

const metrics = new Map<string, EventMetrics>();

function recordTiming(eventName: string, durationMs: number): void {
  const existing = metrics.get(eventName);
  if (existing) {
    existing.count++;
    existing.totalDuration += durationMs;
    existing.avgDuration = existing.totalDuration / existing.count;
  } else {
    metrics.set(eventName, {
      count: 1,
      totalDuration: durationMs,
      avgDuration: durationMs,
    });
  }
  console.log(
    `[InventoryService] Metrics: ${eventName} processed in ${durationMs}ms (avg: ${metrics.get(eventName)!.avgDuration.toFixed(2)}ms)`
  );
}

// ============================================
// Service Setup
// ============================================

const transport = new RedisTransport({
  url: REDIS_URL,
  channelPrefix: "microservices",
});

// Subscriber with middleware stack:
// - Logging for observability
// - Idempotency to prevent double-reservations
// - Timing for performance monitoring
const subscriber = new Subscriber({
  events: OrderEvents,
  transport,
  middleware: [
    // Log all incoming events
    createSubscriberLoggingMiddleware(),
    // Prevent duplicate processing - critical for inventory!
    // Without this, a redelivered "order.placed" event could
    // reserve the same inventory twice
    createIdempotencyMiddleware({
      hasProcessed: async (messageId) => processedMessages.has(messageId),
      markProcessed: async (messageId) => {
        processedMessages.add(messageId);
      },
    }),
    // Track processing time for SLA monitoring
    createSubscriberTimingMiddleware(recordTiming),
  ],
  onError: (err, eventName) => {
    console.error(`[InventoryService] Error handling ${eventName}:`, err);
  },
});

const publisher = new Publisher({
  events: InventoryEvents,
  transport,
});

// ============================================
// Inventory State (in-memory for demo)
// ============================================

interface ProductStock {
  productId: string;
  available: number;
  reserved: number;
  lowStockThreshold: number;
}

const inventory = new Map<string, ProductStock>([
  ["WIDGET-001", { productId: "WIDGET-001", available: 100, reserved: 0, lowStockThreshold: 10 }],
  ["GADGET-002", { productId: "GADGET-002", available: 50, reserved: 0, lowStockThreshold: 5 }],
  ["GIZMO-003", { productId: "GIZMO-003", available: 25, reserved: 0, lowStockThreshold: 5 }],
]);

// Track reservations by order
const reservationsByOrder = new Map<string, Array<{ productId: string; quantity: number }>>();

// ============================================
// Inventory Logic
// ============================================

function getStock(productId: string): ProductStock | undefined {
  return inventory.get(productId);
}

function canReserve(productId: string, quantity: number): boolean {
  const stock = inventory.get(productId);
  if (!stock) return false;
  return stock.available - stock.reserved >= quantity;
}

async function reserveStock(
  orderId: string,
  items: Array<{ productId: string; quantity: number }>
): Promise<boolean> {
  // First check if all items can be reserved
  for (const item of items) {
    if (!canReserve(item.productId, item.quantity)) {
      console.log(`[InventoryService] Cannot reserve ${item.productId}: insufficient stock`);
      return false;
    }
  }

  // Reserve all items
  for (const item of items) {
    const stock = inventory.get(item.productId)!;
    stock.reserved += item.quantity;
    console.log(
      `[InventoryService] Reserved ${item.quantity}x ${item.productId} ` +
        `(available: ${stock.available}, reserved: ${stock.reserved})`
    );

    // Check for low stock
    const effectiveStock = stock.available - stock.reserved;
    if (effectiveStock <= stock.lowStockThreshold) {
      console.log(`[InventoryService] Low stock alert for ${item.productId}!`);
      await publisher.publish("inventory.lowStock", {
        productId: item.productId,
        currentStock: effectiveStock,
        threshold: stock.lowStockThreshold,
      });
    }
  }

  // Track reservation
  reservationsByOrder.set(orderId, items);

  return true;
}

async function releaseStock(orderId: string): Promise<boolean> {
  const reservation = reservationsByOrder.get(orderId);
  if (!reservation) {
    console.log(`[InventoryService] No reservation found for order ${orderId}`);
    return false;
  }

  for (const item of reservation) {
    const stock = inventory.get(item.productId);
    if (stock) {
      stock.reserved = Math.max(0, stock.reserved - item.quantity);
      console.log(
        `[InventoryService] Released ${item.quantity}x ${item.productId} ` +
          `(available: ${stock.available}, reserved: ${stock.reserved})`
      );
    }
  }

  reservationsByOrder.delete(orderId);
  return true;
}

function commitReservation(orderId: string): boolean {
  const reservation = reservationsByOrder.get(orderId);
  if (!reservation) return false;

  for (const item of reservation) {
    const stock = inventory.get(item.productId);
    if (stock) {
      stock.available -= item.quantity;
      stock.reserved -= item.quantity;
      console.log(
        `[InventoryService] Committed ${item.quantity}x ${item.productId} ` +
          `(available: ${stock.available}, reserved: ${stock.reserved})`
      );
    }
  }

  reservationsByOrder.delete(orderId);
  return true;
}

// ============================================
// Event Handlers
// ============================================

// When an order is placed, reserve inventory
subscriber.on("order.placed", async (payload) => {
  console.log(`\n[InventoryService] Order placed: ${payload.orderId}`);

  const items = payload.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));

  const success = await reserveStock(payload.orderId, items);

  if (success) {
    await publisher.publish("inventory.reserved", {
      orderId: payload.orderId,
      items,
      reservedAt: Date.now(),
    });
    console.log(`[InventoryService] Published inventory.reserved event`);
  } else {
    // In a real system, you might publish a failure event
    console.log(`[InventoryService] Failed to reserve inventory for ${payload.orderId}`);
  }
});

// When payment is confirmed, commit the reservation (deduct from available)
subscriber.on("order.paid", async (payload) => {
  console.log(`\n[InventoryService] Order paid: ${payload.orderId}`);
  const success = commitReservation(payload.orderId);
  if (success) {
    console.log(`[InventoryService] Inventory committed for ${payload.orderId}`);
  }
});

// When an order is cancelled, release the reserved inventory
subscriber.on("order.cancelled", async (payload) => {
  console.log(`\n[InventoryService] Order cancelled: ${payload.orderId}`);

  const reservation = reservationsByOrder.get(payload.orderId);
  if (reservation) {
    await releaseStock(payload.orderId);

    await publisher.publish("inventory.released", {
      orderId: payload.orderId,
      items: reservation,
      releasedAt: Date.now(),
    });
    console.log(`[InventoryService] Published inventory.released event`);
  }
});

// ============================================
// Main
// ============================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║           Inventory Service                       ║
╠═══════════════════════════════════════════════════╣
║  Redis: ${REDIS_URL.padEnd(41)}║
║  Publishing: inventory.* events                   ║
║  Listening: order.* events                        ║
║                                                   ║
║  Initial Stock:                                   ║
║    WIDGET-001: 100 units                          ║
║    GADGET-002: 50 units                           ║
║    GIZMO-003: 25 units                            ║
║                                                   ║
║  Middleware enabled:                              ║
║    - Subscriber Logging (event tracing)           ║
║    - Idempotency (prevents double-reservations)   ║
║    - Timing (performance metrics)                 ║
╚═══════════════════════════════════════════════════╝
`);

  console.log("[InventoryService] Connecting to Redis...");
  await publisher.connect();
  await subscriber.subscribe();
  console.log("[InventoryService] Connected and listening for events!\n");

  console.log("[InventoryService] Waiting for order events... Press Ctrl+C to stop.\n");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[InventoryService] Shutting down...");
  await subscriber.unsubscribe();
  await publisher.disconnect();
  process.exit(0);
});

main().catch(console.error);
