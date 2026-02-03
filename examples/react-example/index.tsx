/**
 * DEPRECATED: Basic React example for the PubSub library
 * 
 * This file is kept for reference. For the comprehensive demo, see:
 * - frontend.tsx - Main application with all features
 * - server.ts - Bun.serve() server
 * - index.html - HTML entry point
 * - styles.css - Modern dark theme styles
 * - README.md - Documentation
 * 
 * To run the comprehensive demo:
 *   bun examples/react-example/server.ts
 * 
 * Then open http://localhost:3003
 */

// Re-export from the new comprehensive example for backwards compatibility
export * from './frontend.tsx';

console.warn(
  'index.tsx is deprecated. Please use the comprehensive example in frontend.tsx\n' +
  'Run: bun examples/react-example/server.ts'
);
