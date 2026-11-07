'use client';

import { useLayoutEffect, useRef } from 'react';

/** A ref that always holds the latest committed value, for async handlers and callbacks. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
