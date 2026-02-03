import type { UnsubscribeFn } from "../types/handler";

/**
 * Connection state of a transport
 */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * Transport capabilities describe what operations a transport supports
 */
export interface TransportCapabilities {
  /** Can subscribe to events */
  readonly canSubscribe: boolean;
  /** Can publish events */
  readonly canPublish: boolean;
  /** Supports bidirectional communication */
  readonly bidirectional: boolean;
  /** Can send to specific connection IDs */
  readonly supportsTargeting: boolean;
  /** Supports channel/topic-based routing */
  readonly supportsChannels: boolean;
}

/**
 * Message received from the transport
 */
export interface TransportMessage {
  /** The channel/topic the message was received on */
  readonly channel: string;
  /** The raw payload data */
  readonly payload: unknown;
  /** Unique message ID */
  readonly messageId: string;
  /** Connection ID if available */
  readonly connectionId?: string;
  /** Additional transport-specific metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Handler for receiving messages from a transport
 */
export type TransportMessageHandler = (message: TransportMessage) => void;

/**
 * Options for publishing via transport
 */
export interface TransportPublishOptions {
  /** Target specific connection IDs */
  readonly targetIds?: readonly string[];
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Transport events that can be listened to
 */
export type TransportEvent =
  | "connect"
  | "disconnect"
  | "error"
  | "reconnecting"
  | "message";

/**
 * Transport event handler
 */
export type TransportEventHandler = (data?: unknown) => void;

/**
 * Core transport interface that all transport implementations must follow
 */
export interface Transport {
  /** Unique identifier for this transport instance */
  readonly id: string;

  /** Capabilities of this transport */
  readonly capabilities: TransportCapabilities;

  /** Current connection state */
  readonly state: ConnectionState;

  /**
   * Connect to the transport
   * Should be idempotent - calling when already connected is a no-op
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the transport
   * Should be idempotent - calling when already disconnected is a no-op
   */
  disconnect(): Promise<void>;

  /**
   * Subscribe to messages on a channel
   * @param channel - The channel to subscribe to
   * @param handler - Handler called when messages are received
   * @returns Unsubscribe function
   */
  subscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn>;

  /**
   * Publish a message to a channel
   * @param channel - The channel to publish to
   * @param payload - The message payload
   * @param options - Additional publish options
   */
  publish(
    channel: string,
    payload: unknown,
    options?: TransportPublishOptions
  ): Promise<void>;

  /**
   * Register an event listener
   */
  on(event: TransportEvent, handler: TransportEventHandler): void;

  /**
   * Remove an event listener
   */
  off(event: TransportEvent, handler: TransportEventHandler): void;
}

/**
 * Error thrown when transport operation is not supported
 */
export class TransportCapabilityError extends Error {
  constructor(transportId: string, operation: string) {
    super(`Transport "${transportId}" does not support ${operation}`);
    this.name = "TransportCapabilityError";
  }
}
