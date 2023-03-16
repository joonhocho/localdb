import { BTree } from 'bplustree-mq4uj/btree';
import { describe, expect, jest, test } from '@jest/globals';

jest.useFakeTimers();

describe('BTree', () => {
  test('BTree', () => {
    interface P {
      name: string;
      age: number;
      id: number;
    }

    const p1: P = { name: 'a', age: 18, id: 1 };
    const p2: P = { name: 'b', age: 19, id: 2 };
    const p3: P = { name: 'a', age: 20, id: 3 };
    const p4: P = { name: 'c', age: 21, id: 4 };
    const p5: P = { name: 'a', age: 18, id: 5 };

    let tree = new BTree<P, P>(
      [
        [p1, p1],
        [p2, p2],
        [p3, p3],
        [p4, p4],
        [p5, p5],
      ],
      (a, b) => {
        return a.name.localeCompare(b.name) || a.age - b.age;
      }
    );

    expect(tree.valuesArray()).toEqual([p5, p3, p2, p4]);

    tree = new BTree<P, P>(
      [
        [p1, p1],
        [p2, p2],
        [p3, p3],
        [p4, p4],
        [p5, p5],
      ],
      (a, b) => {
        return a.age - b.age || a.name.localeCompare(b.name);
      }
    );

    expect(Array.from(tree.keys())).toEqual([p5, p2, p3, p4]);

    expect(tree.keysArray()).toEqual([p5, p2, p3, p4]);

    expect(Array.from(tree.values())).toEqual([p5, p2, p3, p4]);

    expect(tree.valuesArray()).toEqual([p5, p2, p3, p4]);

    expect(Array.from(tree.entries())).toEqual([
      [p5, p5],
      [p2, p2],
      [p3, p3],
      [p4, p4],
    ]);

    expect(tree.forRange(p2, p4, false)).toEqual(2);

    expect(tree.forRange(p2, p4, true)).toEqual(3);
  });
});
