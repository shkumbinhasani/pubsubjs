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
 * Filter condition for string attributes
 */
export type StringFilterCondition =
  | string // exact match
  | { readonly $in: readonly string[] } // any of values
  | { readonly $exists: boolean } // attribute presence
  | { readonly $prefix: string } // string prefix
  | { readonly $ne: string }; // not equal

/**
 * Filter condition for number attributes
 */
export type NumberFilterCondition =
  | number // exact match
  | { readonly $in: readonly number[] } // any of values
  | { readonly $exists: boolean } // attribute presence
  | { readonly $ne: number } // not equal
  | { readonly $gt: number } // greater than
  | { readonly $gte: number } // greater than or equal
  | { readonly $lt: number } // less than
  | { readonly $lte: number } // less than or equal
  | { readonly $between: readonly [number, number] }; // range [min, max]

/**
 * Filter condition for boolean attributes
 */
export type BooleanFilterCondition =
  | boolean // exact match
  | { readonly $in: readonly boolean[] } // any of values
  | { readonly $exists: boolean } // attribute presence
  | { readonly $ne: boolean }; // not equal

/**
 * Single filter condition (untyped)
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
 * Get the appropriate filter condition type for a value type
 */
export type FilterConditionFor<T> = T extends string
  ? StringFilterCondition
  : T extends number
    ? NumberFilterCondition
    : T extends boolean
      ? BooleanFilterCondition
      : FilterCondition;

/**
 * Flatten nested object keys with dot notation
 * { user: { id: string } } => "user.id"
 */
export type FlattenKeys<T, Prefix extends string = ""> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, AttributeValue>
        ? FlattenKeys<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
  : never;

/**
 * Get the value type at a dot-notation path
 */
export type GetValueAtPath<T, Path extends string> = Path extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? T[Key] extends Record<string, unknown>
      ? GetValueAtPath<T[Key], Rest>
      : never
    : never
  : Path extends keyof T
    ? T[Path]
    : never;

/**
 * Typed filter policy based on attributes schema output type
 * Keys can use dot notation for nested attributes: "user.id"
 *
 * Semantics:
 * - Multiple conditions on same key = OR
 * - Multiple keys = AND
 */
export type TypedFilterPolicy<TAttributes> = TAttributes extends Record<string, unknown>
  ? {
      readonly [K in FlattenKeys<TAttributes>]?:
        | FilterConditionFor<GetValueAtPath<TAttributes, K>>
        | readonly FilterConditionFor<GetValueAtPath<TAttributes, K>>[];
    }
  : FilterPolicy;

/**
 * Filter policy for subscribing to events (untyped fallback)
 * Keys can use dot notation for nested attributes: "user.id"
 *
 * Semantics:
 * - Multiple conditions on same key = OR
 * - Multiple keys = AND
 */
export type FilterPolicy = {
  readonly [key: string]: FilterCondition | readonly FilterCondition[];
};
