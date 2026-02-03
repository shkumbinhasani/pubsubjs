/**
 * Tests for sse-notifications example events
 */

import { test, expect, describe } from "bun:test";
import { NotificationEvents } from "./events.ts";

describe("SSE Notifications Events", () => {
  test("has all notification events", () => {
    expect(Object.keys(NotificationEvents)).toContain("notification.info");
    expect(Object.keys(NotificationEvents)).toContain("notification.success");
    expect(Object.keys(NotificationEvents)).toContain("notification.warning");
    expect(Object.keys(NotificationEvents)).toContain("notification.error");
    expect(Object.keys(NotificationEvents)).toContain("notification.progress");
    expect(Object.keys(NotificationEvents)).toContain("system.announcement");
    expect(Object.keys(NotificationEvents)).toContain("user.activity");
  });

  test("has correct number of events", () => {
    expect(Object.keys(NotificationEvents).length).toBe(7);
  });

  test("notification.progress has progress field", () => {
    const progressSchema = NotificationEvents["notification.progress"].schema;
    expect(progressSchema).toBeDefined();
  });

  test("system.announcement has priority enum", () => {
    const announcementSchema = NotificationEvents["system.announcement"].schema;
    expect(announcementSchema).toBeDefined();
  });

  test("event names are literal types", () => {
    type NotificationEventName = keyof typeof NotificationEvents;

    const infoEvent: NotificationEventName = "notification.info";
    const successEvent: NotificationEventName = "notification.success";

    expect(infoEvent).toBe("notification.info");
    expect(successEvent).toBe("notification.success");
  });
});
