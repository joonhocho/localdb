import { Debounce } from 'util-3gcvv/class/Debounce.js';
import { SortedArray } from 'util-3gcvv/class/SortedArray.js';
import { deepEqual } from 'util-3gcvv/deepEqual.js';
import { objectEmpty, objectKeys } from 'util-3gcvv/object.js';
import { randomString } from 'util-3gcvv/string.js';
import { defaultComparators } from './comparators.js';
import { LocalDBState } from './LocalDBState.js';

import type { KeyOf } from 'util-3gcvv/types/types.js';
import type {
  Collection,
  Collections,
  CollectionsChange,
  CollectionsChangeMap,
  ColListener,
  DBListener,
  DocListener,
  FieldListener,
  ICollectionConfig,
  ICollectionsConfig,
  ICollectionsFields,
  IDBOperation,
  IDBOperationHistoryItem,
  IDBQuery,
  IDBTxOptions,
  IDocument,
} from './types.js';
// TODO
// composite index
// index filter / sort
// watch filtered/sorted collection

export class LocalDB<CollectionTypes extends Record<string, IDocument>> {
  protected _options?: IDBTxOptions;

  protected _collectionNames: Array<KeyOf<CollectionTypes>>;
  protected _collections: Collections<CollectionTypes>;
  protected _config: ICollectionsConfig<CollectionTypes>;
  protected _fields: ICollectionsFields<CollectionTypes>;
  protected _saveCols: {
    [ColName in KeyOf<CollectionTypes>]: Debounce<() => void>;
  };

  protected _indexes: {
    [ColName in KeyOf<CollectionTypes>]: Record<
      string,
      SortedArray<CollectionTypes[ColName]>
    >;
  };

  protected _txChangedFields: CollectionsChangeMap<CollectionTypes> = {};
  protected _txChanges: CollectionsChange<CollectionTypes> = {};
  protected _txKey: string | null = null;
  protected _txOps: IDBOperationHistoryItem[] = [];
  protected _txRollbacks: VoidFunction[] = [];
  protected _txSnapshot: Collections<CollectionTypes> | null = null;
  protected _txOptions: IDBTxOptions | null = null;

  protected _noEvent = false;
  protected _undoable = false;

  protected _inUndoOrRedo = false;
  protected _opQueue: IDBOperation[] = [];

  protected _commiting = false;

  protected _listenerId = 0;

  protected _dbListeners: Array<{
    lid: number;
    handler: DBListener<CollectionTypes>;
  }> = [];

  protected _colListeners: Array<{
    lid: number;
    collection: KeyOf<CollectionTypes>;
    handler: ColListener<CollectionTypes, any>;
  }> = [];

  protected _docListeners: Array<{
    lid: number;
    collection: KeyOf<CollectionTypes>;
    id: string;
    handler: DocListener<CollectionTypes, any>;
  }> = [];

  protected _fieldListeners: Array<{
    lid: number;
    collection: KeyOf<CollectionTypes>;
    id: string;
    field: string;
    handler: FieldListener<CollectionTypes, any, any>;
  }> = [];

  state: LocalDBState = new LocalDBState({ history: [], historyIndex: 0 }, {});

  constructor(
    config: ICollectionsConfig<CollectionTypes>,
    initialData?: Collections<CollectionTypes>,
    options?: IDBTxOptions
  ) {
    this._options = options;

    this._collectionNames = [] as Array<KeyOf<CollectionTypes>>;
    this._collections = {} as Collections<CollectionTypes>;
    this._config = {} as ICollectionsConfig<CollectionTypes>;
    this._fields = {} as ICollectionsFields<CollectionTypes>;
    this._saveCols = {} as {
      [ColName in KeyOf<CollectionTypes>]: Debounce<() => void>;
    };

    this._indexes = {} as {
      [ColName in KeyOf<CollectionTypes>]: Record<
        string,
        SortedArray<CollectionTypes[ColName]>
      >;
    };

    const colNames = objectKeys(config);
    for (let i = 0, il = colNames.length; i < il; i += 1) {
      const col = colNames[i];
      this.defineCollection(col, config[col], initialData?.[col]);
    }
  }

  destroy(): void {
    this.saveDebounced.destroy();

    this._options = undefined;

    this._collectionNames = [] as any;
    this._collections = {} as any;
    this._config = {} as any;
    this._fields = {} as any;

    for (let col in this._saveCols) {
      this._saveCols[col]?.destroy();
    }
    this._saveCols = {} as any;

    for (let col in this._indexes) {
      const indexes = this._indexes[col];
      for (let name in indexes) {
        indexes[name].destroy();
      }
    }
    this._indexes = {} as any;

    this._txChangedFields = {};
    this._txChanges = {};
    this._txKey = null;
    this._txOps = [];
    this._txRollbacks = [];
    this._txSnapshot = null;
    this._txOptions = null;

    this.state.$destroy();

    this._dbListeners = [];
    this._colListeners = [];
    this._docListeners = [];
    this._fieldListeners = [];
    this._opQueue = [];

    this._listenerId = 0;
  }

