/**
 * Type-level tests for filter type safety
 * This file should compile without errors - the tests are compile-time checks
 */
import { z } from "zod";
import { defineEvent } from "./schema";
import type { TypedFilterPolicy, FilterConditionFor } from "./filter";
import type { EventAttributesType } from "./schema";

// Define events with attributesSchema
const events = defineEvent([
  {
    name: "order.created",
    schema: z.object({ orderId: z.string() }),
    attributesSchema: z.object({
      userId: z.string(),
      amount: z.number(),
      isPriority: z.boolean(),
      customer: z.object({
        tier: z.string(),
      }),
    }),
  },
  {
    name: "user.updated",
    schema: z.object({ userId: z.string() }),
    // No attributesSchema - should fall back to untyped
  },
]);

// Test: EventAttributesType extracts correct type
type OrderAttributes = EventAttributesType<typeof events, "order.created">;
// Should be: { userId: string; amount: number; isPriority: boolean; customer: { tier: string } }

// Test: TypedFilterPolicy creates correct filter type
type OrderFilter = TypedFilterPolicy<OrderAttributes>;

// These should compile (valid filters):
const validFilters: OrderFilter[] = [
  // Exact match
  { userId: "user-123" },
  { amount: 100 },
  { isPriority: true },

  // String operators
  { userId: { $in: ["user-1", "user-2"] } },
  { userId: { $prefix: "user-" } },
  { userId: { $ne: "blocked" } },
  { userId: { $exists: true } },

  // Number operators
  { amount: { $gt: 100 } },
  { amount: { $gte: 100 } },
  { amount: { $lt: 50 } },
  { amount: { $lte: 50 } },
  { amount: { $between: [10, 100] } },
  { amount: { $in: [10, 20, 30] } },
  { amount: { $ne: 0 } },

  // Boolean operators
  { isPriority: { $ne: false } },
  { isPriority: { $exists: true } },

  // Nested attributes with dot notation
  { "customer.tier": "gold" },
  { "customer.tier": { $in: ["gold", "platinum"] } },
  { "customer.tier": { $prefix: "pre" } },

  // Multiple conditions (AND)
  { userId: "user-123", amount: { $gte: 100 } },

  // OR conditions (array)
  { amount: [{ $lt: 10 }, { $gt: 100 }] },
];

// Test: FilterConditionFor maps types correctly
type StringCond = FilterConditionFor<string>;
type NumberCond = FilterConditionFor<number>;
type BooleanCond = FilterConditionFor<boolean>;

const strCond: StringCond = { $prefix: "test" }; // Valid
const numCond: NumberCond = { $between: [1, 10] }; // Valid
const boolCond: BooleanCond = true; // Valid

// Uncommenting these should cause type errors:
// const invalidStrCond: StringCond = { $gt: 100 }; // Error: $gt not valid for string
// const invalidNumCond: NumberCond = { $prefix: "test" }; // Error: $prefix not valid for number
// const invalidFilter: OrderFilter = { invalidKey: "value" }; // Error: invalidKey not in schema
// const wrongType: OrderFilter = { amount: "not a number" }; // Error: string not assignable to number filter

export { validFilters, strCond, numCond, boolCond };
