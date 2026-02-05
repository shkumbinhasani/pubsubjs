---
"@pubsubjs/core": minor
---

Add dynamic handler registration with per-handler unsubscribe

- `on()` now returns an `UnsubscribeFn` to remove a specific handler (breaking: was `this`)
- `off()` now returns `void` and tears down the transport subscription (breaking: was `this`)
- `onMany()` now returns an `UnsubscribeFn` to remove all registered handlers (breaking: was `this`)
- Multiple handlers can be registered for the same event — each receives messages independently
- Per-handler error isolation: one handler throwing does not affect other handlers on the same event
- Per-handler filter support: each handler can have its own filter policy via `on()` options
- Late-binding: handlers registered after `subscribe()` auto-subscribe to the transport
- Reference counting: transport subscription is removed when the last handler for an event is unsubscribed
