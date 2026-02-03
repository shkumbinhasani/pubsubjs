/**
 * Enhanced event definitions for the microservices example
 * Includes saga pattern, compensation, and event sourcing events
 */

import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

// ============================================
// Shared Schemas
// ============================================

const OrderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
});

const InventoryItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

// ============================================
// User Service Events
// ============================================

export const UserEvents = defineEvent([
  {
    name: "user.created",
    schema: z.object({
      userId: z.string(),
      email: z.string().email(),
      name: z.string().min(1),
      createdAt: z.number(),
    }),
    description: "Emitted when a new user is created",
  },
  {
    name: "user.updated",
    schema: z.object({
      userId: z.string(),
      changes: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        avatar: z.string().url().optional(),
      }),
      updatedAt: z.number(),
    }),
    description: "Emitted when user profile is updated",
  },
  {
    name: "user.deleted",
    schema: z.object({
      userId: z.string(),
      deletedAt: z.number(),
    }),
    description: "Emitted when a user is deleted",
  },
  {
    name: "user.validated",
    schema: z.object({
      userId: z.string(),
      email: z.string().email(),
      isValid: z.boolean(),
      validatedAt: z.number(),
    }),
    description: "Emitted when user validation is complete",
  },
]);

// ============================================
// Order Service Events (with Saga Pattern)
// ============================================

export const OrderEvents = defineEvent([
  // Saga Start
  {
    name: "order.placed",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      items: z.array(OrderItemSchema),
      total: z.number().nonnegative(),
      placedAt: z.number(),
      idempotencyKey: z.string(),
    }),
    description: "Saga: Step 1 - Order placed, inventory reservation requested",
  },
  // Saga Steps
  {
    name: "order.inventory.reserved",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      items: z.array(OrderItemSchema),
      reservedAt: z.number(),
    }),
    description: "Saga: Step 2 - Inventory reserved, payment requested",
  },
  {
    name: "order.payment.processed",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      paymentId: z.string(),
      amount: z.number().nonnegative(),
      processedAt: z.number(),
    }),
    description: "Saga: Step 3 - Payment processed, shipping requested",
  },
  {
    name: "order.shipment.prepared",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      trackingNumber: z.string(),
      carrier: z.string(),
      preparedAt: z.number(),
    }),
    description: "Saga: Step 4 - Shipment prepared, order completed",
  },
  // Saga Completion
  {
    name: "order.completed",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      paymentId: z.string(),
      trackingNumber: z.string(),
      completedAt: z.number(),
    }),
    description: "Saga: Completed successfully",
  },
  // Saga Compensation Events
  {
    name: "order.compensation.inventory.release",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      reason: z.string(),
      releasedAt: z.number(),
    }),
    description: "Saga Compensation: Release inventory reservation",
  },
  {
    name: "order.compensation.payment.refund",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      paymentId: z.string(),
      amount: z.number().nonnegative(),
      reason: z.string(),
      refundedAt: z.number(),
    }),
    description: "Saga Compensation: Refund payment",
  },
  {
    name: "order.compensation.shipment.cancel",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      trackingNumber: z.string(),
      reason: z.string(),
      cancelledAt: z.number(),
    }),
    description: "Saga Compensation: Cancel shipment",
  },
  // Legacy events for backward compatibility
  {
    name: "order.paid",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      paymentId: z.string(),
      amount: z.number().nonnegative(),
      paidAt: z.number(),
    }),
    description: "Emitted when an order payment is completed",
  },
  {
    name: "order.shipped",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      trackingNumber: z.string(),
      carrier: z.string(),
      shippedAt: z.number(),
    }),
    description: "Emitted when an order is shipped",
  },
  {
    name: "order.delivered",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      deliveredAt: z.number(),
    }),
    description: "Emitted when an order is delivered",
  },
  {
    name: "order.cancelled",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      reason: z.string(),
      cancelledAt: z.number(),
    }),
    description: "Emitted when an order is cancelled",
  },
  // Event Sourcing Events
  {
    name: "order.event.created",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      items: z.array(OrderItemSchema),
      total: z.number().nonnegative(),
      timestamp: z.number(),
      version: z.number(),
    }),
    description: "Event Sourcing: Order aggregate created",
  },
  {
    name: "order.event.updated",
    schema: z.object({
      orderId: z.string(),
      changes: z.record(z.unknown()),
      timestamp: z.number(),
      version: z.number(),
    }),
    description: "Event Sourcing: Order aggregate updated",
  },
  {
    name: "order.event.status.changed",
    schema: z.object({
      orderId: z.string(),
      previousStatus: z.string(),
      newStatus: z.string(),
      timestamp: z.number(),
      version: z.number(),
    }),
    description: "Event Sourcing: Order status changed",
  },
]);

