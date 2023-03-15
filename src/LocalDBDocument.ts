import { PubSub } from 'util-3gcvv/class/PubSub.js';
import { deepEqual } from 'util-3gcvv/deepEqual.js';
import { objectKeys } from 'util-3gcvv/object.js';

import type { KeyOf } from 'util-3gcvv/types/types.js';

export class LocalDBDocument<Data = any> extends PubSub<
  [Data, Data, Array<KeyOf<Data>>]
> {
  private _data: Data;

  constructor(data: Data) {
    super();
    this._data = data;
  }

  toJSON() {
    return this._data;
  }

  equals(other: LocalDBDocument<Data>) {
    return deepEqual(this._data, other._data);
  }

  destroy() {
    super.destroy();
    this._data = null as any as Data;
  }

  get id(): string {
    return (this._data as any).id;
  }

  get data(): Data {
    return this._data;
  }

  set data(next: Data) {
    this.set(next);
  }

  set(next: Data): void {
    return this.update(next);
  }

  update(update: Partial<Data>): void {
    const prev = this._data;

    const keys = objectKeys(update) as Array<KeyOf<Data>>;

    const changed: Partial<Data> = {};
    const changedKeys: Array<KeyOf<Data>> = [];

    const next: Data = { ...prev };

    for (let i = 0, il = keys.length; i < il; i += 1) {
      const key = keys[i];
      if (!deepEqual(update[key], prev[key])) {
        changed[key] = update[key];
        if (update[key] === undefined) {
          delete next[key];
        } else {
          next[key] = update[key] as Data[typeof key];
        }
        changedKeys.push(key);
      }
    }

    if (changedKeys.length) {
      this._data = next;
      this.emit(next, prev, changedKeys);
    }
  }
}
