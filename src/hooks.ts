import { useEffect, useRef, useState } from 'react';
import { arraysEqual } from 'util-3gcvv/array.js';

import type { LocalDB } from './LocalDB.js';
import type { IDocument } from './types.js';
import type { KeyOf } from 'util-3gcvv/types/types.js';

export const useLocalDbDoc = <
  T extends Record<string, IDocument>,
  K extends KeyOf<T>
>(
  db: LocalDB<T>,
  col: K,
  id: string,
  deps: any[] = [db, col, id]
): T[K] | undefined => {
  const [doc, setDoc] = useState(() => db.doc(col, id));

  useEffect(() => {
    setDoc(db.doc(col, id));

    return db.subToDoc(col, id, setDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return doc;
};

export const useLocalDbDocs = <
  T extends Record<string, IDocument>,
  K extends KeyOf<T>
>(
  db: LocalDB<T>,
  col: K,
  ids: string[] | null | undefined,
  deps: any[] = [db, col, ids]
): Array<T[K] | undefined> => {
  const [docs, setDocs] = useState(() =>
    ids?.length ? db.docs(col, ids) : []
  );
  const docsRef = useRef(docs);

  useEffect(() => {
    const newDocs = ids?.length ? db.docs(col, ids) : [];

    if (!arraysEqual(docsRef.current, newDocs)) {
      docsRef.current = newDocs;
      setDocs(newDocs);
    }

    if (!ids?.length) return;

    return db.subToCol(col, (next, prev, change) => {
      for (let i = 0, il = ids.length; i < il; i += 1) {
        if (ids[i] in (change as object)) {
          docsRef.current = ids.map((id) => next[id]);
          return setDocs(docsRef.current);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return docs;
};
