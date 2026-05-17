import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/docker-tasking.test.js',
      'tests/gateway-guardian-policy.test.js',
      'tests/model-presets.test.js',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})