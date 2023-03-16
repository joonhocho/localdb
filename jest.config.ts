import type { Config } from 'jest';

const config: Config = {
  // preset: 'ts-jest',
  preset: 'ts-jest/presets/js-with-babel', // needed to import es module library in ts test files
  resolver: 'jest-ts-webcompat-resolver', // needed to import ts files with js extension in ts test files
  testEnvironment: 'node',
  // extensionsToTreatAsEsm: ['.ts'],

  // transform: {
  // '^.+\\.ts?$': 'ts-jest',
  // '^.+\\.(js|jsx)$': 'babel-jest',
  // },
  transformIgnorePatterns: [
    'node_modules/(?!@joonhocho|util-3gcvv|bplustree-mq4uj)',
  ], // needed to import es module library in ts test files
  // globals: {
  //   abc: 3,
  // },
};

export default config;