  toJSON(): Collections<CollectionTypes> {
    return this._collections;
  }

  equals(other: Collections<CollectionTypes>): boolean {
    return deepEqual(this._collections, other);
  }

  //
  // Config
  //
  defineCollection<Data extends IDocument>(
    colName: string,
    config: ICollectionConfig<CollectionTypes, Data>,
    initialData?: { [id in string]: Data }
  ): void {
    const col = colName as KeyOf<CollectionTypes>;
    if (col in this._config) {
      throw new Error(`Collection, "${col}", is already defined`);
    }

    // config

    this._config[col] = config as ICollectionConfig<
      CollectionTypes,
      CollectionTypes[KeyOf<CollectionTypes>]
    >;

    // collection name

    this._collectionNames.push(col);

    // field names

    const fieldNames = objectKeys(config.fields);

    this._fields[col] = fieldNames as Array<
      KeyOf<CollectionTypes[KeyOf<CollectionTypes>]>
    >;

    // save data to storage

    this._saveCols[col] = new Debounce(
      () => this.saveCollectionToStorage(col),
      config.localStorageSetWait ?? 300
    );

    // initial data

    const { localStorageKey } = config;
    let colData: { [id in string]: Data } = {};
    if (initialData) {
      colData = initialData;
    } else if (localStorageKey) {
      const snapshot = localStorage.getItem(localStorageKey);
      if (snapshot) {
        colData = JSON.parse(snapshot);
      }
    }

    this._collections = { ...this._collections, [col]: colData };

    // indexes

    const docs: Data[] = [];
    if (colData) {
      for (let id in colData) {
        const doc = colData[id];
        docs.push(doc);
      }
    }

    const fieldIndexes = {} as Record<
      string,
      SortedArray<CollectionTypes[typeof col]>
    >;

    for (let fi = 0, fl = fieldNames.length; fi < fl; fi += 1) {
      const field = fieldNames[fi];
      const { type, compare, index } = config.fields[field];
      if (index) {
        let comparator: (a: any, b: any) => number;
        if (compare) {
          comparator = index === 'desc' ? (a, b) => compare(b, a) : compare;
        } else {
          comparator = defaultComparators[type as 'string']?.[index];
        }
        if (!comparator) {
          throw new Error(`Comparator must be set to index ${col}/${field}`);
        }

        fieldIndexes[field] = new SortedArray(docs, (a: Data, b: Data) =>
          comparator(a[field], b[field])
        ) as any;
      }
    }

    this._indexes[col] = fieldIndexes;
  }

  deleteCollection<ColName extends KeyOf<CollectionTypes>>(col: ColName): void {
    if (!(col in this._config)) {
      throw new Error(`Collection, "${col}", does not exist`);
    }

    delete this._config[col];

    this._collectionNames = this._collectionNames.filter((x) => x !== col);

    delete this._fields[col];

    delete this._saveCols[col];

    const next = { ...this._collections };
    delete next[col];
    this._collections = next;
  }

  existsCollection(col: string): boolean {
    return col in this._config;
  }

  get collectionNames(): Array<KeyOf<CollectionTypes>> {
    return this._collectionNames.slice();
  }

  //
  // Transaction
  //

  beginTx(options = this._options): string | null {
    if (this._txKey == null) {
      const key = randomString();

      this._txChangedFields = {};
      this._txChanges = {};
      this._txKey = key;
      this._txOps = [];
      this._txRollbacks = [];
      this._txSnapshot = this._collections;
      this._txOptions = options || null;

      this._noEvent = !!options?.noEvent;
      this._undoable = !!options?.undoable;

      return key;
    }
    return null;
  }

  endTx(txKey: string | null): void {
    if (txKey != null && this._txKey === txKey) {
      try {
        this._commitChanges();
      } catch (e) {
        this._rollback();
        throw e;
      }

      this._pushHistory();

      // reset
      this._txChangedFields = {};
      this._txChanges = {};
      this._txKey = null;
      this._txOps = [];
      this._txRollbacks = [];
      this._txSnapshot = null;
      this._txOptions = null;

      this._noEvent = false;
      this._undoable = false;

      this._flushQueue();
    }
  }

