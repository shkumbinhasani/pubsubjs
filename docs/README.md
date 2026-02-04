# PubSubJS Documentation

Documentation site for PubSubJS - a type-safe, schema-validated pub/sub library for TypeScript.

Built with [Astro Starlight](https://starlight.astro.build).

## Development

```bash
# Install dependencies
bun install

# Start dev server at localhost:4321
bun dev

# Build for production
bun build

# Preview production build
bun preview
```

## Structure

```
src/content/docs/
├── index.mdx                    # Homepage
├── getting-started/             # Introduction, Installation, Quick Start
├── concepts/                    # Events, Publisher, Subscriber, Transports, Middleware, Context
├── transports/                  # WebSocket, Redis, SSE, Custom
├── react/                       # Setup, Hooks, Examples
├── advanced/                    # Error Handling, Testing, TypeScript
└── reference/                   # API Reference
```

## Contributing

1. Add or edit `.md` / `.mdx` files in `src/content/docs/`
2. Update sidebar in `astro.config.mjs` if adding new pages
3. Run `bun dev` to preview changes
4. Build with `bun build` to verify no errors
