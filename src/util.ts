export const uppercase = (str: string): string => str.toUpperCase();

export const runLater = (fn: (...args: any[]) => any, delay: number): void => {
  setTimeout(fn, delay);
};
