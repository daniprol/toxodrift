import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '0.0.0.0' },
  // Discover both optional multiplayer entrypoints before interaction can trigger a reload.
  optimizeDeps: { include: ['@colyseus/sdk', '@colyseus/sdk/debug'] },
  build: { target: 'es2022' },
});
