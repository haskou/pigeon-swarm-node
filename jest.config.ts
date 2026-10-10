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
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  verbose: true,
  roots: ['<rootDir>/src/', '<rootDir>/tests/'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  setupFiles: [
    'reflect-metadata',
    '<rootDir>/tests/support/jest-environment.ts',
  ],
  coverageReporters: ['json'],
  coverageDirectory: '<rootDir>/coverage/unit',
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/shared',
    'src/index.ts',
    'src/Kernel.ts',
    'src/shared/infrastructure/',
  ],
};

export default config;
