declare module 'react' {
  export type ReactNode = unknown;
  export type FormEvent<T = Element> = {
    preventDefault: () => void;
    currentTarget: T;
  };

  export function useCallback<T extends (...args: never[]) => unknown>(
    callback: T,
    deps: unknown[],
  ): T;
  export function useEffect(effect: () => unknown, deps?: unknown[]): void;
  export function useState<T>(
    initial: T,
  ): [T, (value: T | ((prev: T) => T)) => void];
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: unknown;
  }
}
