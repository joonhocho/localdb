export const compareNil = (a: any, b: any): number | null => {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a === null) return 1;
  if (b === null) return -1;
  return null;
};

export const defaultComparators = {
  string: {
    // a -> z
    asc: (
      a: string | null | undefined,
      b: string | null | undefined
    ): number => {
      if (a === b) return 0;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    },
    // z -> a
    desc: (
      a: string | null | undefined,
      b: string | null | undefined
    ): number => {
      if (a === b) return 0;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      if (a === null) return 1;
      if (b === null) return -1;
      return b.localeCompare(a);
    },
  },
  number: {
    // 0 -> 9
    asc: (
      a: number | null | undefined,
      b: number | null | undefined
    ): number => {
      if (a === b) return 0;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    },
    // 9 -> 0
    desc: (
      a: number | null | undefined,
      b: number | null | undefined
    ): number => {
      if (a === b) return 0;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      if (a === null) return 1;
      if (b === null) return -1;
      return b - a;
    },
  },
  boolean: {
    // false -> true
    asc: (
      a: boolean | null | undefined,
      b: boolean | null | undefined
    ): number => {
      if (a === b) return 0;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a ? 1 : 0) - (b ? 1 : 0);
    },
    // true -> false
    desc: (
      a: boolean | null | undefined,
      b: boolean | null | undefined
    ): number => {
      if (a === b) return 0;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      if (a === null) return 1;
      if (b === null) return -1;
      return (b ? 1 : 0) - (a ? 1 : 0);
    },
  },
};
