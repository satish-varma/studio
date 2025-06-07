
const nextJest = require('next/jest')

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
     '^@/(.*)$': '<rootDir>/src/$1',
  },
  // transform: { // Not strictly needed if next/jest handles SWC transpilation correctly for TS
  //   '^.+\\.(ts|tsx)$': 'ts-jest',
  // },

  // For more advanced Firebase Emulator integration testing, you might consider:
  // 1. A separate Jest configuration file (e.g., jest.integration.config.js).
  // 2. Using globalSetup and globalTeardown scripts to programmatically start/stop emulators
  //    if not using `firebase emulators:exec`.
  // globalSetup: '<rootDir>/jest.globalSetup.js', // Example path
  // globalTeardown: '<rootDir>/jest.globalTeardown.js', // Example path
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config)

