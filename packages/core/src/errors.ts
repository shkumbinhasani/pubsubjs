export { ValidationError } from "./types/schema";
export { TransportCapabilityError } from "./transport/interface";

/**
 * Error thrown when an operation is attempted on an invalid state
 */
export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}

/**
 * Error thrown when an event is not found in the registry
 */
export class UnknownEventError extends Error {
  constructor(eventName: string) {
    super(`Unknown event: "${eventName}"`);
    this.name = "UnknownEventError";
  }
}

/**
 * Error thrown when there's a connection problem
 */
export class ConnectionError extends Error {
  override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ConnectionError";
    this.cause = cause;
  }
}
