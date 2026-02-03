/**
 * Demo orchestrator for the microservices system
 * Demonstrates the complete order flow with saga pattern
 */

import { RedisTransport } from "@pubsubjs/transport-redis";
import { Publisher, generateMessageId } from "@pubsubjs/core";
import { OrderEvents, UserEvents } from "./events.ts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ============================================
// Demo Setup
// ============================================

const transport = new RedisTransport({
  url: REDIS_URL,
  channelPrefix: "microservices",
});

const orderPublisher = new Publisher({
  events: OrderEvents,
  transport,
});

const userPublisher = new Publisher({
  events: UserEvents,
  transport,
});

// ============================================
// Demo Scenarios
// ============================================

async function demoUserRegistration() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 1: User Registration");
  console.log("=".repeat(60) + "\n");

  const userId = `user_${generateMessageId()}`;

  console.log("Creating new user...");
  await userPublisher.publish("user.created", {
    userId,
    email: "alice@example.com",
    name: "Alice Johnson",
    createdAt: Date.now(),
  });

  console.log("✓ User created event published");
  await new Promise((r) => setTimeout(r, 1000));
}

async function demoSuccessfulOrder() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 2: Successful Order Flow (Saga Pattern)");
  console.log("=".repeat(60) + "\n");

  const orderId = `order_${generateMessageId()}`;
  const userId = `user_${generateMessageId()}`;
  const idempotencyKey = `idem_${generateMessageId()}`;

  console.log("Step 1: Placing order...");
  console.log(`  Order ID: ${orderId}`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Items: 2x Widget ($29.99), 1x Gadget ($49.99)`);
  console.log(`  Total: $109.97`);

  await orderPublisher.publish("order.placed", {
    orderId,
    userId,
    items: [
      { productId: "WIDGET-001", quantity: 2, price: 29.99 },
      { productId: "GADGET-002", quantity: 1, price: 49.99 },
    ],
    total: 109.97,
    placedAt: Date.now(),
    idempotencyKey,
  });

  console.log("✓ Order placed event published\n");
  console.log("Waiting for saga completion...");
  console.log("  - Inventory Service: Reserving stock");
  console.log("  - Payment Service: Processing payment");
  console.log("  - Shipping Service: Preparing shipment");
  console.log("  - Notification Service: Sending confirmations\n");

  // Wait for saga to complete
  await new Promise((r) => setTimeout(r, 5000));
}

async function demoFailedOrderWithCompensation() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 3: Failed Order with Compensation");
  console.log("=".repeat(60) + "\n");

  const orderId = `order_${generateMessageId()}`;
  const userId = `user_${generateMessageId()}`;
  const idempotencyKey = `idem_${generateMessageId()}`;

  console.log("Step 1: Placing order with insufficient inventory...");
  console.log(`  Order ID: ${orderId}`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Items: 1000x Rare Item (will fail)\n`);

  await orderPublisher.publish("order.placed", {
    orderId,
    userId,
    items: [
      { productId: "RARE-ITEM", quantity: 1000, price: 999.99 },
    ],
    total: 999990.00,
    placedAt: Date.now(),
    idempotencyKey,
  });

  console.log("✓ Order placed event published\n");
  console.log("Waiting for saga failure and compensation...");
  console.log("  - Inventory Service: Will fail to reserve");
  console.log("  - Compensation: Release any reserved items");
  console.log("  - Notification Service: Send failure notification\n");

  await new Promise((r) => setTimeout(r, 5000));
}

async function demoOrderCancellation() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 4: Order Cancellation");
  console.log("=".repeat(60) + "\n");

  const orderId = `order_${generateMessageId()}`;
  const userId = `user_${generateMessageId()}`;
  const idempotencyKey = `idem_${generateMessageId()}`;

  // First place an order
  console.log("Step 1: Placing order...");
  await orderPublisher.publish("order.placed", {
    orderId,
    userId,
    items: [
      { productId: "WIDGET-001", quantity: 1, price: 29.99 },
    ],
    total: 29.99,
    placedAt: Date.now(),
    idempotencyKey,
  });

  console.log("✓ Order placed\n");
  await new Promise((r) => setTimeout(r, 2000));

  // Then cancel it
  console.log("Step 2: Cancelling order...");
  await orderPublisher.publish("order.cancelled", {
    orderId,
    userId,
    reason: "Customer requested cancellation",
    cancelledAt: Date.now(),
  });

  console.log("✓ Order cancelled\n");
  console.log("Compensation triggered:");
  console.log("  - Inventory Service: Releasing reservation");
  console.log("  - Payment Service: Processing refund");
  console.log("  - Notification Service: Sending cancellation confirmation\n");

  await new Promise((r) => setTimeout(r, 3000));
}

async function demoIdempotency() {
  console.log("\n" + "=".repeat(60));
  console.log("DEMO 5: Idempotency - Duplicate Event Handling");
  console.log("=".repeat(60) + "\n");

  const orderId = `order_${generateMessageId()}`;
  const userId = `user_${generateMessageId()}`;
  const idempotencyKey = `idem_${generateMessageId()}`;

  console.log("Publishing the same order event 3 times...");
  console.log(`  Order ID: ${orderId}`);
  console.log(`  Idempotency Key: ${idempotencyKey}\n`);

  for (let i = 1; i <= 3; i++) {
    console.log(`  Attempt ${i}...`);
    await orderPublisher.publish("order.placed", {
      orderId,
      userId,
      items: [{ productId: "WIDGET-001", quantity: 1, price: 29.99 }],
      total: 29.99,
      placedAt: Date.now(),
      idempotencyKey,
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n✓ Only one order should be processed (check service logs)");
  await new Promise((r) => setTimeout(r, 3000));
}

// ============================================
// Main Demo
// ============================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     Microservices Demo - Event-Driven Architecture           ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Redis: ${REDIS_URL.padEnd(47)}║
║  Features:                                                   ║
║    • Saga Pattern for Distributed Transactions              ║
║    • Circuit Breaker for Resilience                         ║
║    • Idempotency Keys for Duplicate Handling                ║
║    • Event Sourcing for Order Lifecycle                     ║
║    • Dead Letter Queue for Failed Events                    ║
║    • Service Discovery & Health Checks                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

  console.log("Make sure all services are running:");
  console.log("  bun run user-service.ts");
  console.log("  bun run order-service.ts");
  console.log("  bun run inventory-service.ts");
  console.log("  bun run payment-service.ts");
  console.log("  bun run shipping-service.ts");
  console.log("  bun run notification-service.ts\n");

  console.log("Connecting to Redis...");
  await orderPublisher.connect();
  await userPublisher.connect();
  console.log("Connected!\n");

  // Run all demos
  try {
    await demoUserRegistration();
    await demoSuccessfulOrder();
    await demoFailedOrderWithCompensation();
    await demoOrderCancellation();
    await demoIdempotency();

    console.log("\n" + "=".repeat(60));
    console.log("All demos completed!");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("Demo failed:", error);
  }

  // Cleanup
  await orderPublisher.disconnect();
  await userPublisher.disconnect();
  process.exit(0);
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await orderPublisher.disconnect();
  await userPublisher.disconnect();
  process.exit(0);
});

main().catch(console.error);