// ============================================
// Payment Service Events
// ============================================

export const PaymentEvents = defineEvent([
  {
    name: "payment.requested",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      amount: z.number().nonnegative(),
      currency: z.string().default("USD"),
      idempotencyKey: z.string(),
      requestedAt: z.number(),
    }),
    description: "Payment processing requested",
  },
  {
    name: "payment.processed",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      paymentId: z.string(),
      amount: z.number().nonnegative(),
      status: z.enum(["success", "failed", "pending"]),
      processedAt: z.number(),
    }),
    description: "Payment processing completed",
  },
  {
    name: "payment.refund.requested",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      paymentId: z.string(),
      amount: z.number().nonnegative(),
      reason: z.string(),
      requestedAt: z.number(),
    }),
    description: "Refund requested",
  },
  {
    name: "payment.refunded",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      paymentId: z.string(),
      amount: z.number().nonnegative(),
      refundedAt: z.number(),
    }),
    description: "Refund completed",
  },
  {
    name: "payment.failed",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      amount: z.number().nonnegative(),
      error: z.string(),
      failedAt: z.number(),
    }),
    description: "Payment processing failed",
  },
]);

// ============================================
// Shipping Service Events
// ============================================

export const ShippingEvents = defineEvent([
  {
    name: "shipping.requested",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      items: z.array(OrderItemSchema),
      address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
        country: z.string(),
      }),
      requestedAt: z.number(),
    }),
    description: "Shipping preparation requested",
  },
  {
    name: "shipping.prepared",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      trackingNumber: z.string(),
      carrier: z.string(),
      estimatedDelivery: z.number(),
      preparedAt: z.number(),
    }),
    description: "Shipment prepared and ready",
  },
  {
    name: "shipping.cancelled",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      trackingNumber: z.string(),
      reason: z.string(),
      cancelledAt: z.number(),
    }),
    description: "Shipment cancelled",
  },
  {
    name: "shipping.delivered",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      trackingNumber: z.string(),
      deliveredAt: z.number(),
    }),
    description: "Shipment delivered",
  },
]);

// ============================================
// Inventory Service Events
// ============================================

export const InventoryEvents = defineEvent([
  {
    name: "inventory.reservation.requested",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      items: z.array(InventoryItemSchema),
      idempotencyKey: z.string(),
      requestedAt: z.number(),
    }),
    description: "Inventory reservation requested",
  },
  {
    name: "inventory.reserved",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      items: z.array(InventoryItemSchema),
      reservationId: z.string(),
      reservedAt: z.number(),
    }),
    description: "Inventory reserved successfully",
  },
  {
    name: "inventory.reservation.failed",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      items: z.array(InventoryItemSchema),
      reason: z.string(),
      failedAt: z.number(),
    }),
    description: "Inventory reservation failed",
  },
  {
    name: "inventory.release.requested",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      reservationId: z.string(),
      reason: z.string(),
      requestedAt: z.number(),
    }),
    description: "Inventory release requested",
  },
  {
    name: "inventory.released",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      reservationId: z.string(),
      items: z.array(InventoryItemSchema),
      releasedAt: z.number(),
    }),
    description: "Inventory released",
  },
  {
    name: "inventory.committed",
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      reservationId: z.string(),
      items: z.array(InventoryItemSchema),
      committedAt: z.number(),
    }),
    description: "Inventory committed (deducted from stock)",
  },
  {
    name: "inventory.lowStock",
    schema: z.object({
      productId: z.string(),
      currentStock: z.number().int().nonnegative(),
      threshold: z.number().int().nonnegative(),
    }),
    description: "Emitted when product stock falls below threshold",
  },
]);

// ============================================
// Notification Events
// ============================================

export const NotificationEvents = defineEvent([
  {
    name: "notification.email.send",
    schema: z.object({
      to: z.string().email(),
      subject: z.string(),
      template: z.string(),
      data: z.record(z.unknown()),
      idempotencyKey: z.string().optional(),
    }),
    description: "Request to send an email notification",
  },
  {
    name: "notification.email.sent",
    schema: z.object({
      messageId: z.string(),
      to: z.string().email(),
      sentAt: z.number(),
    }),
    description: "Emitted when email was successfully sent",
  },
  {
    name: "notification.email.failed",
    schema: z.object({
      to: z.string().email(),
      error: z.string(),
      failedAt: z.number(),
    }),
    description: "Emitted when email sending failed",
  },
  {
    name: "notification.push.send",
    schema: z.object({
      userId: z.string(),
      title: z.string(),
      body: z.string(),
      data: z.record(z.unknown()).optional(),
    }),
    description: "Request to send a push notification",
  },
  {
    name: "notification.sms.send",
    schema: z.object({
      phone: z.string(),
      message: z.string(),
      template: z.string().optional(),
    }),
    description: "Request to send an SMS notification",
  },
]);

