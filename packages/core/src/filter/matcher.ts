import type {
  FilterPolicy,
  FilterCondition,
  EventAttributes,
  AttributeValue,
} from "../types/filter";

/**
 * Evaluate a filter policy against event attributes
 * Returns true if the event matches the filter
 *
 * Semantics:
 * - Multiple conditions on same key = OR (at least one must match)
 * - Multiple keys = AND (all keys must match)
 * - Hierarchical keys use dot notation: "user.id" matches { user: { id: "123" } }
 */
export function matchesFilter(
  attributes: EventAttributes | undefined,
  filter: FilterPolicy | undefined
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;
  if (!attributes) return false;

  // AND logic: all keys must match
  for (const [key, conditions] of Object.entries(filter)) {
    const value = getNestedValue(attributes, key);
    const conditionArray = Array.isArray(conditions) ? conditions : [conditions];

    // OR logic: at least one condition must match
    const anyMatch = conditionArray.some((cond) => matchCondition(value, cond));
    if (!anyMatch) return false;
  }

  return true;
}

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue({ user: { id: "123" } }, "user.id") => "123"
 */
function getNestedValue(
  obj: EventAttributes,
  path: string
): AttributeValue | undefined {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  if (
    typeof current === "string" ||
    typeof current === "number" ||
    typeof current === "boolean"
  ) {
    return current;
  }
  return undefined;
}

/**
 * Match a single condition against a value
 */
function matchCondition(
  value: AttributeValue | undefined,
  condition: FilterCondition
): boolean {
  // Handle operators
  if (typeof condition === "object" && condition !== null) {
    if ("$in" in condition) {
      return value !== undefined && condition.$in.includes(value);
    }
    if ("$exists" in condition) {
      return condition.$exists ? value !== undefined : value === undefined;
    }
    if ("$prefix" in condition) {
      return typeof value === "string" && value.startsWith(condition.$prefix);
    }
    if ("$ne" in condition) {
      return value !== condition.$ne;
    }
    if ("$gt" in condition) {
      return typeof value === "number" && value > condition.$gt;
    }
    if ("$gte" in condition) {
      return typeof value === "number" && value >= condition.$gte;
    }
    if ("$lt" in condition) {
      return typeof value === "number" && value < condition.$lt;
    }
    if ("$lte" in condition) {
      return typeof value === "number" && value <= condition.$lte;
    }
    if ("$between" in condition) {
      const [min, max] = condition.$between;
      return typeof value === "number" && value >= min && value <= max;
    }
    return false;
  }

  // Exact match
  return value === condition;
}

/**
 * Convert filter policy to AWS SNS format
 * Useful for transports that support SNS-style filtering natively
 */
export function toSNSFilterPolicy(
  filter: FilterPolicy
): Record<string, unknown[]> {
  const sns: Record<string, unknown[]> = {};

  for (const [key, conditions] of Object.entries(filter)) {
    const conditionArray = Array.isArray(conditions) ? conditions : [conditions];
    sns[key] = conditionArray
      .map((cond) => {
        if (typeof cond !== "object" || cond === null) return cond;
        if ("$in" in cond) return cond.$in;
        if ("$exists" in cond) return { exists: cond.$exists };
        if ("$prefix" in cond) return { prefix: cond.$prefix };
        if ("$ne" in cond) return { "anything-but": cond.$ne };
        if ("$gt" in cond) return { numeric: [">", cond.$gt] };
        if ("$gte" in cond) return { numeric: [">=", cond.$gte] };
        if ("$lt" in cond) return { numeric: ["<", cond.$lt] };
        if ("$lte" in cond) return { numeric: ["<=", cond.$lte] };
        if ("$between" in cond)
          return { numeric: [">=", cond.$between[0], "<=", cond.$between[1]] };
        return cond;
      })
      .flat();
  }

  return sns;
}
