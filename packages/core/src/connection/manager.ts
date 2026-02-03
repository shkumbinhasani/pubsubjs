import type { Transport, ConnectionState } from "../transport/interface";
import { ConnectionError } from "../errors";

/**
 * Options for the connection manager
 */
export interface ConnectionManagerOptions {
  /** Automatically connect on first operation */
  readonly lazyConnect?: boolean;
  /** Maximum reconnection attempts */
  readonly maxReconnectAttempts?: number;
  /** Base delay between reconnection attempts (ms) */
  readonly reconnectBaseDelay?: number;
  /** Maximum delay between reconnection attempts (ms) */
  readonly reconnectMaxDelay?: number;
}

const DEFAULT_OPTIONS: Required<ConnectionManagerOptions> = {
  lazyConnect: true,
  maxReconnectAttempts: 5,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
};

/**
 * Manages connection lifecycle with lazy connection and reconnection
 */
export class ConnectionManager {
  private readonly transport: Transport;
  private readonly options: Required<ConnectionManagerOptions>;
  private reconnectAttempts = 0;
  private connectPromise: Promise<void> | null = null;
  private isManuallyDisconnected = false;

  constructor(transport: Transport, options?: ConnectionManagerOptions) {
    this.transport = transport;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.transport.on("disconnect", () => {
      if (!this.isManuallyDisconnected) {
        this.handleDisconnect();
      }
    });

    this.transport.on("error", () => {
      if (!this.isManuallyDisconnected) {
        this.handleDisconnect();
      }
    });
  }

  get state(): ConnectionState {
    return this.transport.state;
  }

  get isConnected(): boolean {
    return this.transport.state === "connected";
  }

  /**
   * Ensure the transport is connected
   * Will initiate connection if lazy connect is enabled
   */
  async ensureConnected(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.isManuallyDisconnected = false;
    this.connectPromise = this.doConnect();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  /**
   * Manually connect the transport
   */
  async connect(): Promise<void> {
    this.isManuallyDisconnected = false;
    await this.ensureConnected();
  }

  /**
   * Disconnect the transport
   */
  async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.reconnectAttempts = 0;
    await this.transport.disconnect();
  }

  private async doConnect(): Promise<void> {
    try {
      await this.transport.connect();
      this.reconnectAttempts = 0;
    } catch (error) {
      throw new ConnectionError(
        "Failed to connect",
        error instanceof Error ? error : undefined
      );
    }
  }

  private handleDisconnect(): void {
    // Don't reconnect if already at max attempts or if options aren't set
    if (
      this.reconnectAttempts >= this.options.maxReconnectAttempts ||
      !this.options.reconnectBaseDelay
    ) {
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      this.options.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.options.reconnectMaxDelay
    );

    this.reconnectAttempts++;

    setTimeout(async () => {
      if (this.isManuallyDisconnected) {
        return;
      }

      try {
        await this.transport.connect();
        this.reconnectAttempts = 0;
      } catch {
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }
}