// ============================================
// Service Discovery & Health Events
// ============================================

export const ServiceEvents = defineEvent([
  {
    name: "service.registered",
    schema: z.object({
      serviceId: z.string(),
      serviceName: z.string(),
      serviceType: z.enum(["user", "order", "inventory", "payment", "shipping", "notification", "gateway"]),
      host: z.string(),
      port: z.number(),
      healthCheckUrl: z.string(),
      metadata: z.record(z.unknown()).optional(),
      registeredAt: z.number(),
    }),
    description: "Service registered with discovery",
  },
  {
    name: "service.deregistered",
    schema: z.object({
      serviceId: z.string(),
      serviceName: z.string(),
      reason: z.string(),
      deregisteredAt: z.number(),
    }),
    description: "Service deregistered from discovery",
  },
  {
    name: "service.health.check",
    schema: z.object({
      serviceId: z.string(),
      serviceName: z.string(),
      timestamp: z.number(),
    }),
    description: "Health check request",
  },
  {
    name: "service.health.status",
    schema: z.object({
      serviceId: z.string(),
      serviceName: z.string(),
      status: z.enum(["healthy", "unhealthy", "degraded"]),
      checks: z.array(z.object({
        name: z.string(),
        status: z.enum(["pass", "fail", "warn"]),
        responseTime: z.number(),
        message: z.string().optional(),
      })),
      timestamp: z.number(),
    }),
    description: "Health check response",
  },
  {
    name: "service.heartbeat",
    schema: z.object({
      serviceId: z.string(),
      serviceName: z.string(),
      timestamp: z.number(),
      metrics: z.object({
        cpu: z.number().optional(),
        memory: z.number().optional(),
        requestsPerSecond: z.number().optional(),
        errorRate: z.number().optional(),
      }).optional(),
    }),
    description: "Service heartbeat",
  },
]);

// ============================================
// Dead Letter Queue Events
// ============================================

export const DLQEvents = defineEvent([
  {
    name: "dlq.message.received",
    schema: z.object({
      messageId: z.string(),
      originalEvent: z.string(),
      originalPayload: z.record(z.unknown()),
      error: z.string(),
      serviceName: z.string(),
      retryCount: z.number(),
      receivedAt: z.number(),
    }),
    description: "Message moved to dead letter queue",
  },
  {
    name: "dlq.message.retry",
    schema: z.object({
      messageId: z.string(),
      originalEvent: z.string(),
      retryCount: z.number(),
      retriedAt: z.number(),
    }),
    description: "Retrying message from DLQ",
  },
  {
    name: "dlq.message.failed",
    schema: z.object({
      messageId: z.string(),
      originalEvent: z.string(),
      error: z.string(),
      finalFailureAt: z.number(),
    }),
    description: "Message failed permanently after retries",
  },
]);

// ============================================
// Metrics & Monitoring Events
// ============================================

export const MetricsEvents = defineEvent([
  {
    name: "metrics.event.processed",
    schema: z.object({
      serviceName: z.string(),
      eventName: z.string(),
      processingTime: z.number(),
      success: z.boolean(),
      timestamp: z.number(),
    }),
    description: "Event processing metrics",
  },
  {
    name: "metrics.circuit.breaker.state",
    schema: z.object({
      serviceName: z.string(),
      targetService: z.string(),
      state: z.enum(["closed", "open", "half-open"]),
      failureCount: z.number(),
      timestamp: z.number(),
    }),
    description: "Circuit breaker state change",
  },
  {
    name: "metrics.saga.completed",
    schema: z.object({
      orderId: z.string(),
      duration: z.number(),
      success: z.boolean(),
      compensationTriggered: z.boolean(),
      timestamp: z.number(),
    }),
    description: "Saga completion metrics",
  },
]);

// ============================================
// Combined events for services
// ============================================

export const AllEvents = {
  ...UserEvents,
  ...OrderEvents,
  ...PaymentEvents,
  ...ShippingEvents,
  ...InventoryEvents,
  ...NotificationEvents,
  ...ServiceEvents,
  ...DLQEvents,
  ...MetricsEvents,
};

// Event categories for specific service needs
export const OrderSagaEvents = {
  ...OrderEvents,
  ...PaymentEvents,
  ...ShippingEvents,
  ...InventoryEvents,
};

export const SystemEvents = {
  ...ServiceEvents,
  ...DLQEvents,
  ...MetricsEvents,
};
