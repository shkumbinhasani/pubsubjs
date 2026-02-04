import { test, expect, describe } from "bun:test";
import { matchesFilter, toSNSFilterPolicy } from "./matcher";
import type { FilterPolicy, EventAttributes } from "../types/filter";

describe("matchesFilter", () => {
  describe("basic matching", () => {
    test("returns true when filter is undefined", () => {
      const attributes: EventAttributes = { userId: "123" };
      expect(matchesFilter(attributes, undefined)).toBe(true);
    });

    test("returns true when filter is empty", () => {
      const attributes: EventAttributes = { userId: "123" };
      expect(matchesFilter(attributes, {})).toBe(true);
    });

    test("returns false when attributes is undefined but filter exists", () => {
      const filter: FilterPolicy = { userId: "123" };
      expect(matchesFilter(undefined, filter)).toBe(false);
    });
  });

  describe("exact match", () => {
    test("matches string value", () => {
      const attributes: EventAttributes = { userId: "123" };
      const filter: FilterPolicy = { userId: "123" };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("matches number value", () => {
      const attributes: EventAttributes = { count: 42 };
      const filter: FilterPolicy = { count: 42 };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("matches boolean value", () => {
      const attributes: EventAttributes = { active: true };
      const filter: FilterPolicy = { active: true };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match different string value", () => {
      const attributes: EventAttributes = { userId: "123" };
      const filter: FilterPolicy = { userId: "456" };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match missing attribute", () => {
      const attributes: EventAttributes = { userId: "123" };
      const filter: FilterPolicy = { roomId: "abc" };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$in operator", () => {
    test("matches when value is in array", () => {
      const attributes: EventAttributes = { userId: "123" };
      const filter: FilterPolicy = { userId: { $in: ["123", "456"] } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when value is not in array", () => {
      const attributes: EventAttributes = { userId: "789" };
      const filter: FilterPolicy = { userId: { $in: ["123", "456"] } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match when attribute is undefined", () => {
      const attributes: EventAttributes = { other: "value" };
      const filter: FilterPolicy = { userId: { $in: ["123", "456"] } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$exists operator", () => {
    test("matches when attribute exists and $exists is true", () => {
      const attributes: EventAttributes = { userId: "123" };
      const filter: FilterPolicy = { userId: { $exists: true } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when attribute is missing and $exists is true", () => {
      const attributes: EventAttributes = { other: "value" };
      const filter: FilterPolicy = { userId: { $exists: true } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("matches when attribute is missing and $exists is false", () => {
      const attributes: EventAttributes = { other: "value" };
      const filter: FilterPolicy = { userId: { $exists: false } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when attribute exists and $exists is false", () => {
      const attributes: EventAttributes = { userId: "123" };
      const filter: FilterPolicy = { userId: { $exists: false } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$prefix operator", () => {
    test("matches when string starts with prefix", () => {
      const attributes: EventAttributes = { name: "John Doe" };
      const filter: FilterPolicy = { name: { $prefix: "John" } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when string does not start with prefix", () => {
      const attributes: EventAttributes = { name: "Jane Doe" };
      const filter: FilterPolicy = { name: { $prefix: "John" } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match non-string values", () => {
      const attributes: EventAttributes = { count: 123 };
      const filter: FilterPolicy = { count: { $prefix: "12" } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$ne operator", () => {
    test("matches when value is not equal", () => {
      const attributes: EventAttributes = { status: "active" };
      const filter: FilterPolicy = { status: { $ne: "cancelled" } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when value is equal", () => {
      const attributes: EventAttributes = { status: "cancelled" };
      const filter: FilterPolicy = { status: { $ne: "cancelled" } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("matches when attribute is undefined", () => {
      const attributes: EventAttributes = { other: "value" };
      const filter: FilterPolicy = { status: { $ne: "cancelled" } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });
  });

  describe("$gt operator", () => {
    test("matches when value is greater than", () => {
      const attributes: EventAttributes = { amount: 150 };
      const filter: FilterPolicy = { amount: { $gt: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when value is equal", () => {
      const attributes: EventAttributes = { amount: 100 };
      const filter: FilterPolicy = { amount: { $gt: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match when value is less than", () => {
      const attributes: EventAttributes = { amount: 50 };
      const filter: FilterPolicy = { amount: { $gt: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match non-number values", () => {
      const attributes: EventAttributes = { amount: "150" };
      const filter: FilterPolicy = { amount: { $gt: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$gte operator", () => {
    test("matches when value is greater than", () => {
      const attributes: EventAttributes = { amount: 150 };
      const filter: FilterPolicy = { amount: { $gte: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("matches when value is equal", () => {
      const attributes: EventAttributes = { amount: 100 };
      const filter: FilterPolicy = { amount: { $gte: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when value is less than", () => {
      const attributes: EventAttributes = { amount: 50 };
      const filter: FilterPolicy = { amount: { $gte: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$lt operator", () => {
    test("matches when value is less than", () => {
      const attributes: EventAttributes = { amount: 50 };
      const filter: FilterPolicy = { amount: { $lt: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when value is equal", () => {
      const attributes: EventAttributes = { amount: 100 };
      const filter: FilterPolicy = { amount: { $lt: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match when value is greater than", () => {
      const attributes: EventAttributes = { amount: 150 };
      const filter: FilterPolicy = { amount: { $lt: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$lte operator", () => {
    test("matches when value is less than", () => {
      const attributes: EventAttributes = { amount: 50 };
      const filter: FilterPolicy = { amount: { $lte: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("matches when value is equal", () => {
      const attributes: EventAttributes = { amount: 100 };
      const filter: FilterPolicy = { amount: { $lte: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when value is greater than", () => {
      const attributes: EventAttributes = { amount: 150 };
      const filter: FilterPolicy = { amount: { $lte: 100 } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("$between operator", () => {
    test("matches when value is within range", () => {
      const attributes: EventAttributes = { amount: 150 };
      const filter: FilterPolicy = { amount: { $between: [100, 200] } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("matches when value equals min", () => {
      const attributes: EventAttributes = { amount: 100 };
      const filter: FilterPolicy = { amount: { $between: [100, 200] } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("matches when value equals max", () => {
      const attributes: EventAttributes = { amount: 200 };
      const filter: FilterPolicy = { amount: { $between: [100, 200] } };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when value is below range", () => {
      const attributes: EventAttributes = { amount: 50 };
      const filter: FilterPolicy = { amount: { $between: [100, 200] } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match when value is above range", () => {
      const attributes: EventAttributes = { amount: 250 };
      const filter: FilterPolicy = { amount: { $between: [100, 200] } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match non-number values", () => {
      const attributes: EventAttributes = { amount: "150" };
      const filter: FilterPolicy = { amount: { $between: [100, 200] } };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("nested attributes (dot notation)", () => {
    test("matches nested value with dot notation", () => {
      const attributes: EventAttributes = { user: { role: "admin" } };
      const filter: FilterPolicy = { "user.role": "admin" };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when nested path is wrong", () => {
      const attributes: EventAttributes = { user: { role: "user" } };
      const filter: FilterPolicy = { "user.role": "admin" };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match when nested path does not exist", () => {
      const attributes: EventAttributes = { user: { name: "John" } };
      const filter: FilterPolicy = { "user.role": "admin" };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("returns undefined for non-primitive nested values", () => {
      const attributes: EventAttributes = { user: { settings: { theme: "dark" } } };
      // Deep nesting beyond what EventAttributes supports returns undefined
      const filter: FilterPolicy = { "user.settings": "something" };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("OR logic (multiple conditions on same key)", () => {
    test("matches when any condition matches", () => {
      const attributes: EventAttributes = { userId: "456" };
      const filter: FilterPolicy = { userId: ["123", "456", "789"] };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when no condition matches", () => {
      const attributes: EventAttributes = { userId: "000" };
      const filter: FilterPolicy = { userId: ["123", "456", "789"] };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("works with operator conditions", () => {
      const attributes: EventAttributes = { amount: 50 };
      const filter: FilterPolicy = {
        amount: [{ $lt: 100 }, { $gt: 200 }],
      };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });
  });

  describe("AND logic (multiple keys)", () => {
    test("matches when all keys match", () => {
      const attributes: EventAttributes = { userId: "123", roomId: "abc" };
      const filter: FilterPolicy = { userId: "123", roomId: "abc" };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("does not match when any key fails", () => {
      const attributes: EventAttributes = { userId: "123", roomId: "xyz" };
      const filter: FilterPolicy = { userId: "123", roomId: "abc" };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });

    test("does not match when key is missing", () => {
      const attributes: EventAttributes = { userId: "123" };
      const filter: FilterPolicy = { userId: "123", roomId: "abc" };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });

  describe("complex filters", () => {
    test("combines multiple operators and keys", () => {
      const attributes: EventAttributes = {
        userId: "user-123",
        amount: 150,
        status: "active",
        user: { tier: "gold" },
      };
      const filter: FilterPolicy = {
        amount: { $gte: 100 },
        status: { $ne: "cancelled" },
        "user.tier": { $in: ["gold", "platinum"] },
      };
      expect(matchesFilter(attributes, filter)).toBe(true);
    });

    test("fails when any condition in complex filter fails", () => {
      const attributes: EventAttributes = {
        userId: "user-123",
        amount: 50, // Below threshold
        status: "active",
        user: { tier: "gold" },
      };
      const filter: FilterPolicy = {
        amount: { $gte: 100 },
        status: { $ne: "cancelled" },
        "user.tier": { $in: ["gold", "platinum"] },
      };
      expect(matchesFilter(attributes, filter)).toBe(false);
    });
  });
});

describe("toSNSFilterPolicy", () => {
  test("converts exact match to SNS format", () => {
    const filter: FilterPolicy = { userId: "123" };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ userId: ["123"] });
  });

  test("converts $in to SNS format", () => {
    const filter: FilterPolicy = { userId: { $in: ["123", "456"] } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ userId: ["123", "456"] });
  });

  test("converts $exists to SNS format", () => {
    const filter: FilterPolicy = { userId: { $exists: true } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ userId: [{ exists: true }] });
  });

  test("converts $prefix to SNS format", () => {
    const filter: FilterPolicy = { name: { $prefix: "John" } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ name: [{ prefix: "John" }] });
  });

  test("converts $ne to SNS format", () => {
    const filter: FilterPolicy = { status: { $ne: "cancelled" } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ status: [{ "anything-but": "cancelled" }] });
  });

  test("converts $gt to SNS format", () => {
    const filter: FilterPolicy = { amount: { $gt: 100 } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ amount: [{ numeric: [">", 100] }] });
  });

  test("converts $gte to SNS format", () => {
    const filter: FilterPolicy = { amount: { $gte: 100 } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ amount: [{ numeric: [">=", 100] }] });
  });

  test("converts $lt to SNS format", () => {
    const filter: FilterPolicy = { amount: { $lt: 100 } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ amount: [{ numeric: ["<", 100] }] });
  });

  test("converts $lte to SNS format", () => {
    const filter: FilterPolicy = { amount: { $lte: 100 } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ amount: [{ numeric: ["<=", 100] }] });
  });

  test("converts $between to SNS format", () => {
    const filter: FilterPolicy = { amount: { $between: [100, 200] } };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({ amount: [{ numeric: [">=", 100, "<=", 200] }] });
  });

  test("converts multiple keys", () => {
    const filter: FilterPolicy = {
      userId: "123",
      amount: { $gte: 100 },
    };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({
      userId: ["123"],
      amount: [{ numeric: [">=", 100] }],
    });
  });

  test("converts array of conditions (OR)", () => {
    const filter: FilterPolicy = {
      status: ["active", "pending"],
    };
    const sns = toSNSFilterPolicy(filter);
    expect(sns).toEqual({
      status: ["active", "pending"],
    });
  });
});
