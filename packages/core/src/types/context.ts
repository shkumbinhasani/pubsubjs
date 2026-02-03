/**
 * Base context available to all handlers
 */
export interface BaseContext {
  /** Unique identifier for this message */
  readonly messageId: string;
  /** Timestamp when the message was received */
  readonly timestamp: Date;
  /** Transport-specific metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Authentication context with user information
 */
export interface AuthContext extends BaseContext {
  /** Authenticated user ID */
  readonly userId: string;
  /** User roles or permissions */
  readonly roles?: readonly string[];
  /** Session ID if available */
  readonly sessionId?: string;
}

/**
 * Connection context with connection-specific information
 */
export interface ConnectionContext extends BaseContext {
  /** Connection ID from the transport */
  readonly connectionId: string;
  /** Remote address if available */
  readonly remoteAddress?: string;
}

/**
 * Context factory creates context from transport metadata
 */
export type ContextFactory<TContext extends BaseContext> = (
  metadata: TransportMetadata
) => TContext | Promise<TContext>;

/**
 * Metadata passed from transport to context factory
 */
export interface TransportMetadata {
  /** Unique message ID */
  readonly messageId: string;
  /** Event channel/topic name */
  readonly channel: string;
  /** Connection ID if available */
  readonly connectionId?: string;
  /** Additional transport-specific data */
  readonly [key: string]: unknown;
}

/**
 * Default context factory that creates a BaseContext
 */
export function defaultContextFactory(
  metadata: TransportMetadata
): BaseContext {
  return {
    messageId: metadata.messageId,
    timestamp: new Date(),
    metadata,
  };
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
