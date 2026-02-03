/**
 * Server for the React + PubSub example
 * 
 * Run with: bun examples/react-example/server.ts
 * Then open http://localhost:3003
 */

import index from "./index.html";

const PORT = 3003;

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           PubSub React Demo - Comprehensive Example           ║
╠═══════════════════════════════════════════════════════════════╣
║  Open http://localhost:${PORT} in your browser                   ║
║                                                               ║
║  Features Demonstrated:                                       ║
║    • Shopping cart with optimistic updates                    ║
║    • Real-time notification system                            ║
║    • User presence tracking                                   ║
║    • Live activity feed                                       ║
║    • Error boundaries & loading states                        ║
║    • State synchronization patterns                           ║
║    • Multiple hook patterns (useSubscribe, usePublish)        ║
║                                                               ║
║  Patterns:                                                    ║
║    • Zustand-style API (no Provider needed)                   ║
║    • Shared subscriptions with reference counting             ║
║    • Optimistic updates with rollback                         ║
║    • Event-driven architecture                                ║
║    • Type-safe with Zod validation                            ║
╚═══════════════════════════════════════════════════════════════╝
`);
