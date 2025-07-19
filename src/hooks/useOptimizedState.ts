import { useCallback, useRef, useState } from 'react';

function shallowEqual(objA: any, objB: any) {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== 'object' || typeof objB !== 'object' || objA === null || objB === null) {
    return false;
  }
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}

export function useOptimizedState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void] {
  const [state, setState] = useState(initial as any);
  const stateRef = useRef(state);

  const update = useCallback(
    (next: S | ((prev: S) => S)) => {
      const nextState = typeof next === 'function' ? (next as any)(stateRef.current) : next;
      if (!shallowEqual(stateRef.current, nextState)) {
        stateRef.current = nextState;
        setState(nextState);
      }
    },
    []
  );

  return [state, update];
}