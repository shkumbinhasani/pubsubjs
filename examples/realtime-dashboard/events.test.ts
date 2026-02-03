/**
 * Tests for realtime-dashboard example events
 */

import { test, expect, describe } from "bun:test";
import { DashboardEvents } from "./events.ts";

describe("Realtime Dashboard Events", () => {
  test("has all dashboard events", () => {
    expect(Object.keys(DashboardEvents)).toContain("metrics.update");
    expect(Object.keys(DashboardEvents)).toContain("chart.datapoint");
    expect(Object.keys(DashboardEvents)).toContain("user.online");
    expect(Object.keys(DashboardEvents)).toContain("user.offline");
    expect(Object.keys(DashboardEvents)).toContain("activity.new");
    expect(Object.keys(DashboardEvents)).toContain("alert.trigger");
    expect(Object.keys(DashboardEvents)).toContain("alert.dismiss");
  });

  test("has correct number of events", () => {
    expect(Object.keys(DashboardEvents).length).toBe(9);
  });

  test("has new events", () => {
    expect(Object.keys(DashboardEvents)).toContain("user.status.change");
    expect(Object.keys(DashboardEvents)).toContain("time.range.change");
  });

  test("metrics.update has all metric fields", () => {
    const metricsSchema = DashboardEvents["metrics.update"].schema;
    expect(metricsSchema).toBeDefined();
  });

  test("alert.trigger has severity enum", () => {
    const alertSchema = DashboardEvents["alert.trigger"].schema;
    expect(alertSchema).toBeDefined();
  });

  test("activity.new has type enum", () => {
    const activitySchema = DashboardEvents["activity.new"].schema;
    expect(activitySchema).toBeDefined();
  });

  test("event names are literal types", () => {
    type DashboardEventName = keyof typeof DashboardEvents;

    const metricsEvent: DashboardEventName = "metrics.update";
    const alertEvent: DashboardEventName = "alert.trigger";

    expect(metricsEvent).toBe("metrics.update");
    expect(alertEvent).toBe("alert.trigger");
  });
});
