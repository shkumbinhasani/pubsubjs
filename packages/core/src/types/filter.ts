/**
 * Attribute values that can be filtered on
 */
export type AttributeValue = string | number | boolean;

/**
 * Attributes attached to events
 * Supports nested objects via dot notation in keys
 */
export type EventAttributes = Record<
  string,
  AttributeValue | Record<string, AttributeValue>
>;

/**
 * Single filter condition
 */
export type FilterCondition =
  | AttributeValue // exact match
  | { readonly $in: readonly AttributeValue[] } // any of values
  | { readonly $exists: boolean } // attribute presence
  | { readonly $prefix: string } // string prefix
  | { readonly $ne: AttributeValue } // not equal
  | { readonly $gt: number } // greater than
  | { readonly $gte: number } // greater than or equal
  | { readonly $lt: number } // less than
  | { readonly $lte: number } // less than or equal
  | { readonly $between: readonly [number, number] }; // range [min, max]

/**
 * Filter policy for subscribing to events
 * Keys can use dot notation for nested attributes: "user.id"
 *
 * Semantics:
 * - Multiple conditions on same key = OR
 * - Multiple keys = AND
 */
export type FilterPolicy = {
  readonly [key: string]: FilterCondition | readonly FilterCondition[];
};
