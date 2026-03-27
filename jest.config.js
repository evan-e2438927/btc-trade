/** @type {import('jest').Config} */
const commonTransform = {
  '^.+\\.tsx?$': ['ts-jest', {
    tsconfig: {
      module: 'CommonJS',
      moduleResolution: 'node',
      esModuleInterop: true,
      paths: { '@/*': ['./*'] },
    },
  }],
};

module.exports = {
  preset: 'ts-jest',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: commonTransform,
  // Run existing __tests__/ in node env (they use Next.js server APIs)
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/**/*.test.ts'],
      transform: commonTransform,
      collectCoverageFrom: [
        'lib/orderService.ts',
        'lib/priceStore.ts',
        'app/api/**/*.ts',
      ],
    },
    {
      displayName: 'web',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx'],
      transform: commonTransform,
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
    },
  ],
};
