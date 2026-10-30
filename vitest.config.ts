import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: '"teste"', __BUILD_DATE__: '"2026-01-01"' },
  resolve: {
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test-stubs/pwa-register-react.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
