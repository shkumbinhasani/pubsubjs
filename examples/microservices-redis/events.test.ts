/**
 * Tests for microservices-redis example events
 */

import { test, expect, describe } from "bun:test";
import { 
  UserEvents, 
  OrderEvents, 
  InventoryEvents, 
  NotificationEvents,
  PaymentEvents,
  ShippingEvents,
  ServiceEvents,
  DLQEvents,
  MetricsEvents,
  AllEvents 
} from "./events.ts";

describe("Microservices Redis Events", () => {
  describe("UserEvents", () => {
    test("has all user events", () => {
      expect(Object.keys(UserEvents)).toContain("user.created");
      expect(Object.keys(UserEvents)).toContain("user.updated");
      expect(Object.keys(UserEvents)).toContain("user.deleted");
      expect(Object.keys(UserEvents)).toContain("user.validated");
    });

    test("user.created has description", () => {
      expect(UserEvents["user.created"].options?.description).toBe("Emitted when a new user is created");
    });
  });

  describe("OrderEvents", () => {
    test("has all order events", () => {
      expect(Object.keys(OrderEvents)).toContain("order.placed");
      expect(Object.keys(OrderEvents)).toContain("order.paid");
      expect(Object.keys(OrderEvents)).toContain("order.shipped");
      expect(Object.keys(OrderEvents)).toContain("order.delivered");
      expect(Object.keys(OrderEvents)).toContain("order.cancelled");
      expect(Object.keys(OrderEvents)).toContain("order.completed");
      expect(Object.keys(OrderEvents)).toContain("order.inventory.reserved");
      expect(Object.keys(OrderEvents)).toContain("order.payment.processed");
      expect(Object.keys(OrderEvents)).toContain("order.shipment.prepared");
      expect(Object.keys(OrderEvents)).toContain("order.compensation.inventory.release");
      expect(Object.keys(OrderEvents)).toContain("order.compensation.payment.refund");
      expect(Object.keys(OrderEvents)).toContain("order.compensation.shipment.cancel");
      expect(Object.keys(OrderEvents)).toContain("order.event.created");
      expect(Object.keys(OrderEvents)).toContain("order.event.updated");
      expect(Object.keys(OrderEvents)).toContain("order.event.status.changed");
    });

    test("order.placed has saga description", () => {
      expect(OrderEvents["order.placed"].options?.description).toContain("Saga");
    });
  });

  describe("PaymentEvents", () => {
    test("has all payment events", () => {
      expect(Object.keys(PaymentEvents)).toContain("payment.requested");
      expect(Object.keys(PaymentEvents)).toContain("payment.processed");
      expect(Object.keys(PaymentEvents)).toContain("payment.failed");
      expect(Object.keys(PaymentEvents)).toContain("payment.refund.requested");
      expect(Object.keys(PaymentEvents)).toContain("payment.refunded");
    });
  });

  describe("ShippingEvents", () => {
    test("has all shipping events", () => {
      expect(Object.keys(ShippingEvents)).toContain("shipping.requested");
      expect(Object.keys(ShippingEvents)).toContain("shipping.prepared");
      expect(Object.keys(ShippingEvents)).toContain("shipping.cancelled");
      expect(Object.keys(ShippingEvents)).toContain("shipping.delivered");
    });
  });

  describe("InventoryEvents", () => {
    test("has all inventory events", () => {
      expect(Object.keys(InventoryEvents)).toContain("inventory.reservation.requested");
      expect(Object.keys(InventoryEvents)).toContain("inventory.reserved");
      expect(Object.keys(InventoryEvents)).toContain("inventory.reservation.failed");
      expect(Object.keys(InventoryEvents)).toContain("inventory.release.requested");
      expect(Object.keys(InventoryEvents)).toContain("inventory.released");
      expect(Object.keys(InventoryEvents)).toContain("inventory.committed");
      expect(Object.keys(InventoryEvents)).toContain("inventory.lowStock");
    });
  });

  describe("NotificationEvents", () => {
    test("has all notification events", () => {
      expect(Object.keys(NotificationEvents)).toContain("notification.email.send");
      expect(Object.keys(NotificationEvents)).toContain("notification.email.sent");
      expect(Object.keys(NotificationEvents)).toContain("notification.email.failed");
      expect(Object.keys(NotificationEvents)).toContain("notification.push.send");
      expect(Object.keys(NotificationEvents)).toContain("notification.sms.send");
    });
  });

  describe("ServiceEvents", () => {
    test("has all service discovery events", () => {
      expect(Object.keys(ServiceEvents)).toContain("service.registered");
      expect(Object.keys(ServiceEvents)).toContain("service.deregistered");
      expect(Object.keys(ServiceEvents)).toContain("service.health.check");
      expect(Object.keys(ServiceEvents)).toContain("service.health.status");
      expect(Object.keys(ServiceEvents)).toContain("service.heartbeat");
    });
  });

  describe("DLQEvents", () => {
    test("has all DLQ events", () => {
      expect(Object.keys(DLQEvents)).toContain("dlq.message.received");
      expect(Object.keys(DLQEvents)).toContain("dlq.message.retry");
      expect(Object.keys(DLQEvents)).toContain("dlq.message.failed");
    });
  });

  describe("MetricsEvents", () => {
    test("has all metrics events", () => {
      expect(Object.keys(MetricsEvents)).toContain("metrics.event.processed");
      expect(Object.keys(MetricsEvents)).toContain("metrics.circuit.breaker.state");
      expect(Object.keys(MetricsEvents)).toContain("metrics.saga.completed");
    });
  });

  describe("AllEvents", () => {
    test("combines all event registries", () => {
      expect(Object.keys(AllEvents)).toContain("user.created");
      expect(Object.keys(AllEvents)).toContain("order.placed");
      expect(Object.keys(AllEvents)).toContain("inventory.reserved");
      expect(Object.keys(AllEvents)).toContain("notification.email.send");
      expect(Object.keys(AllEvents)).toContain("payment.processed");
      expect(Object.keys(AllEvents)).toContain("shipping.prepared");
      expect(Object.keys(AllEvents)).toContain("service.registered");
      expect(Object.keys(AllEvents)).toContain("dlq.message.received");
      expect(Object.keys(AllEvents)).toContain("metrics.event.processed");
    });

    test("has correct total number of events", () => {
      const userCount = Object.keys(UserEvents).length;
      const orderCount = Object.keys(OrderEvents).length;
      const paymentCount = Object.keys(PaymentEvents).length;
      const shippingCount = Object.keys(ShippingEvents).length;
      const inventoryCount = Object.keys(InventoryEvents).length;
      const notificationCount = Object.keys(NotificationEvents).length;
      const serviceCount = Object.keys(ServiceEvents).length;
      const dlqCount = Object.keys(DLQEvents).length;
      const metricsCount = Object.keys(MetricsEvents).length;
      const allCount = Object.keys(AllEvents).length;

      expect(allCount).toBe(
        userCount + 
        orderCount + 
        paymentCount + 
        shippingCount + 
        inventoryCount + 
        notificationCount + 
        serviceCount + 
        dlqCount + 
        metricsCount
      );
    });
  });

  test("event names are literal types", () => {
    type UserEventName = keyof typeof UserEvents;
    type OrderEventName = keyof typeof OrderEvents;

    const userEvent: UserEventName = "user.created";
    const orderEvent: OrderEventName = "order.placed";

    expect(userEvent).toBe("user.created");
    expect(orderEvent).toBe("order.placed");
  });
});
