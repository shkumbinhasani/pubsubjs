import type { StandardSchemaV1 } from "@standard-schema/spec";

// Re-export types for convenience
export type StandardSchema<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output>;
export type InferOutput<TSchema extends StandardSchema> = StandardSchemaV1.InferOutput<TSchema>;
export type StandardSchemaResult<TOutput> = StandardSchemaV1.Result<TOutput>;
export type StandardSchemaIssue = StandardSchemaV1.Issue;

/**
 * Event definition with name, schema, and optional metadata
 */
export interface EventDefinition<
  TName extends string = string,
  TSchema extends StandardSchema = StandardSchema,
> {
  readonly name: TName;
  readonly schema: TSchema;
  readonly options?: EventOptions;
}

export interface EventOptions {
  /** Description for documentation */
  readonly description?: string;
  /** Custom channel name override (defaults to event name) */
  readonly channel?: string;
  /** Whether this event requires acknowledgment */
  readonly requiresAck?: boolean;
}

/**
 * Input type for defining events
 */
export interface EventDefinitionInput<
  TName extends string = string,
  TSchema extends StandardSchema = StandardSchema,
> {
  readonly name: TName;
  readonly schema: TSchema;
  readonly description?: string;
  readonly channel?: string;
  readonly requiresAck?: boolean;
}

/**
 * Create type-safe event definitions from an array
 *
 * @example
 * const events = defineEvent([
 *   { name: "user.created", schema: z.object({ userId: z.string() }), description: "User created" },
 *   { name: "user.updated", schema: z.object({ userId: z.string() }) },
 * ]);
 */
export function defineEvent<
  const TInputs extends readonly EventDefinitionInput<string, StandardSchema>[],
>(
  inputs: TInputs
): { [K in TInputs[number] as K["name"]]: EventDefinition<K["name"], K["schema"]> } {
  const result = {} as { [K in TInputs[number] as K["name"]]: EventDefinition<K["name"], K["schema"]> };

  for (const input of inputs) {
    const { name, schema, description, channel, requiresAck } = input;
    const options: EventOptions | undefined = description || channel || requiresAck !== undefined
      ? { description, channel, requiresAck }
      : undefined;

    (result as Record<string, EventDefinition>)[name] = {
      name,
      schema,
      options,
    };
  }

  return result;
}

/**
 * An event registry is a record of event definitions keyed by event name
 */
export type EventRegistry<
  TEvents extends Record<string, EventDefinition> = Record<
    string,
    EventDefinition
  >,
> = TEvents;

/**
 * Extract event names from an event registry
 */
export type EventNames<TRegistry extends EventRegistry> = keyof TRegistry &
  string;

/**
 * Extract the payload type for a specific event
 */
export type EventPayload<
  TRegistry extends EventRegistry,
  TEventName extends EventNames<TRegistry>,
> = TRegistry[TEventName] extends EventDefinition<string, infer TSchema>
  ? InferOutput<TSchema>
  : never;

/**
 * Validate a payload against a schema
 */
export async function validatePayload<TSchema extends StandardSchema>(
  schema: TSchema,
  payload: unknown
): Promise<InferOutput<TSchema>> {
  const result = await schema["~standard"].validate(payload);

  if (result.issues) {
    throw new ValidationError(result.issues);
  }

  return result.value as InferOutput<TSchema>;
}

/**
 * Validation error with detailed issues
 */
export class ValidationError extends Error {
  readonly issues: readonly StandardSchemaIssue[];

  constructor(issues: readonly StandardSchemaIssue[]) {
    const message = issues
      .map((issue) => {
        const path = issue.path?.join(".") ?? "";
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");

    super(`Validation failed: ${message}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
}
