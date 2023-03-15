import { describe, expect, jest, test } from '@jest/globals';
import { runLater, uppercase } from '../src/util.js';

describe('uppercase', () => {
  test('transforms string to uppercase', () => {
    expect(uppercase('abc')).toEqual('ABC');
  });
});

jest.useFakeTimers();

describe('runLater', () => {
  test('runs later', () => {
    const mock = jest.fn();

    runLater(mock, 1000);

    expect(mock).toHaveBeenCalledTimes(0);

    jest.advanceTimersToNextTimer();

    expect(mock).toHaveBeenCalledTimes(1);
  });
});
