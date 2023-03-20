import { SmartState, defineSmartState } from 'util-3gcvv/class/SmartState.js';

import type { IDBOperationHistoryItem } from './types.js';

export interface ILocalDBStateProps {
  history: IDBOperationHistoryItem[][];
  historyIndex: number;
  canRedo: boolean;
  canUndo: boolean;
  redoItem: IDBOperationHistoryItem[] | undefined;
  undoItem: IDBOperationHistoryItem[] | undefined;
}

type ComputedKeys = 'canUndo' | 'canRedo' | 'redoItem' | 'undoItem';

export const LocalDBState = defineSmartState<
  ILocalDBStateProps,
  ComputedKeys,
  {}
>({
  statics: {
    name: 'LocalDBState',
    fromJSON: (json: any): any => new LocalDBState(json.state, json.config),
  },
  properties: {
    history: { type: 'array', item: 'object' },
    historyIndex: { type: 'number' },
  },
  computed: {
    // []
    // [a, b, c, d]
    redoItem: {
      type: 'array',
      item: 'object',
      deps: ['history', 'historyIndex'],
      get({ history, historyIndex }) {
        return history[historyIndex];
      },
    },
    undoItem: {
      type: 'array',
      item: 'object',
      deps: ['history', 'historyIndex'],
      get({ history, historyIndex }) {
        return history[historyIndex - 1];
      },
    },
    canRedo: {
      type: 'boolean',
      deps: ['redoItem'],
      get({ redoItem }) {
        return redoItem != null;
      },
    },
    canUndo: {
      type: 'boolean',
      deps: ['undoItem'],
      get({ undoItem }) {
        return undoItem != null;
      },
    },
  },
  drafts: [],
});

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type LocalDBState = SmartState<ILocalDBStateProps, ComputedKeys, {}>;
