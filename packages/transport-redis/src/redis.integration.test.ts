import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { RedisTransport } from "./redis";
import type { TransportMessage } from "@pubsubjs/core";

const isCI = process.env.CI === "true";

describe.skipIf(!isCI)("RedisTransport Integration (CI only)", () => {
  let transport: RedisTransport;
  const testPrefix = `test-${Date.now()}`;

  beforeAll(async () => {
    transport = new RedisTransport({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      channelPrefix: testPrefix,
    });
    await transport.connect();
  });

  afterAll(async () => {
    await transport.disconnect();
  });

  describe("basic pub/sub", () => {
    test("publishes and receives messages", async () => {
      const channel = "basic-test";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(channel, (msg) => {
        received.push(msg);
      });

      // Small delay for subscription to be ready
      await Bun.sleep(50);

      await transport.publish(channel, { text: "hello" });

      // Wait for message
      await Bun.sleep(100);

      expect(received.length).toBe(1);
      expect(received[0].payload).toEqual({ text: "hello" });

      await unsubscribe();
    });
  });

  describe("attribute-based filtering", () => {
    test("receives message when filter matches exact value", async () => {
      const channel = "filter-exact";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { userId: "user-123" } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { data: "matched" }, {
        attributes: { userId: "user-123" },
      });

      // Should not match
      await transport.publish(channel, { data: "not-matched" }, {
        attributes: { userId: "user-456" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(1);
      expect(received[0].payload).toEqual({ data: "matched" });

      await unsubscribe();
    });

    test("receives message when filter matches with $in operator", async () => {
      const channel = "filter-in";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { status: { $in: ["active", "pending"] } } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { status: "active" },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { status: "pending" },
      });

      // Should not match
      await transport.publish(channel, { id: 3 }, {
        attributes: { status: "cancelled" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $gte operator", async () => {
      const channel = "filter-gte";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { amount: { $gte: 100 } } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { amount: 100 },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { amount: 200 },
      });

      // Should not match
      await transport.publish(channel, { id: 3 }, {
        attributes: { amount: 50 },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $between operator", async () => {
      const channel = "filter-between";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { price: { $between: [10, 50] } } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, { attributes: { price: 10 } });
      await transport.publish(channel, { id: 2 }, { attributes: { price: 30 } });
      await transport.publish(channel, { id: 3 }, { attributes: { price: 50 } });

      // Should not match
      await transport.publish(channel, { id: 4 }, { attributes: { price: 5 } });
      await transport.publish(channel, { id: 5 }, { attributes: { price: 100 } });

      await Bun.sleep(100);

      expect(received.length).toBe(3);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2, 3]);

      await unsubscribe();
    });

    test("receives message when filter matches with $prefix operator", async () => {
      const channel = "filter-prefix";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { eventType: { $prefix: "order." } } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { eventType: "order.created" },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { eventType: "order.updated" },
      });

      // Should not match
      await transport.publish(channel, { id: 3 }, {
        attributes: { eventType: "user.created" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $exists operator", async () => {
      const channel = "filter-exists";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { priority: { $exists: true } } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { priority: 1 },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { priority: 0 },
      });

      // Should not match (no priority attribute)
      await transport.publish(channel, { id: 3 }, {
        attributes: { other: "value" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $ne operator", async () => {
      const channel = "filter-ne";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { status: { $ne: "deleted" } } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { status: "active" },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { status: "pending" },
      });

      // Should not match
      await transport.publish(channel, { id: 3 }, {
        attributes: { status: "deleted" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $gt operator", async () => {
      const channel = "filter-gt";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { score: { $gt: 50 } } }
      );

      await Bun.sleep(50);

      // Should match (strictly greater than)
      await transport.publish(channel, { id: 1 }, { attributes: { score: 51 } });
      await transport.publish(channel, { id: 2 }, { attributes: { score: 100 } });

      // Should not match (equal or less)
      await transport.publish(channel, { id: 3 }, { attributes: { score: 50 } });
      await transport.publish(channel, { id: 4 }, { attributes: { score: 25 } });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $lt operator", async () => {
      const channel = "filter-lt";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { score: { $lt: 50 } } }
      );

      await Bun.sleep(50);

      // Should match (strictly less than)
      await transport.publish(channel, { id: 1 }, { attributes: { score: 49 } });
      await transport.publish(channel, { id: 2 }, { attributes: { score: 10 } });

      // Should not match (equal or greater)
      await transport.publish(channel, { id: 3 }, { attributes: { score: 50 } });
      await transport.publish(channel, { id: 4 }, { attributes: { score: 100 } });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $lte operator", async () => {
      const channel = "filter-lte";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { score: { $lte: 50 } } }
      );

      await Bun.sleep(50);

      // Should match (less than or equal)
      await transport.publish(channel, { id: 1 }, { attributes: { score: 50 } });
      await transport.publish(channel, { id: 2 }, { attributes: { score: 25 } });

      // Should not match (greater than)
      await transport.publish(channel, { id: 3 }, { attributes: { score: 51 } });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches with $exists: false", async () => {
      const channel = "filter-not-exists";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { deletedAt: { $exists: false } } }
      );

      await Bun.sleep(50);

      // Should match (no deletedAt attribute)
      await transport.publish(channel, { id: 1 }, {
        attributes: { status: "active" },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { name: "test" },
      });

      // Should not match (has deletedAt)
      await transport.publish(channel, { id: 3 }, {
        attributes: { deletedAt: "2024-01-01" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when OR logic matches (array of conditions)", async () => {
      const channel = "filter-or";
      const received: TransportMessage[] = [];

      // OR: status is "active" OR status is "pending"
      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { status: ["active", "pending"] } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { status: "active" },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { status: "pending" },
      });

      // Should not match
      await transport.publish(channel, { id: 3 }, {
        attributes: { status: "cancelled" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when OR logic with operators matches", async () => {
      const channel = "filter-or-operators";
      const received: TransportMessage[] = [];

      // OR: amount < 10 OR amount > 100
      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { amount: [{ $lt: 10 }, { $gt: 100 }] } }
      );

      await Bun.sleep(50);

      // Should match (< 10)
      await transport.publish(channel, { id: 1 }, { attributes: { amount: 5 } });
      // Should match (> 100)
      await transport.publish(channel, { id: 2 }, { attributes: { amount: 150 } });

      // Should not match (in between)
      await transport.publish(channel, { id: 3 }, { attributes: { amount: 50 } });

      await Bun.sleep(100);

      expect(received.length).toBe(2);
      expect(received.map((r) => (r.payload as { id: number }).id)).toEqual([1, 2]);

      await unsubscribe();
    });

    test("receives message when filter matches nested attributes", async () => {
      const channel = "filter-nested";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { "user.role": "admin" } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { user: { role: "admin" } },
      });

      // Should not match
      await transport.publish(channel, { id: 2 }, {
        attributes: { user: { role: "user" } },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(1);
      expect(received[0].payload).toEqual({ id: 1 });

      await unsubscribe();
    });

    test("receives message when complex filter with AND logic matches", async () => {
      const channel = "filter-complex";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        {
          filter: {
            amount: { $gte: 100 },
            status: { $in: ["confirmed", "shipped"] },
            "customer.tier": "premium",
          },
        }
      );

      await Bun.sleep(50);

      // Should match - all conditions met
      await transport.publish(channel, { id: 1 }, {
        attributes: {
          amount: 150,
          status: "confirmed",
          customer: { tier: "premium" },
        },
      });

      // Should not match - amount too low
      await transport.publish(channel, { id: 2 }, {
        attributes: {
          amount: 50,
          status: "confirmed",
          customer: { tier: "premium" },
        },
      });

      // Should not match - wrong status
      await transport.publish(channel, { id: 3 }, {
        attributes: {
          amount: 150,
          status: "pending",
          customer: { tier: "premium" },
        },
      });

      // Should not match - wrong tier
      await transport.publish(channel, { id: 4 }, {
        attributes: {
          amount: 150,
          status: "confirmed",
          customer: { tier: "basic" },
        },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(1);
      expect(received[0].payload).toEqual({ id: 1 });

      await unsubscribe();
    });

    test("multiple subscribers with different filters on same channel", async () => {
      const channel = "filter-multi-sub";
      const receivedHigh: TransportMessage[] = [];
      const receivedLow: TransportMessage[] = [];

      const unsubHigh = await transport.subscribe(
        channel,
        (msg) => receivedHigh.push(msg),
        { filter: { priority: { $gte: 5 } } }
      );

      const unsubLow = await transport.subscribe(
        channel,
        (msg) => receivedLow.push(msg),
        { filter: { priority: { $lt: 5 } } }
      );

      await Bun.sleep(50);

      await transport.publish(channel, { id: 1 }, { attributes: { priority: 1 } });
      await transport.publish(channel, { id: 2 }, { attributes: { priority: 5 } });
      await transport.publish(channel, { id: 3 }, { attributes: { priority: 10 } });

      await Bun.sleep(100);

      expect(receivedHigh.length).toBe(2);
      expect(receivedHigh.map((r) => (r.payload as { id: number }).id)).toEqual([2, 3]);

      expect(receivedLow.length).toBe(1);
      expect(receivedLow.map((r) => (r.payload as { id: number }).id)).toEqual([1]);

      await unsubHigh();
      await unsubLow();
    });

    test("subscriber without filter receives all messages", async () => {
      const channel = "filter-no-filter";
      const receivedAll: TransportMessage[] = [];
      const receivedFiltered: TransportMessage[] = [];

      const unsubAll = await transport.subscribe(channel, (msg) =>
        receivedAll.push(msg)
      );

      const unsubFiltered = await transport.subscribe(
        channel,
        (msg) => receivedFiltered.push(msg),
        { filter: { type: "important" } }
      );

      await Bun.sleep(50);

      await transport.publish(channel, { id: 1 }, {
        attributes: { type: "important" },
      });
      await transport.publish(channel, { id: 2 }, {
        attributes: { type: "normal" },
      });
      await transport.publish(channel, { id: 3 }, {});

      await Bun.sleep(100);

      // Subscriber without filter receives all
      expect(receivedAll.length).toBe(3);

      // Subscriber with filter only receives matching
      expect(receivedFiltered.length).toBe(1);
      expect(receivedFiltered[0].payload).toEqual({ id: 1 });

      await unsubAll();
      await unsubFiltered();
    });
  });

  describe("edge cases", () => {
    test("filter does not match message with no attributes", async () => {
      const channel = "edge-no-attrs";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { userId: "123" } }
      );

      await Bun.sleep(50);

      // Message with no attributes should not match filter
      await transport.publish(channel, { id: 1 }, {});
      await transport.publish(channel, { id: 2 }); // No options at all

      await Bun.sleep(100);

      expect(received.length).toBe(0);

      await unsubscribe();
    });

    test("filter on non-existent attribute does not match", async () => {
      const channel = "edge-missing-attr";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { category: "electronics" } }
      );

      await Bun.sleep(50);

      // Has attributes but not the one being filtered
      await transport.publish(channel, { id: 1 }, {
        attributes: { name: "test", price: 100 },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(0);

      await unsubscribe();
    });

    test("numeric filter does not match string value", async () => {
      const channel = "edge-type-mismatch-num";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { amount: { $gte: 100 } } }
      );

      await Bun.sleep(50);

      // String "150" should not match numeric filter
      await transport.publish(channel, { id: 1 }, {
        attributes: { amount: "150" },
      });

      // Number 150 should match
      await transport.publish(channel, { id: 2 }, {
        attributes: { amount: 150 },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(1);
      expect(received[0].payload).toEqual({ id: 2 });

      await unsubscribe();
    });

    test("prefix filter does not match number value", async () => {
      const channel = "edge-type-mismatch-prefix";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { code: { $prefix: "ABC" } } }
      );

      await Bun.sleep(50);

      // Number should not match prefix filter
      await transport.publish(channel, { id: 1 }, {
        attributes: { code: 12345 },
      });

      // String starting with ABC should match
      await transport.publish(channel, { id: 2 }, {
        attributes: { code: "ABC123" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(1);
      expect(received[0].payload).toEqual({ id: 2 });

      await unsubscribe();
    });

    test("boolean attribute matches exactly", async () => {
      const channel = "edge-boolean";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { active: true } }
      );

      await Bun.sleep(50);

      // Should match
      await transport.publish(channel, { id: 1 }, {
        attributes: { active: true },
      });

      // Should not match (false)
      await transport.publish(channel, { id: 2 }, {
        attributes: { active: false },
      });

      // Should not match (truthy string, but not boolean true)
      await transport.publish(channel, { id: 3 }, {
        attributes: { active: "true" },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(1);
      expect(received[0].payload).toEqual({ id: 1 });

      await unsubscribe();
    });

    test("deeply nested attribute beyond supported depth returns no match", async () => {
      const channel = "edge-deep-nested";
      const received: TransportMessage[] = [];

      // Trying to filter on a path that goes deeper than EventAttributes supports
      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: { "a.b.c": "value" } }
      );

      await Bun.sleep(50);

      // This structure can't be represented in EventAttributes type properly
      // The filter should not match since we can't traverse that deep
      await transport.publish(channel, { id: 1 }, {
        attributes: { a: { b: "nested" } },
      });

      await Bun.sleep(100);

      expect(received.length).toBe(0);

      await unsubscribe();
    });

    test("empty filter object matches all messages", async () => {
      const channel = "edge-empty-filter";
      const received: TransportMessage[] = [];

      const unsubscribe = await transport.subscribe(
        channel,
        (msg) => received.push(msg),
        { filter: {} }
      );

      await Bun.sleep(50);

      await transport.publish(channel, { id: 1 }, {
        attributes: { any: "value" },
      });
      await transport.publish(channel, { id: 2 }, {});

      await Bun.sleep(100);

      expect(received.length).toBe(2);

      await unsubscribe();
    });
  });
});
