import type { LocalDB } from './LocalDB.js';
import type { KeyOf } from 'util-3gcvv/types/types.js';

export interface IDocument {
  id: string;
}

export type Collections<CollectionTypes extends Record<string, IDocument>> = {
  [ColName in KeyOf<CollectionTypes>]: {
    [id in string]: CollectionTypes[ColName];
  };
};

export type CollectionsChange<
  CollectionTypes extends Record<string, IDocument>
> = {
  [ColName in KeyOf<CollectionTypes>]?: {
    [id in string]: Partial<CollectionTypes[ColName]> | null;
  };
};

export type CollectionsChangeMap<
  CollectionTypes extends Record<string, IDocument>
> = {
  [ColName in KeyOf<CollectionTypes>]?: {
    [Field in KeyOf<CollectionTypes[ColName]>]: true;
  };
};

export type Collection<
  CollectionTypes extends Record<string, IDocument>,
  ColName extends KeyOf<CollectionTypes>
> = Record<string, CollectionTypes[ColName]>;

export type ICollectionFieldsConfig<Doc extends IDocument> = {
  [P in KeyOf<Doc>]: {
    type:
      | 'boolean'
      | 'number'
      | 'string'
      | 'array'
      | 'object'
      | 'boolean[]'
      | 'number[]'
      | 'string[]'
      | 'array[]'
      | 'object[]';
    nullable?: boolean;
    normalize?(next: Doc[P], doc: Doc): Doc[P];
    equals?(a: Doc[P], b: Doc[P]): boolean;
    compare?(
      a: Doc[P] | null | undefined,
      b: Doc[P] | null | undefined
    ): number;
    index?: 'asc' | 'desc';
  };
};

export interface IDocumentIndexConfig<Doc extends IDocument> {
  fields: Array<KeyOf<Doc>>;
  compare: (a: Doc, b: Doc) => number;
}

export interface ICollectionConfig<
  CollectionTypes extends Record<string, IDocument>,
  Doc extends IDocument
> {
  localStorageKey?: string;
  localStorageSetWait?: number;
  remoteStorageKey?: string;
  remoteStorageSetWait?: number;
  indexes?: Record<string, IDocumentIndexConfig<Doc>>;
  idFields?: Array<KeyOf<Doc>>; // TODO composite id
  fields: ICollectionFieldsConfig<Doc>;
  computes?: Array<{
    deps: Array<KeyOf<Doc>>;
    mutates: Array<KeyOf<Doc>>;
    compute: (next: Doc, prev: Doc) => Partial<Doc> | null;
  }>;
  foreignComputes?: Array<{
    mutates: Array<KeyOf<CollectionTypes>>;
    compute: (
      db: LocalDB<CollectionTypes>,
      updates: Array<{
        next: Doc | null;
        prev: Doc | null;
      }>
    ) => void;
  }>;
}

export type ICollectionsConfig<
  CollectionTypes extends Record<string, IDocument>
> = {
  [ColName in KeyOf<CollectionTypes>]: ICollectionConfig<
    CollectionTypes,
    CollectionTypes[ColName]
  >;
};

export type ICollectionsFields<
  CollectionTypes extends Record<string, IDocument>
> = {
  [ColName in KeyOf<CollectionTypes>]: Array<KeyOf<CollectionTypes[ColName]>>;
};

export type FieldListener<
  CollectionTypes extends Record<string, IDocument>,
  ColName extends KeyOf<CollectionTypes>,
  FieldName extends KeyOf<CollectionTypes[ColName]>
> = (
  nextField: CollectionTypes[ColName][FieldName],
  prevField: CollectionTypes[ColName][FieldName],
  nextDoc: CollectionTypes[ColName],
  prevDoc: CollectionTypes[ColName],
  context: IDBTxContext
) => void;

export type DocListener<
  CollectionTypes extends Record<string, IDocument>,
  ColName extends KeyOf<CollectionTypes>
> = (
  nextDoc: CollectionTypes[ColName],
  prevDoc: CollectionTypes[ColName],
  change: Partial<CollectionTypes[ColName]> | null,
  context: IDBTxContext
) => void;

export type ColListener<
  CollectionTypes extends Record<string, IDocument>,
  ColName extends KeyOf<CollectionTypes>
> = (
  nextCol: Record<string, CollectionTypes[ColName]>,
  prevCol: Record<string, CollectionTypes[ColName]>,
  change: CollectionsChange<CollectionTypes>[ColName],
  changedFields: CollectionsChangeMap<CollectionTypes>[ColName],
  context: IDBTxContext
) => void;

export type DBListener<CollectionTypes extends Record<string, IDocument>> = (
  nextDb: Collections<CollectionTypes>,
  prevDb: Collections<CollectionTypes>,
  change: CollectionsChange<CollectionTypes>,
  changedFields: CollectionsChangeMap<CollectionTypes>,
  context: IDBTxContext
) => void;

export interface IDBOperations<
  CollectionTypes extends Record<string, IDocument> = any
> {
  setDoc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    doc: CollectionTypes[ColName]
  ): void;

  setDocs<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    docs: Array<CollectionTypes[ColName]>
  ): void;

  updateDoc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    id: string,
    updater:
      | Partial<CollectionTypes[ColName]>
      | ((
          prev: CollectionTypes[ColName]
        ) => Partial<CollectionTypes[ColName]> | null | undefined)
  ): void;

  updateDocs<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    updater:
      | Record<string, Partial<CollectionTypes[ColName]>>
      | ((
          prev: Collections<CollectionTypes>[ColName]
        ) =>
          | Record<string, Partial<CollectionTypes[ColName]> | null | undefined>
          | null
          | undefined)
  ): void;

  deleteDoc<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    id: string
  ): void;

  deleteDocs<ColName extends KeyOf<CollectionTypes>>(
    colName: ColName,
    ids: string[]
  ): void;
}

export type DBOpType = KeyOf<IDBOperations>;

export type IDBOperation = {
  [Op in KeyOf<IDBOperations>]: {
    op: Op;
    args: Parameters<IDBOperations[Op]>;
  };
}[KeyOf<IDBOperations>];

export interface IDBOperationHistoryItem {
  undo: IDBOperation;
  redo: IDBOperation;
}

export interface IDBTxContext {
  [key: string]: any;
}

export interface IDBTxOptions {
  undoable?: boolean;
  noEvent?: boolean;
  ignoreNotFound?: boolean;
  idempotent?: boolean;
  context?: IDBTxContext;
}

export interface IDBQuery<
  CollectionTypes extends Record<string, IDocument>,
  ColName extends KeyOf<CollectionTypes>
> {
  collection: ColName;
  orderBy: string;
  limit: number;
  endAfter?: any;
  endAt?: any;
  startAfter?: any;
  startAt?: any;
}
