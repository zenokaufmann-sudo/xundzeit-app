import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    baseURL: 'http://localhost:4173/xundzeit-app/',
  },
  projects: [{ name: 'iphone-13-webkit', use: { browserName: 'webkit' } }],
  webServer: {
    command: 'VITE_E2E=1 npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/xundzeit-app/',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
