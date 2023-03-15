import { describe, expect, jest, test } from '@jest/globals';

jest.useFakeTimers();

describe('runLater', () => {
  test('runs later', () => {
    console.log((global as any).abc);
    console.log((globalThis as any).abc);
    const mock = jest.fn();

    expect(mock).toHaveBeenCalledTimes(0);

    jest.advanceTimersToNextTimer();
  });
});
