import { arraysEqual, dedupKeys } from 'util-3gcvv/array.js';
import { objectMap } from 'util-3gcvv/object.js';
import { describe, expect, jest, test } from '@jest/globals';
import { LocalDB } from '../src/LocalDB.js';

jest.useFakeTimers();

describe('LocalDB', () => {
  test('LocalDB', () => {
    const initData = {
      person: {
        p1: { id: 'p1', age: 10, name: 'john' },
        p2: { id: 'p2', age: 18, name: 'sean' },
      },
      city: {
        c1: { id: 'c1', name: 'Tokyo', location: [1, 2] },
      },
    };
    const db = new LocalDB<{
      person: { id: string; age: number; name: string };
      city: { id: string; name: string; location: number[] };
    }>(
      {
        person: {
          fields: {
            id: { type: 'string' },
            age: { type: 'number' },
            name: { type: 'string' },
          },
        },
        city: {
          fields: {
            id: { type: 'string' },
            name: { type: 'string' },
            location: {
              type: 'array',
              normalize: (x) => x.sort(),
              equals: arraysEqual,
            },
          },
        },
      },
      initData,
      { undoable: true }
    );

    expect(db.toJSON()).toEqual(initData);

    expect(db.state.canUndo).toBe(false);
    expect(db.state.canRedo).toBe(false);

    expect(db.collection('person')).toEqual(initData.person);
    expect(db.collection('city')).toEqual(initData.city);

    expect(db.doc('person', 'p1')).toEqual(initData.person.p1);
    expect(db.doc('person', 'p2')).toEqual(initData.person.p2);
    expect(db.doc('city', 'c1')).toEqual(initData.city.c1);

    const dbChanges: any[] = [];

    const unsubDb = db.subToDB((next, prev, change) => {
      dbChanges.push([change, next, prev]);
    });

    const personChanges: any[] = [];

    const unsubPerson = db.subToCol('person', (next, prev, change) => {
      personChanges.push([change, next, prev]);
    });

    const p1Changes: any[] = [];

    const unsubP1 = db.subToDoc('person', 'p1', (next, prev, change) => {
      p1Changes.push([change, next, prev]);
    });

    const p2Changes: any[] = [];

    const unsubP2 = db.subToDoc('person', 'p2', (next, prev, change) => {
      p2Changes.push([change, next, prev]);
    });

    const p1AgeChanges: any[] = [];

    const unsubP1Age = db.subToField(
      'person',
      'p1',
      'age',
      (next, prev, nextDoc, prevDoc) => {
        p1AgeChanges.push([next, prev, nextDoc, prevDoc]);
      }
    );

    const p1NameChanges: any[] = [];

    const unsubP1Name = db.subToField(
      'person',
      'p1',
      'name',
      (next, prev, nextDoc, prevDoc) => {
        p1NameChanges.push([next, prev, nextDoc, prevDoc]);
      }
    );

    /// update

    db.updateDoc('person', 'p1', { age: 11 });

    expect(db.doc('person', 'p1')).toEqual({ id: 'p1', age: 11, name: 'john' });

    expect(dbChanges).toEqual([
      [
        { person: { p1: { age: 11 } } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
          person: {
            p1: { age: 11, id: 'p1', name: 'john' },
            p2: { age: 18, id: 'p2', name: 'sean' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
          person: {
            p1: { age: 10, id: 'p1', name: 'john' },
            p2: { age: 18, id: 'p2', name: 'sean' },
          },
        },
      ],
    ]);

    expect(personChanges).toEqual([
      [
        { p1: { age: 11 } },
        {
          p1: { age: 11, id: 'p1', name: 'john' },
          p2: { age: 18, id: 'p2', name: 'sean' },
        },
        {
          p1: { age: 10, id: 'p1', name: 'john' },
          p2: { age: 18, id: 'p2', name: 'sean' },
        },
      ],
    ]);

    expect(p1Changes).toEqual([
      [
        { age: 11 },
        { age: 11, id: 'p1', name: 'john' },
        { age: 10, id: 'p1', name: 'john' },
      ],
    ]);

    expect(p2Changes).toEqual([]);

    expect(p1AgeChanges).toEqual([
      [
        11,
        10,
        { age: 11, id: 'p1', name: 'john' },
        { age: 10, id: 'p1', name: 'john' },
      ],
    ]);

    expect(p1NameChanges).toEqual([]);

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(false);

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    /// update

    db.updateDoc('person', 'p1', { age: 12, name: 'jack' });

    expect(db.doc('person', 'p1')).toEqual({ id: 'p1', age: 12, name: 'jack' });

    expect(dbChanges).toEqual([
      [
        { person: { p1: { age: 12, name: 'jack' } } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
          person: {
            p1: { age: 12, id: 'p1', name: 'jack' },
            p2: { age: 18, id: 'p2', name: 'sean' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
          person: {
            p1: { age: 11, id: 'p1', name: 'john' },
            p2: { age: 18, id: 'p2', name: 'sean' },
          },
        },
      ],
    ]);

    expect(personChanges).toEqual([
      [
        { p1: { age: 12, name: 'jack' } },
        {
          p1: { age: 12, id: 'p1', name: 'jack' },
          p2: { age: 18, id: 'p2', name: 'sean' },
        },
        {
          p1: { age: 11, id: 'p1', name: 'john' },
          p2: { age: 18, id: 'p2', name: 'sean' },
        },
      ],
    ]);

    expect(p1Changes).toEqual([
      [
        { age: 12, name: 'jack' },
        { age: 12, id: 'p1', name: 'jack' },
        { age: 11, id: 'p1', name: 'john' },
      ],
    ]);

    expect(p2Changes).toEqual([]);

    expect(p1AgeChanges).toEqual([
      [
        12,
        11,
        { age: 12, id: 'p1', name: 'jack' },
        { age: 11, id: 'p1', name: 'john' },
      ],
    ]);

    expect(p1NameChanges).toEqual([
      [
        'jack',
        'john',
        { age: 12, id: 'p1', name: 'jack' },
        { age: 11, id: 'p1', name: 'john' },
      ],
    ]);

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(false);

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    // transaction

    db.tx(() => {
      db.updateDoc('person', 'p1', { age: 13, name: 'jackson' });
      db.updateDoc('person', 'p1', { age: 14, name: 'jackson' });
      db.updateDoc('person', 'p2', { age: 18, name: 'sean' });
      db.updateDoc('city', 'c1', { name: 'austin', location: [2, 1] });
    });

    expect(db.doc('person', 'p1')).toEqual({
      id: 'p1',
      age: 14,
      name: 'jackson',
    });
    expect(db.doc('person', 'p2')).toEqual({ id: 'p2', age: 18, name: 'sean' });
    expect(db.doc('city', 'c1')).toEqual({
      id: 'c1',
      location: [1, 2],
      name: 'austin',
    });

    expect(dbChanges).toEqual([
      [
        {
          city: { c1: { name: 'austin' } },
          person: { p1: { age: 14, name: 'jackson' } },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p2: { age: 18, id: 'p2', name: 'sean' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
          person: {
            p1: { age: 12, id: 'p1', name: 'jack' },
            p2: { age: 18, id: 'p2', name: 'sean' },
          },
        },
      ],
    ]);

    expect(personChanges).toEqual([
      [
        { p1: { age: 14, name: 'jackson' } },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p2: { age: 18, id: 'p2', name: 'sean' },
        },
        {
          p1: { age: 12, id: 'p1', name: 'jack' },
          p2: { age: 18, id: 'p2', name: 'sean' },
        },
      ],
    ]);

    expect(p1Changes).toEqual([
      [
        { age: 14, name: 'jackson' },
        { age: 14, id: 'p1', name: 'jackson' },
        { age: 12, id: 'p1', name: 'jack' },
      ],
    ]);

    expect(p2Changes).toEqual([]);

    expect(p1AgeChanges).toEqual([
      [
        14,
        12,
        { age: 14, id: 'p1', name: 'jackson' },
        { age: 12, id: 'p1', name: 'jack' },
      ],
    ]);

    expect(p1NameChanges).toEqual([
      [
        'jackson',
        'jack',
        { age: 14, id: 'p1', name: 'jackson' },
        { age: 12, id: 'p1', name: 'jack' },
      ],
    ]);

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(false);

    // getters

    expect(db.collection('person')).toEqual({
      p1: { age: 14, id: 'p1', name: 'jackson' },
      p2: { age: 18, id: 'p2', name: 'sean' },
    });

    expect(db.collection('city')).toEqual({
      c1: { id: 'c1', location: [1, 2], name: 'austin' },
    });

    expect(db.docs('person', ['p1', 'p2', 'p3'])).toEqual([
      { age: 14, id: 'p1', name: 'jackson' },
      { age: 18, id: 'p2', name: 'sean' },
      undefined,
    ]);

    expect(db.docs('city', ['c0', 'c1'])).toEqual([
      undefined,
      { id: 'c1', location: [1, 2], name: 'austin' },
    ]);

    // undo / redo

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(false);

    db.undo();

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(true);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
      person: {
        p1: { age: 12, id: 'p1', name: 'jack' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.redo();

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(false);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
      person: {
        p1: { age: 14, id: 'p1', name: 'jackson' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.undo();

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(true);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
      person: {
        p1: { age: 12, id: 'p1', name: 'jack' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.undo();

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(true);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
      person: {
        p1: { age: 11, id: 'p1', name: 'john' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.undo();

    expect(db.state.canUndo).toBe(false);
    expect(db.state.canRedo).toBe(true);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
      person: {
        p1: { age: 10, id: 'p1', name: 'john' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.undo();

    expect(db.state.canUndo).toBe(false);
    expect(db.state.canRedo).toBe(true);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
      person: {
        p1: { age: 10, id: 'p1', name: 'john' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.redo();

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(true);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
      person: {
        p1: { age: 11, id: 'p1', name: 'john' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.redo();

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(true);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'Tokyo' } },
      person: {
        p1: { age: 12, id: 'p1', name: 'jack' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    db.redo();

    expect(db.state.canUndo).toBe(true);
    expect(db.state.canRedo).toBe(false);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
      person: {
        p1: { age: 14, id: 'p1', name: 'jackson' },
        p2: { age: 18, id: 'p2', name: 'sean' },
      },
    });

    // set doc new

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    db.setDoc('person', { id: 'p3', age: 21, name: 'mike' });

    expect(dbChanges).toEqual([
      [
        { person: { p3: { age: 21, id: 'p3', name: 'mike' } } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p2: { age: 18, id: 'p2', name: 'sean' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p2: { age: 18, id: 'p2', name: 'sean' },
          },
        },
      ],
    ]);
    expect(personChanges).toEqual([
      [
        { p3: { age: 21, id: 'p3', name: 'mike' } },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p2: { age: 18, id: 'p2', name: 'sean' },
          p3: { age: 21, id: 'p3', name: 'mike' },
        },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p2: { age: 18, id: 'p2', name: 'sean' },
        },
      ],
    ]);
    expect(p1Changes).toEqual([]);
    expect(p2Changes).toEqual([]);
    expect(p1AgeChanges).toEqual([]);
    expect(p1NameChanges).toEqual([]);

    // set doc overwrite

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    db.setDoc('person', { id: 'p2', age: 25, name: 'tom' });

    expect(dbChanges).toEqual([
      [
        { person: { p2: { age: 25, name: 'tom' } } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p2: { age: 25, id: 'p2', name: 'tom' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p2: { age: 18, id: 'p2', name: 'sean' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
      ],
    ]);
    expect(personChanges).toEqual([
      [
        { p2: { age: 25, name: 'tom' } },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p2: { age: 25, id: 'p2', name: 'tom' },
          p3: { age: 21, id: 'p3', name: 'mike' },
        },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p2: { age: 18, id: 'p2', name: 'sean' },
          p3: { age: 21, id: 'p3', name: 'mike' },
        },
      ],
    ]);
    expect(p1Changes).toEqual([]);
    expect(p2Changes).toEqual([
      [
        { age: 25, name: 'tom' },
        { age: 25, id: 'p2', name: 'tom' },
        { age: 18, id: 'p2', name: 'sean' },
      ],
    ]);
    expect(p1AgeChanges).toEqual([]);
    expect(p1NameChanges).toEqual([]);

    // delete doc

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    db.deleteDoc('person', 'p2');

    expect(dbChanges).toEqual([
      [
        { person: { p2: null } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p2: { age: 25, id: 'p2', name: 'tom' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
      ],
    ]);
    expect(personChanges).toEqual([
      [
        { p2: null },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p3: { age: 21, id: 'p3', name: 'mike' },
        },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p2: { age: 25, id: 'p2', name: 'tom' },
          p3: { age: 21, id: 'p3', name: 'mike' },
        },
      ],
    ]);
    expect(p1Changes).toEqual([]);
    expect(p2Changes).toEqual([
      [null, undefined, { age: 25, id: 'p2', name: 'tom' }],
    ]);
    expect(p1AgeChanges).toEqual([]);
    expect(p1NameChanges).toEqual([]);

    // test rollback

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    expect(() =>
      db.tx(() => {
        db.updateDoc('person', 'p1', { age: 15 });
        db.updateDoc('person', 'p1', { age: 16 });
        throw 1;
        db.updateDoc('person', 'p1', { age: 17 });
        db.updateDoc('person', 'p1', { age: 18 });
      })
    ).toThrowError();

    expect(dbChanges).toEqual([]);
    expect(personChanges).toEqual([]);
    expect(p1Changes).toEqual([]);
    expect(p2Changes).toEqual([]);
    expect(p1AgeChanges).toEqual([]);
    expect(p1NameChanges).toEqual([]);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
      person: {
        p1: { age: 14, id: 'p1', name: 'jackson' },
        p3: { age: 21, id: 'p3', name: 'mike' },
      },
    });

    // test tx

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    db.tx(() => {
      db.updateDoc('person', 'p1', { age: 15 });
      db.updateDoc('person', 'p1', { age: 16 });
    });

    expect(dbChanges).toEqual([
      [
        { person: { p1: { age: 16 } } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 16, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 14, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
      ],
    ]);
    expect(personChanges).toEqual([
      [
        { p1: { age: 16 } },
        {
          p1: { age: 16, id: 'p1', name: 'jackson' },
          p3: { age: 21, id: 'p3', name: 'mike' },
        },
        {
          p1: { age: 14, id: 'p1', name: 'jackson' },
          p3: { age: 21, id: 'p3', name: 'mike' },
        },
      ],
    ]);
    expect(p1Changes).toEqual([
      [
        { age: 16 },
        { age: 16, id: 'p1', name: 'jackson' },
        { age: 14, id: 'p1', name: 'jackson' },
      ],
    ]);
    expect(p2Changes).toEqual([]);
    expect(p1AgeChanges).toEqual([
      [
        16,
        14,
        { age: 16, id: 'p1', name: 'jackson' },
        { age: 14, id: 'p1', name: 'jackson' },
      ],
    ]);
    expect(p1NameChanges).toEqual([]);

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
      person: {
        p1: { age: 16, id: 'p1', name: 'jackson' },
        p3: { age: 21, id: 'p3', name: 'mike' },
      },
    });

    // delete docs

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    db.deleteDocs('person', []);

    expect(dbChanges).toEqual([]);

    db.deleteDocs('person', ['p1']);

    expect(dbChanges).toEqual([
      [
        { person: { p1: null } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: { p3: { age: 21, id: 'p3', name: 'mike' } },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 16, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
      ],
    ]);

    expect(Object.keys(db.collection('person'))).toEqual(['p3']);

    db.undo();

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    expect(Object.keys(db.collection('person'))).toEqual(['p3', 'p1']);

    expect(() => db.deleteDocs('person', ['p1', 'p2'])).toThrowError();

    expect(Object.keys(db.collection('person'))).toEqual(['p3', 'p1']);

    db.deleteDocs('person', ['p1', 'p3']);

    expect(Object.keys(db.collection('person'))).toEqual([]);

    expect(dbChanges).toEqual([
      [
        { person: { p1: null, p3: null } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {},
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 16, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
      ],
    ]);

    db.undo();

    // update docs

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    db.updateDocs('person', { p1: { age: 17 } });

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
      person: {
        p1: { age: 17, id: 'p1', name: 'jackson' },
        p3: { age: 21, id: 'p3', name: 'mike' },
      },
    });

    expect(dbChanges).toEqual([
      [
        { person: { p1: { age: 17 } } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 17, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 16, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
      ],
    ]);

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    expect(() =>
      db.updateDocs('person', { p1: { age: 18 }, p2: { age: 13 } })
    ).toThrowError();

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
      person: {
        p1: { age: 17, id: 'p1', name: 'jackson' },
        p3: { age: 21, id: 'p3', name: 'mike' },
      },
    });

    expect(dbChanges).toEqual([]);

    db.updateDocs('person', (persons) =>
      objectMap(persons, (x) => {
        return { age: x.age + 1 };
      })
    );

    expect(db.toJSON()).toEqual({
      city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
      person: {
        p1: { age: 18, id: 'p1', name: 'jackson' },
        p3: { age: 22, id: 'p3', name: 'mike' },
      },
    });

    expect(dbChanges).toEqual([
      [
        { person: { p1: { age: 18 }, p3: { age: 22 } } },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 18, id: 'p1', name: 'jackson' },
            p3: { age: 22, id: 'p3', name: 'mike' },
          },
        },
        {
          city: { c1: { id: 'c1', location: [1, 2], name: 'austin' } },
          person: {
            p1: { age: 17, id: 'p1', name: 'jackson' },
            p3: { age: 21, id: 'p3', name: 'mike' },
          },
        },
      ],
    ]);

    dbChanges.length = 0;
    personChanges.length = 0;
    p1Changes.length = 0;
    p2Changes.length = 0;
    p1AgeChanges.length = 0;
    p1NameChanges.length = 0;

    //
    // define new collection
    //

    expect(db.collectionNames).toEqual(['person', 'city']);

    expect(db.collection('color' as 'person')).toEqual(undefined);

    db.defineCollection<{ id: string; name: string; code: number }>('color', {
      fields: {
        id: { type: 'string' },
        name: { type: 'string', index: 'asc' },
        code: { type: 'number', index: 'desc' },
      },
    });

    expect(db.collectionNames).toEqual(['person', 'city', 'color']);

    const newDb = db as any as LocalDB<{
      person: { id: string; age: number; name: string };
      city: { id: string; name: string; location: number[] };
      color: { id: string; name: string; code: number };
    }>;

    const colorChanges: any[] = [];
    newDb.subToCol('color', (next, prev, change, fields) => {
      colorChanges.push([next, prev, change, fields]);
    });

    expect(newDb.collection('color')).toEqual({});

    expect(() => newDb.docsOrderBy('color', 'id')).toThrow();
    expect(newDb.docsOrderBy('color', 'name')).toEqual([]);
    expect(newDb.docsOrderBy('color', 'code')).toEqual([]);

    const red = { id: 'red', name: 'Red', code: 0xff0000 };
    newDb.setDoc('color', red);

    expect(newDb.docsOrderBy('color', 'name')).toEqual([red]);

    expect(newDb.docsOrderBy('color', 'code')).toEqual([red]);

    expect(newDb.collection('color')).toEqual({ red });

    expect(colorChanges).toEqual([
      [
        { red: { code: 16711680, id: 'red', name: 'Red' } },
        {},
        { red: { code: 16711680, id: 'red', name: 'Red' } },
        { code: true, id: true, name: true },
      ],
    ]);

    colorChanges.length = 0;

    newDb.updateDoc('color', 'red', { code: 0xf00000 });

    expect(newDb.docsOrderBy('color', 'name')).toEqual([
      { ...red, code: 0xf00000 },
    ]);

    expect(newDb.docsOrderBy('color', 'code')).toEqual([
      { ...red, code: 0xf00000 },
    ]);

    expect(newDb.collection('color')).toEqual({
      red: { code: 0xf00000, id: 'red', name: 'Red' },
    });

    expect(colorChanges).toEqual([
      [
        { red: { code: 15728640, id: 'red', name: 'Red' } },
        { red: { code: 16711680, id: 'red', name: 'Red' } },
        { red: { code: 15728640 } },
        { code: true },
      ],
    ]);

    newDb.setDocs('color', [
      { id: 'blue', name: 'Blue', code: 0x0000ff },
      { id: 'yellow', name: 'Yellow', code: 0xffff00 },
      { id: 'green', name: 'Green', code: 0x00ff00 },
    ]);

    expect(newDb.docsOrderBy('color', 'code').map((x) => x.code)).toEqual([
      16776960, 15728640, 65280, 255,
    ]);
    expect(newDb.docsOrderBy('color', 'name').map((x) => x.name)).toEqual([
      'Blue',
      'Green',
      'Red',
      'Yellow',
    ]);

    newDb.updateDoc('color', 'blue', { name: 'XXX', code: 0xffffff });

    expect(newDb.docsOrderBy('color', 'code').map((x) => x.code)).toEqual([
      16777215, 16776960, 15728640, 65280,
    ]);
    expect(newDb.docsOrderBy('color', 'name').map((x) => x.name)).toEqual([
      'Green',
      'Red',
      'XXX',
      'Yellow',
    ]);

    newDb.deleteCollection('color');

    expect(db.collectionNames).toEqual(['person', 'city']);
    expect(newDb.collection('color')).toEqual(undefined);

    expect(() => {
      newDb.setDoc('color', { id: 'red', name: 'Red', code: 0xff0000 });
    }).toThrow();
  });

  test('LocalDB computes', () => {
    const initData = {
      person: {
        p1: { id: 'p1', age: 10, age2: 20, name: 'john', name_age: 'john_10' },
        p2: { id: 'p2', age: 18, age2: 36, name: 'sean', name_age: 'sean_18' },
      },
    };

    const db = new LocalDB<{
      person: {
        id: string;
        age: number;
        age2: number;
        name: string;
        name_age: string;
      };
    }>(
      {
        person: {
          fields: {
            id: { type: 'string' },
            age: { type: 'number' },
            age2: { type: 'number' },
            name: { type: 'string' },
            name_age: { type: 'string' },
          },
          computes: [
            {
              deps: ['age', 'name'],
              mutates: ['name_age'],
              compute(doc) {
                return {
                  name_age: `${doc.name}_${doc.age}`,
                };
              },
            },
            {
              deps: ['name_age'],
              mutates: ['age', 'name'],
              compute(doc) {
                const i = doc.name_age.lastIndexOf('_');
                const name = doc.name_age.substring(0, i);
                const age = parseInt(doc.name_age.substring(i + 1), 10);
                return { name, age };
              },
            },
            {
              deps: ['age'],
              mutates: ['age2'],
              compute(doc) {
                return {
                  age2: doc.age * 2,
                };
              },
            },
            {
              deps: ['age2'],
              mutates: ['age'],
              compute(doc) {
                return {
                  age: doc.age2 / 2,
                };
              },
            },
          ],
        },
      },
      initData,
      { undoable: true }
    );

    expect(db.toJSON()).toEqual(initData);

    db.updateDoc('person', 'p1', { age: 12 });

    expect(db.doc('person', 'p1')).toEqual({
      age: 12,
      age2: 24,
      id: 'p1',
      name: 'john',
      name_age: 'john_12',
    });

    db.updateDoc('person', 'p1', { age: 20 });

    expect(db.doc('person', 'p1')).toEqual({
      age: 20,
      age2: 40,
      id: 'p1',
      name: 'john',
      name_age: 'john_20',
    });

    db.updateDoc('person', 'p1', { name: 'jack' });

    expect(db.doc('person', 'p1')).toEqual({
      age: 20,
      age2: 40,
      id: 'p1',
      name: 'jack',
      name_age: 'jack_20',
    });

    db.updateDoc('person', 'p1', { age: 11, name: 'sean' });

    expect(db.doc('person', 'p1')).toEqual({
      age: 11,
      age2: 22,
      id: 'p1',
      name: 'sean',
      name_age: 'sean_11',
    });

    db.updateDoc('person', 'p1', { name_age: 'john_12' });

    expect(db.doc('person', 'p1')).toEqual({
      age: 12,
      age2: 24,
      id: 'p1',
      name: 'john',
      name_age: 'john_12',
    });

    db.updateDoc('person', 'p1', { age2: 34 });

    expect(db.doc('person', 'p1')).toEqual({
      age: 17,
      age2: 34,
      id: 'p1',
      name: 'john',
      name_age: 'john_17',
    });

    expect(db.collection('person')).toEqual({
      p1: { age: 17, age2: 34, id: 'p1', name: 'john', name_age: 'john_17' },
      p2: { age: 18, age2: 36, id: 'p2', name: 'sean', name_age: 'sean_18' },
    });

    db.updateDocs(
      'person',
      {
        p1: { name_age: 'jack_19' },
        p2: { name_age: 'tom_21' },
      },
      { undoable: true }
    );

    expect(db.collection('person')).toEqual({
      p1: { age: 19, age2: 38, id: 'p1', name: 'jack', name_age: 'jack_19' },
      p2: { age: 21, age2: 42, id: 'p2', name: 'tom', name_age: 'tom_21' },
    });

    db.undo();

    expect(db.collection('person')).toEqual({
      p1: { age: 17, age2: 34, id: 'p1', name: 'john', name_age: 'john_17' },
      p2: { age: 18, age2: 36, id: 'p2', name: 'sean', name_age: 'sean_18' },
    });

    db.redo();

    expect(db.collection('person')).toEqual({
      p1: { age: 19, age2: 38, id: 'p1', name: 'jack', name_age: 'jack_19' },
      p2: { age: 21, age2: 42, id: 'p2', name: 'tom', name_age: 'tom_21' },
    });

    db.undo();

    expect(db.collection('person')).toEqual({
      p1: { age: 17, age2: 34, id: 'p1', name: 'john', name_age: 'john_17' },
      p2: { age: 18, age2: 36, id: 'p2', name: 'sean', name_age: 'sean_18' },
    });

    db.redo();

    expect(db.collection('person')).toEqual({
      p1: { age: 19, age2: 38, id: 'p1', name: 'jack', name_age: 'jack_19' },
      p2: { age: 21, age2: 42, id: 'p2', name: 'tom', name_age: 'tom_21' },
    });

    db.updateDocs(
      'person',
      {
        p1: { name_age: 'mike_23' },
        p2: { name_age: 'paul_27' },
      },
      { undoable: true }
    );

    expect(db.collection('person')).toEqual({
      p1: { age: 23, age2: 46, id: 'p1', name: 'mike', name_age: 'mike_23' },
      p2: { age: 27, age2: 54, id: 'p2', name: 'paul', name_age: 'paul_27' },
    });

    db.undo();

    expect(db.collection('person')).toEqual({
      p1: { age: 19, age2: 38, id: 'p1', name: 'jack', name_age: 'jack_19' },
      p2: { age: 21, age2: 42, id: 'p2', name: 'tom', name_age: 'tom_21' },
    });
  });

  test('LocalDB foreignComputes', () => {
    const initData = {
      person: {
        p1: { id: 'p1', name: 'jack', cars: [] },
      },
      car: {
        c1: { id: 'c1', owner: null, name: 'bmw' },
      },
    };

    type DB = {
      person: {
        id: string;
        name: string;
        cars: string[]; // car.id
      };
      car: {
        id: string;
        name: string;
        owner: string | null; // person.id
      };
    };

    const db = new LocalDB<DB>(
      {
        person: {
          fields: {
            id: { type: 'string' },
            name: { type: 'string' },
            cars: {
              type: 'string[]',
              normalize(list) {
                return dedupKeys(list).sort((a, b) => a.localeCompare(b));
              },
              equals: arraysEqual,
            },
          },
          foreignComputes: [
            {
              mutates: ['car'],
              compute(db, updates) {
                const carUpdates: Record<string, Partial<DB['car']>> = {};
                updates.map(({ next, prev }) => {
                  if (next?.cars !== prev?.cars) {
                    prev?.cars.forEach((carId) => {
                      carUpdates[carId] = { owner: null };
                    });
                    next?.cars.forEach((carId) => {
                      carUpdates[carId] = { owner: next.id };
                    });
                  }
                });
                db.updateDocs('car', carUpdates);
              },
            },
          ],
        },
        car: {
          fields: {
            id: { type: 'string' },
            name: { type: 'string', nullable: true },
            owner: { type: 'string' },
          },
          foreignComputes: [
            {
              mutates: ['person'],
              compute(db, updates) {
                updates.map(({ next, prev }) => {
                  if (next?.owner !== prev?.owner) {
                    db.updateDocs('person', (persons) => {
                      const personUpdates: Record<
                        string,
                        Partial<DB['person']>
                      > = {};

                      if (prev?.owner) {
                        const p = persons[prev.owner];
                        if (p) {
                          personUpdates[p.id] = {
                            cars: p.cars.filter((x) => x !== prev.id),
                          };
                        }
                      }

                      if (next?.owner) {
                        const p = persons[next.owner];
                        if (p) {
                          personUpdates[p.id] = {
                            cars: [...p.cars, next.id],
                          };
                        }
                      }

                      return personUpdates;
                    });
                  }
                });
              },
            },
          ],
        },
      },
      initData,
      { undoable: true }
    );

    expect(db.toJSON()).toEqual(initData);

    db.updateDoc('person', 'p1', { cars: ['c1', 'c1'] }, { undoable: true });

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: 'p1' } },
      person: { p1: { cars: ['c1'], id: 'p1', name: 'jack' } },
    });

    db.undo();

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: null } },
      person: { p1: { cars: [], id: 'p1', name: 'jack' } },
    });

    db.redo();

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: 'p1' } },
      person: { p1: { cars: ['c1'], id: 'p1', name: 'jack' } },
    });

    db.updateDoc('person', 'p1', { cars: [] }, { undoable: true });

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: null } },
      person: { p1: { cars: [], id: 'p1', name: 'jack' } },
    });

    db.updateDoc('person', 'p1', { cars: [] }, { undoable: true });

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: null } },
      person: { p1: { cars: [], id: 'p1', name: 'jack' } },
    });

    db.updateDoc('car', 'c1', { owner: 'p1' }, { undoable: true });

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: 'p1' } },
      person: { p1: { cars: ['c1'], id: 'p1', name: 'jack' } },
    });

    db.undo();

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: null } },
      person: { p1: { cars: [], id: 'p1', name: 'jack' } },
    });

    db.redo();

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: 'p1' } },
      person: { p1: { cars: ['c1'], id: 'p1', name: 'jack' } },
    });

    db.updateDoc('car', 'c1', { owner: null }, { undoable: true });

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: null } },
      person: { p1: { cars: [], id: 'p1', name: 'jack' } },
    });

    db.undo();

    expect(db.toJSON()).toEqual({
      car: { c1: { id: 'c1', name: 'bmw', owner: 'p1' } },
      person: { p1: { cars: ['c1'], id: 'p1', name: 'jack' } },
    });
  });
});