  protected _rollback(): void {
    if (this._txSnapshot) {
      this._collections = this._txSnapshot;

      for (let i = 0, il = this._txRollbacks.length; i < il; i += 1) {
        this._txRollbacks[i]();
      }

      // reset
      this._txChangedFields = {};
      this._txChanges = {};
      this._txKey = null;
      this._txOps = [];
      this._txRollbacks = [];
      this._txSnapshot = null;

      this._noEvent = false;
      this._undoable = false;
    }
  }

  tx(fn: () => void, options?: IDBTxOptions): void {
    const txKey = this.beginTx(options);
    if (txKey == null) {
      throw new Error('Already in transaction');
    }

    try {
      fn();
    } catch (e) {
      this._rollback();
      throw e;
    }

    this.endTx(txKey);
  }

  undoableTx(fn: () => void, options?: IDBTxOptions): void {
    return this.tx(fn, { ...options, undoable: true });
  }

  //
  // Listeners
  //

  subToDB(handler: DBListener<CollectionTypes>): () => void {
    const lid = this._listenerId++;

    this._dbListeners.push({ lid, handler });

    return () => this.unsubFromDB(lid);
  }

  unsubFromDB(lid: number): void {
    this._dbListeners = this._dbListeners.filter((x) => x.lid !== lid);
  }

  subToCol<ColName extends KeyOf<CollectionTypes>>(
    collection: ColName,
    handler: ColListener<CollectionTypes, ColName>
  ): () => void {
    const lid = this._listenerId++;

    this._colListeners.push({ lid, collection, handler });

    return () => this.unsubFromCol(lid);
  }

  unsubFromCol(lid: number): void {
    this._colListeners = this._colListeners.filter((x) => x.lid !== lid);
  }

  subToDoc<ColName extends KeyOf<CollectionTypes>>(
    collection: ColName,
    id: string,
    handler: DocListener<CollectionTypes, ColName>
  ): () => void {
    const lid = this._listenerId++;

    this._docListeners.push({ lid, collection, id, handler });

    return () => this.unsubFromDoc(lid);
  }

  unsubFromDoc(lid: number): void {
    this._docListeners = this._docListeners.filter((x) => x.lid !== lid);
  }

  subToField<
    ColName extends KeyOf<CollectionTypes>,
    Field extends KeyOf<CollectionTypes[ColName]>
  >(
    collection: ColName,
    id: string,
    field: Field,
    handler: FieldListener<CollectionTypes, ColName, Field>
  ): () => void {
    const lid = this._listenerId++;

    this._fieldListeners.push({ lid, collection, id, field, handler });

    return () => this.unsubFromField(lid);
  }

  unsubFromField(lid: number): void {
    this._fieldListeners = this._fieldListeners.filter((x) => x.lid !== lid);
  }

  //
  // Get
  //

