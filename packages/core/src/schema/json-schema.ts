import type { EventRegistry, StandardSchema } from "../types/schema";

/**
 * JSON Schema representation
 */
export interface JSONSchema {
  readonly type?: string;
  readonly properties?: Record<string, JSONSchema>;
  readonly required?: readonly string[];
  readonly items?: JSONSchema;
  readonly additionalProperties?: boolean | JSONSchema;
  readonly description?: string;
  readonly $ref?: string;
  readonly definitions?: Record<string, JSONSchema>;
  readonly [key: string]: unknown;
}

/**
 * Event catalog entry
 */
export interface EventCatalogEntry {
  readonly name: string;
  readonly description?: string;
  readonly channel: string;
  readonly schema?: JSONSchema;
}

/**
 * Try to extract JSON Schema from a Standard Schema
 * This works if the schema library provides a toJsonSchema method
 */
export function tryExtractJsonSchema(
  schema: StandardSchema
): JSONSchema | undefined {
  // Check if schema has toJsonSchema method (some libraries provide this)
  const schemaAny = schema as unknown as Record<string, unknown>;

  if (typeof schemaAny.toJsonSchema === "function") {
    return schemaAny.toJsonSchema() as JSONSchema;
  }

  // Check for Zod's zodToJsonSchema pattern
  if (schemaAny._def && typeof schemaAny._def === "object") {
    // Could use zod-to-json-schema here if available
    return undefined;
  }

  return undefined;
}

/**
 * Generate an event catalog from event definitions
 */
export function generateEventCatalog(
  events: EventRegistry,
  channelStrategy: (name: string) => string = (name) => name
): readonly EventCatalogEntry[] {
  return Object.entries(events).map(([name, def]) => ({
    name,
    description: def.options?.description,
    channel: def.options?.channel ?? channelStrategy(name),
    schema: tryExtractJsonSchema(def.schema),
  }));
}

/**
 * AsyncAPI document structure (simplified)
 */
export interface AsyncAPIDocument {
  readonly asyncapi: "2.6.0";
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description?: string;
  };
  readonly channels: Record<
    string,
    {
      readonly publish?: {
        readonly message: {
          readonly payload?: JSONSchema;
        };
      };
      readonly subscribe?: {
        readonly message: {
          readonly payload?: JSONSchema;
        };
      };
    }
  >;
}

/**
 * Generate an AsyncAPI document from event registries
 */
export function generateAsyncAPIDocument(options: {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
  readonly publishEvents?: EventRegistry;
  readonly subscribeEvents?: EventRegistry;
  readonly channelStrategy?: (name: string) => string;
}): AsyncAPIDocument {
  const channelStrategy = options.channelStrategy ?? ((name) => name);
  const channels: AsyncAPIDocument["channels"] = {};

  if (options.publishEvents) {
    for (const [name, def] of Object.entries(options.publishEvents)) {
      const channel = def.options?.channel ?? channelStrategy(name);
      channels[channel] = {
        ...channels[channel],
        publish: {
          message: {
            payload: tryExtractJsonSchema(def.schema),
          },
        },
      };
    }
  }

  if (options.subscribeEvents) {
    for (const [name, def] of Object.entries(options.subscribeEvents)) {
      const channel = def.options?.channel ?? channelStrategy(name);
      channels[channel] = {
        ...channels[channel],
        subscribe: {
          message: {
            payload: tryExtractJsonSchema(def.schema),
          },
        },
      };
    }
  }

  return {
    asyncapi: "2.6.0",
    info: {
      title: options.title,
      version: options.version,
      description: options.description,
    },
    channels,
  };
}
