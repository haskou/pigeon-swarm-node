import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  maxWorkers: '50%',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@noble|@haskou|@faker-js)/)'],
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/Shared/',
    '/apps/migrations',
  ],
  verbose: true,
  roots: ['<rootDir>/src/', '<rootDir>/tests/'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  setupFiles: ['reflect-metadata'],
  coverageReporters: ['json'],
  coverageDirectory: '<rootDir>/coverage/unit',
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/shared',
    'src/index.ts',
    'src/Kernel.ts',
    'src/shared/infrastructure/',
    '/apps/migrations',
  ],
};

export default config;
