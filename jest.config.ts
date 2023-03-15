import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  resolver: 'jest-ts-webcompat-resolver',
  testEnvironment: 'node',
};

export default config;
