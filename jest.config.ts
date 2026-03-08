import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  maxWorkers: '50%',
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.ts': 'ts-jest',
  },
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/Shared/',
    '/infrastructure/',
    '/apps/migrations',
  ],
  verbose: true,
  roots: ['<rootDir>/src/', '<rootDir>/tests/'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.jest.json',
    },
  },
  coverageReporters: ['json'],
  coverageDirectory: '<rootDir>/coverage/unit',
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/Shared',
    'src/index.ts',
    'src/Kernel.ts',
    '/infrastructure/',
    '/apps/migrations',
  ],
};

export default config;