  collection<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName
  ): Collection<CollectionTypes, ColName> {
    return this._collections[colName];
  }

  doc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    id: string
  ): CollectionTypes[ColName] | undefined {
    return this._collections[colName][id];
  }

  docs<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    ids: string[]
  ): Array<CollectionTypes[ColName] | undefined> {
    const col = this._collections[colName];
    return ids.map((id) => col[id]);
  }

  docsOrderBy<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    index: string
  ): Array<CollectionTypes[ColName]> {
    const col = this._indexes[colName];
    if (!(index in col)) {
      throw new Error(`index ${colName}/${index} not found`);
    }
    return col[index].array;
  }

  query<ColName extends KeyOf<CollectionTypes>>({
    collection,
    orderBy,
    limit,
    startAfter,
    startAt,
    endAfter,
    endAt,
  }: IDBQuery<CollectionTypes, ColName>): Array<CollectionTypes[ColName]> {
    const col = this._indexes[collection];
    if (!(orderBy in col)) {
      throw new Error(`index ${collection}/${orderBy} not found`);
    }
    const index = col[orderBy];
    // TODO
    return index.array;
  }

  //
  // Set / Update
  //

  setDoc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    doc: CollectionTypes[ColName],
    options?: IDBTxOptions
  ): void {
    if (this._commiting) {
      this._opQueue.push({ op: 'setDoc', args: [colName, doc] });
      return;
    }

    type Doc = CollectionTypes[ColName];
    const { id } = doc;
    const keys = this._fields[colName];

    const collections = this._collections;

    const prev = collections[colName][id] || null;
    if (prev != null) {
      const copy: Partial<Doc> = {};

      // delete unset fields
      for (let i = 0, il = keys.length; i < il; i += 1) {
        const key = keys[i];
        if (key in doc) {
          copy[key] = doc[key];
        } else {
          // undefined -> delete field
          copy[key] = undefined;
        }
      }

      return this.updateDoc(colName, id, copy, options);
    }

    // begin tx
    const txKey = this.beginTx(options);

    const _txChange = this._txChanges as any;
    const _txChangedFields = this._txChangedFields as Record<
      string,
      Record<string, boolean>
    >;

    const next = {} as Doc;

    for (let i = 0, il = keys.length; i < il; i += 1) {
      const key = keys[i];
      if (key in doc && doc[key] !== undefined) {
        next[key] = doc[key];

        // set changes
        const changeMapCol =
          _txChangedFields[colName] || (_txChangedFields[colName] = {});
        changeMapCol[key] = true;

        const changeCol = _txChange[colName] || (_txChange[colName] = {});
        const changeDoc = changeCol[id] || (changeCol[id] = {});
        changeDoc[key] = doc[key];
      }
    }

    // update data

    this._collections = {
      ...collections,
      [colName]: {
        ...collections[colName],
        [id]: next,
      },
    };

    // update indexes

    const indexes = this._indexes[colName];
    for (let indexName in indexes) {
      indexes[indexName].insertOne(next);
    }

    this._txRollbacks.push(() => {
      const indexes = this._indexes[colName];
      for (let indexName in indexes) {
        indexes[indexName].removeOne(next);
      }
    });

    // update undo history

    if (this._undoable && !this._inUndoOrRedo) {
      this._txOps.push({
        undo: { op: 'deleteDoc', args: [colName, id] },
        redo: { op: 'setDoc', args: [colName, doc] },
      });
    }

    this._config[colName].foreignComputes?.forEach((compute) => {
      compute.compute(this, [{ next, prev }]);
    });

    // end tx
    this.endTx(txKey);
  }

  setDocs<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    docs: Array<CollectionTypes[ColName]>,
    options?: IDBTxOptions
  ): void {
    if (!docs.length) return;

    if (this._commiting) {
      this._opQueue.push({ op: 'setDocs', args: [colName, docs] });
      return;
    }

    // begin tx
    const txKey = this.beginTx(options);

    // TODO undo, computes

    for (let i = 0, il = docs.length; i < il; i += 1) {
      this.setDoc(colName, docs[i], options);
    }

    // end tx
    this.endTx(txKey);
  }

  protected _updateDoc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    prev: CollectionTypes[ColName],
    update: Partial<CollectionTypes[ColName]>
  ): {
    next: CollectionTypes[ColName];
    changedKeys: Array<KeyOf<CollectionTypes[ColName]>>;
  } | null {
    //
    // Normalize Update
    //
    const config = this._config[colName];
    const keys = this._fields[colName];

    type Doc = CollectionTypes[ColName];
    let next: Doc = { ...prev };

    let changed = false;
    let updateNormalized: typeof update = {};

    for (let ki = 0, kl = keys.length; ki < kl; ki += 1) {
      const key = keys[ki];
      if (!(key in update)) continue;

      let nextVal = update[key];

      const { normalize, equals } = config.fields[key];
      if (normalize) {
        nextVal = normalize(nextVal!, next);
      }

      if (equals ? equals(nextVal!, prev[key]) : nextVal === prev[key]) {
        // noop
      } else {
        changed = true;
        updateNormalized[key] = nextVal;
        if (nextVal === undefined) {
          delete next[key];
        } else {
          next[key] = nextVal as Doc[typeof key];
        }
      }
    }

    if (!changed) return null;

    //
    // Computes
    //
    const { computes } = config;
    if (computes) {
      // previous doc state before update before this iteration
      let docBeforeUpdate = prev;

      // update before this iteration
      let updateBeforeIter = updateNormalized;

      // docBeforeUpdate + updateBeforeIter
      let docBeforeIter = next;

      let updateByThisIter: Partial<CollectionTypes[ColName]> = {};

      // docBeforeUpdate + updateBeforeIter + updateByThisIter
      let docAfterIter = { ...next };

      let changedByIter = false;

      let count = 0;
      while (true) {
        for (let ci = 0, cl = computes.length; ci < cl; ci += 1) {
          const { compute } = computes[ci];

          // check deps has changed
          let depsChanged = false;
          const deps = computes[ci].deps as Array<
            KeyOf<CollectionTypes[ColName]>
          >;
          for (let di = 0, dl = deps.length; di < dl; di += 1) {
            const dep = deps[di];
            if (dep in updateBeforeIter) {
              depsChanged = true;
            }
          }

          if (!depsChanged) continue;

          const computedUpdate = compute(docBeforeIter, docBeforeUpdate);
          if (!computedUpdate) continue;

          for (let ki = 0, kl = keys.length; ki < kl; ki += 1) {
            const key = keys[ki];
            if (!(key in computedUpdate)) continue;

            let nextVal = computedUpdate[key];

            const { normalize, equals } = config.fields[key];
            if (normalize) {
              nextVal = normalize(nextVal!, docAfterIter);
            }

            if (
              equals
                ? equals(nextVal!, docBeforeIter[key])
                : nextVal === docBeforeIter[key]
            ) {
              // noop
            } else {
              changedByIter = true;
              updateByThisIter[key] = nextVal;
              if (nextVal === undefined) {
                delete docAfterIter[key];
              } else {
                docAfterIter[key] = nextVal as Doc[typeof key];
              }
            }
          }
        }

        if (changedByIter) {
          docBeforeUpdate = docBeforeIter;
          updateBeforeIter = updateByThisIter;
          docBeforeIter = docAfterIter;
          updateByThisIter = {};
          docAfterIter = { ...docAfterIter };
          changedByIter = false;
        } else {
          next = docAfterIter;
          break;
        }

        if (count++ > 100) {
          throw new Error('too many compute loops');
        }
      }
    }

    if (!changed) return null;

    const changedKeys = keys.filter((key) => next[key] !== prev[key]);
    if (!changedKeys.length) return null;

    return { next, changedKeys };
  }

  updateDoc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    id: string,
    updater:
      | Partial<CollectionTypes[ColName]>
      | ((
          prev: CollectionTypes[ColName]
        ) => Partial<CollectionTypes[ColName]> | null | undefined),
    options?: IDBTxOptions
  ): void {
    if (this._commiting) {
      this._opQueue.push({ op: 'updateDoc', args: [colName, id, updater] });
      return;
    }

    const collections = this._collections;

    const prev = collections[colName][id];
    if (prev == null) {
      if (options?.ignoreNotFound || this._txOptions?.ignoreNotFound) return;

      this._rollback();
      throw new Error(`Cannot update non-existing document, ${colName}/${id}`);
    }

    const update = typeof updater === 'function' ? updater(prev) : updater;
    if (prev === update || update == null || objectEmpty(update)) return;

    // begin tx
    const txKey = this.beginTx(options);

    const result = this._updateDoc(colName, prev, update);
    if (result) {
      const { next, changedKeys } = result;

      const _txChange = this._txChanges as any;
      const _txChangedFields = this._txChangedFields as Record<
        string,
        Record<string, boolean>
      >;
      const prevFields: Partial<CollectionTypes[ColName]> = {};
      const nextFields: Partial<CollectionTypes[ColName]> = {};

      for (let ki = 0, kl = changedKeys.length; ki < kl; ki += 1) {
        const key = changedKeys[ki];
        const nextVal = next[key];
        const prevVal = prev[key];

        // update field
        prevFields[key] = prevVal;
        nextFields[key] = nextVal;

        // set changes
        const changeMapCol =
          _txChangedFields[colName] || (_txChangedFields[colName] = {});
        changeMapCol[key] = true;

        const changeCol = _txChange[colName] || (_txChange[colName] = {});
        const changeDoc = changeCol[id] || (changeCol[id] = {});
        changeDoc[key] = nextVal;
      }

      this._collections = {
        ...collections,
        [colName]: {
          ...collections[colName],
          [id]: next,
        },
      };

      // update indexes

      const indexes = this._indexes[colName];
      for (let indexName in indexes) {
        indexes[indexName].removeOne(prev);
        indexes[indexName].insertOne(next);
      }

      this._txRollbacks.push(() => {
        const indexes = this._indexes[colName];
        for (let indexName in indexes) {
          indexes[indexName].removeOne(next);
          indexes[indexName].insertOne(prev);
        }
      });

      // update undo history

      if (this._undoable && !this._inUndoOrRedo) {
        this._txOps.push({
          undo: { op: 'updateDoc', args: [colName, id, prevFields] },
          redo: { op: 'updateDoc', args: [colName, id, nextFields] },
        });
      }

      this._config[colName].foreignComputes?.forEach((compute) => {
        compute.compute(this, [{ next, prev }]);
      });
    }

    // end tx
    this.endTx(txKey);
  }

  updateDocs<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    updater:
      | Record<string, Partial<CollectionTypes[ColName]>>
      | ((
          prev: Collections<CollectionTypes>[ColName]
        ) =>
          | Record<string, Partial<CollectionTypes[ColName]> | null | undefined>
          | null
          | undefined),
    options?: IDBTxOptions
  ): void {
    if (this._commiting) {
      this._opQueue.push({ op: 'updateDocs', args: [colName, updater] });
      return;
    }

    const collections = this._collections;

    const prevCol = collections[colName];

    const update = typeof updater === 'function' ? updater(prevCol) : updater;
    if (prevCol === update || update == null || objectEmpty(update)) return;

    const nextCol = { ...prevCol } as typeof prevCol;

    // begin tx
    const txKey = this.beginTx(options);

    const _txChange = this._txChanges as any;
    const _txChangedFields = this._txChangedFields as Record<
      string,
      Record<string, boolean>
    >;

    // update docs

    type Doc = CollectionTypes[ColName];

    const prevUpdateMap: Record<string, Partial<Doc>> = {};
    const nextUpdateMap: Record<string, Partial<Doc>> = {};
    const prevDocs: Array<Doc> = [];
    const nextDocs: Array<Doc> = [];
    const foreignComputeArgs: Array<{
      next: Doc | null;
      prev: Doc | null;
    }> = [];

    let changed = false;

    const ignoreNotFound = !!(
      options?.ignoreNotFound || this._txOptions?.ignoreNotFound
    );

    const ids = objectKeys(update);
    for (let i = 0, il = ids.length; i < il; i += 1) {
      const id = ids[i];

      const prevDoc = prevCol[id];
      if (prevDoc == null) {
        if (ignoreNotFound) continue;

        this._rollback();
        throw new Error(
          `Cannot update non-existing document, ${colName}/${id}`
        );
      }

      const updateDoc = update[id];
      if (updateDoc == null || objectEmpty(updateDoc)) continue;

      const result = this._updateDoc(colName, prevDoc, updateDoc);
      if (!result) continue;

      changed = true;

      const { next: nextDoc, changedKeys } = result;

      const prevFields: Partial<Doc> = {};
      const nextFields: Partial<Doc> = {};

      for (let ki = 0, kl = changedKeys.length; ki < kl; ki += 1) {
        const key = changedKeys[ki];
        const nextVal = nextDoc[key];
        const prevVal = prevDoc[key];

        // update field
        prevFields[key] = prevVal;
        nextFields[key] = nextVal;

        // set changes
        const changeMapCol =
          _txChangedFields[colName] || (_txChangedFields[colName] = {});
        changeMapCol[key] = true;

        const changeCol = _txChange[colName] || (_txChange[colName] = {});
        const changeDoc = changeCol[id] || (changeCol[id] = {});
        changeDoc[key] = nextVal;
      }

      (nextCol as any)[id] = nextDoc;

      prevUpdateMap[id] = prevFields;
      nextUpdateMap[id] = nextFields;
      prevDocs.push(prevDoc);
      nextDocs.push(nextDoc);
      foreignComputeArgs.push({ next: nextDoc, prev: prevDoc });
    }

    // update data

    if (changed) {
      this._collections = {
        ...collections,
        [colName]: nextCol,
      };

      // update indexes

      const indexes = this._indexes[colName];
      for (let indexName in indexes) {
        indexes[indexName].removeMany(prevDocs);
        indexes[indexName].insertMany(nextDocs);
      }

      this._txRollbacks.push(() => {
        const indexes = this._indexes[colName];
        for (let indexName in indexes) {
          indexes[indexName].removeMany(nextDocs);
          indexes[indexName].insertMany(prevDocs);
        }
      });

      // update undo history

      if (this._undoable && !this._inUndoOrRedo) {
        this._txOps.push({
          undo: { op: 'updateDocs', args: [colName, prevUpdateMap] },
          redo: { op: 'updateDocs', args: [colName, nextUpdateMap] },
        });
      }

      this._config[colName].foreignComputes?.forEach((compute) => {
        compute.compute(this, foreignComputeArgs);
      });
    }

    // end tx
    this.endTx(txKey);
  }

  deleteDoc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    id: string,
    options?: IDBTxOptions
  ): void {
    if (this._commiting) {
      this._opQueue.push({ op: 'deleteDoc', args: [colName, id] });
      return;
    }

    const collections = this._collections;

    const prev = collections[colName][id];
    if (prev == null) {
      if (options?.idempotent || this._txOptions?.idempotent) return;
      this._rollback();
      throw new Error(`Cannot delete non-existing document, ${colName}/${id}`);
    }

    // begin tx
    const txKey = this.beginTx(options);

    // changes

    const _txChange = this._txChanges as any;
    const _txChangedFields = this._txChangedFields as Record<
      string,
      Record<string, boolean>
    >;

    const keys = this._fields[colName];
    for (let i = 0, il = keys.length; i < il; i += 1) {
      const key = keys[i];
      if (key in prev && prev[key] !== undefined) {
        // set changes
        const changeMapCol =
          _txChangedFields[colName] || (_txChangedFields[colName] = {});
        changeMapCol[key] = true;
      }
    }

    const changeCol = _txChange[colName] || (_txChange[colName] = {});
    changeCol[id] = null;

    // update data

    const nextCol = { ...collections[colName] };
    delete nextCol[id];

    this._collections = {
      ...collections,
      [colName]: nextCol,
    };

    // update indexes

    const indexes = this._indexes[colName];
    for (let indexName in indexes) {
      indexes[indexName].removeOne(prev);
    }

    this._txRollbacks.push(() => {
      const indexes = this._indexes[colName];
      for (let indexName in indexes) {
        indexes[indexName].insertOne(prev);
      }
    });

    // update undo history

    if (this._undoable && !this._inUndoOrRedo) {
      this._txOps.push({
        undo: { op: 'setDoc', args: [colName, prev] },
        redo: { op: 'deleteDoc', args: [colName, id] },
      });
    }

    this._config[colName].foreignComputes?.forEach((compute) => {
      compute.compute(this, [{ next: null, prev }]);
    });

    // end tx
    this.endTx(txKey);
  }

  deleteDocs<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    ids: string[],
    options?: IDBTxOptions
  ): void {
    if (!ids?.length) return;

    if (this._commiting) {
      this._opQueue.push({ op: 'deleteDocs', args: [colName, ids] });
      return;
    }

    // begin tx
    const txKey = this.beginTx(options);

    const idempotent = !!(options?.idempotent || this._txOptions?.idempotent);

    const _txChange = this._txChanges as any;
    const _txChangedFields = this._txChangedFields as Record<
      string,
      Record<string, boolean>
    >;

    const collections = this._collections;

    const prevCol = collections[colName];
    const nextCol = { ...prevCol };

    const fields = this._fields[colName];

    type Doc = CollectionTypes[ColName];

    const prevDocs: Doc[] = [];
    const foreignComputeArgs: Array<{
      next: Doc | null;
      prev: Doc | null;
    }> = [];

    for (let i = 0, il = ids.length; i < il; i += 1) {
      const id = ids[i];

      const prev = prevCol[id];
      if (prev == null) {
        if (idempotent) continue;

        this._rollback();
        throw new Error(
          `Cannot delete non-existing document, ${colName}/${id}`
        );
      }

      // changes

      for (let fi = 0, fl = fields.length; fi < fl; fi += 1) {
        const key = fields[fi];
        if (key in prev && prev[key] !== undefined) {
          // set changes
          const changeMapCol =
            _txChangedFields[colName] || (_txChangedFields[colName] = {});
          changeMapCol[key] = true;
        }
      }

      const changeCol = _txChange[colName] || (_txChange[colName] = {});
      changeCol[id] = null;

      delete nextCol[id];
      prevDocs.push(prev);
      foreignComputeArgs.push({ next: null, prev });
    }

    // update data

    this._collections = {
      ...collections,
      [colName]: nextCol,
    };

    // update indexes

    const indexes = this._indexes[colName];
    for (let indexName in indexes) {
      indexes[indexName].removeMany(prevDocs);
    }

    this._txRollbacks.push(() => {
      const indexes = this._indexes[colName];
      for (let indexName in indexes) {
        indexes[indexName].insertMany(prevDocs);
      }
    });

    // update undo history

    if (this._undoable && !this._inUndoOrRedo) {
      this._txOps.push({
        undo: { op: 'setDocs', args: [colName, prevDocs] },
        redo: { op: 'deleteDocs', args: [colName, ids] },
      });
    }

    this._config[colName].foreignComputes?.forEach((compute) => {
      compute.compute(this, foreignComputeArgs);
    });

    // end tx
    this.endTx(txKey);
  }

  protected _commitChanges() {
    if (this._commiting) return;

    const prev = this._txSnapshot;
    const next = this._collections;
    if (prev === next || prev == null) return;

    this._commiting = true;

    const _txChanges = this._txChanges;
    const _txChangedFields = this._txChangedFields;
    const txContext = this._txOptions?.context || {};

    // listeners

    const fieldListeners = this._fieldListeners;
    for (let i = 0, il = fieldListeners.length; i < il; i += 1) {
      const { collection, id, field, handler } = fieldListeners[i];

      const field2 = field as KeyOf<CollectionTypes[KeyOf<CollectionTypes>]>;
      const nextDoc = next[collection][id];
      const prevDoc = prev[collection][id];

      if (nextDoc?.[field2] !== prevDoc?.[field2]) {
        handler(
          nextDoc?.[field2],
          prevDoc?.[field2],
          nextDoc,
          prevDoc,
          txContext
        );
      }
    }

    const docListeners = this._docListeners;
    for (let i = 0, il = docListeners.length; i < il; i += 1) {
      const { collection, id, handler } = docListeners[i];
      if (next[collection][id] !== prev[collection][id]) {
        handler(
          next[collection][id],
          prev[collection][id],
          _txChanges[collection]![id],
          txContext
        );
      }
    }

    const colListeners = this._colListeners;
    for (let i = 0, il = colListeners.length; i < il; i += 1) {
      const { collection, handler } = colListeners[i];
      if (next[collection] !== prev[collection]) {
        handler(
          next[collection],
          prev[collection],
          _txChanges[collection],
          _txChangedFields[collection],
          txContext
        );
      }
    }

    const dbListeners = this._dbListeners;
    for (let i = 0, il = dbListeners.length; i < il; i += 1) {
      const { handler } = dbListeners[i];
      handler(next, prev, _txChanges, _txChangedFields, txContext);
    }

    // save to storage

    const cols = this._collectionNames;
    for (let i = 0, il = cols.length; i < il; i += 1) {
      const col = cols[i];
      if (next[col] !== prev[col]) {
        this._saveCols[col].debounced();
      }
    }

    this._commiting = false;
  }

  //
  // Queue
  //

  protected _flushQueue(): void {
    let count = 0;
    while (this._opQueue.length) {
      const { op, args } = this._opQueue.shift()!;
      (this[op] as Function).apply(this, args);
      if (count++ > 100) {
        throw new Error('too much');
      }
    }
  }

  //
  // History
  //

  protected _pushHistory(): void {
    if (!this._inUndoOrRedo && this._txOps.length) {
      this.state.$update(({ history, historyIndex }) => {
        const nextHistory = [...history.slice(0, historyIndex), this._txOps];
        return {
          history: nextHistory,
          historyIndex: nextHistory.length,
        };
      });
      this._txOps = [];
    }
  }

  undo(): void {
    if (this._txKey) {
      throw new Error('Cannot undo during transaction');
    }
    const { undoItem } = this.state;
    if (undoItem) {
      this._inUndoOrRedo = true;
      this.tx(() => {
        for (let i = undoItem.length - 1; i >= 0; i -= 1) {
          const { undo } = undoItem[i];
          (this[undo.op] as Function).apply(this, undo.args);
        }
        this.state.historyIndex--;
      });
      this._inUndoOrRedo = false;
    }
  }

  redo(): void {
    if (this._txKey) {
      throw new Error('Cannot redo during transaction');
    }
    const { redoItem } = this.state;
    if (redoItem) {
      this._inUndoOrRedo = true;
      this.tx(() => {
        for (let i = 0, il = redoItem.length; i < il; i += 1) {
          const { redo } = redoItem[i];
          (this[redo.op] as Function).apply(this, redo.args);
        }
        this.state.historyIndex++;
      });
      this._inUndoOrRedo = false;
    }
  }

  // Local Storage

  loadCollectionFromStorage<ColName extends KeyOf<CollectionTypes>>(
    collection: ColName
  ): Record<string, CollectionTypes[ColName]> | undefined {
    if (collection in this._config) {
      const { localStorageKey } = this._config[collection];
      if (localStorageKey) {
        const snapshot = localStorage.getItem(localStorageKey);
        if (snapshot) {
          return JSON.parse(snapshot);
        }
      }
      return undefined;
    }
  }

  saveCollectionToStorage<ColName extends KeyOf<CollectionTypes>>(
    collection: ColName
  ) {
    if (collection in this._config) {
      const { localStorageKey } = this._config[collection];
      if (localStorageKey) {
        localStorage.setItem(
          localStorageKey,
          JSON.stringify(this._collections[collection])
        );
      }
    }
  }

  protected loadFromStorage() {
    const data = this._collections;
    const cols = this._collectionNames;
    for (let i = 0, il = cols.length; i < il; i += 1) {
      const col = cols[i];
      const colData = this.loadCollectionFromStorage(col);
      if (colData) {
        data[col] = colData;
      }
    }
  }

  saveToStorage() {
    const data = this._collections;
    const cols = this._collectionNames;
    for (let i = 0, il = cols.length; i < il; i += 1) {
      const col = cols[i];
      const { localStorageKey } = this._config[col];
      if (localStorageKey) {
        localStorage.setItem(localStorageKey, JSON.stringify(data[col]));
      }
    }
  }

  saveDebounced = new Debounce(this.saveToStorage, 300, this);
}
