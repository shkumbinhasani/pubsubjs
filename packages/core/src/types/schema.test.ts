import { test, expect, describe } from "bun:test";
import {
  defineEvent,
  validatePayload,
  ValidationError,
  type StandardSchema,
  type InferOutput,
  type EventNames,
  type EventPayload,
} from "./schema";

// Create a simple mock schema that follows Standard Schema spec
function createMockSchema<T>(validator: (value: unknown) => T): StandardSchema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        try {
          const result = validator(value);
          return { value: result };
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      },
    },
  };
}

// Mock schemas
const stringSchema = createMockSchema<string>((value) => {
  if (typeof value !== "string") {
    throw new Error("Expected string");
  }
  return value;
});

const userCreatedSchema = createMockSchema<{ userId: string; email: string }>(
  (value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("Expected object");
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.userId !== "string") {
      throw new Error("userId must be a string");
    }
    if (typeof obj.email !== "string") {
      throw new Error("email must be a string");
    }
    return { userId: obj.userId, email: obj.email };
  }
);

describe("defineEvent", () => {
  test("creates event definitions from array", () => {
    const events = defineEvent([
      { name: "user.created", schema: userCreatedSchema },
      { name: "user.deleted", schema: stringSchema, description: "User deleted event" },
    ]);

    expect(events["user.created"].name).toBe("user.created");
    expect(events["user.created"].schema).toBe(userCreatedSchema);
    expect(events["user.created"].options).toBeUndefined();

    expect(events["user.deleted"].name).toBe("user.deleted");
    expect(events["user.deleted"].options?.description).toBe("User deleted event");
  });

  test("creates event definitions with all options", () => {
    const events = defineEvent([
      { 
        name: "user.created", 
        schema: userCreatedSchema, 
        description: "Emitted when a user is created",
        channel: "users",
        requiresAck: true,
      },
    ]);

    expect(events["user.created"].name).toBe("user.created");
    expect(events["user.created"].options?.description).toBe("Emitted when a user is created");
    expect(events["user.created"].options?.channel).toBe("users");
    expect(events["user.created"].options?.requiresAck).toBe(true);
  });
});

describe("validatePayload", () => {
  test("validates correct payload", async () => {
    const result = await validatePayload(userCreatedSchema, {
      userId: "123",
      email: "test@example.com",
    });

    expect(result).toEqual({
      userId: "123",
      email: "test@example.com",
    });
  });

  test("throws ValidationError for invalid payload", async () => {
    await expect(
      validatePayload(userCreatedSchema, { userId: 123 })
    ).rejects.toThrow(ValidationError);
  });

  test("ValidationError contains issues", async () => {
    try {
      await validatePayload(userCreatedSchema, { invalid: "data" });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("Type inference", () => {
  test("InferOutput extracts correct type", () => {
    type Result = InferOutput<typeof userCreatedSchema>;
    // TypeScript will error if this is wrong
    const _test: Result = { userId: "123", email: "test@example.com" };
    expect(_test.userId).toBe("123");
  });

  test("EventNames extracts event names from registry", () => {
    const events = defineEvent([
      { name: "user.created", schema: userCreatedSchema },
      { name: "user.deleted", schema: stringSchema },
    ]);

    type Names = EventNames<typeof events>;
    const _name: Names = "user.created";
    expect(_name).toBe("user.created");
  });

  test("EventPayload extracts correct payload type", () => {
    const events = defineEvent([
      { name: "user.created", schema: userCreatedSchema },
    ]);

    type Payload = EventPayload<typeof events, "user.created">;
    const _payload: Payload = { userId: "123", email: "test@example.com" };
    expect(_payload.userId).toBe("123");
  });
});
