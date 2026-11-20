"use client";

import { useEffect, useState } from "react";

// Client-side loader for /data/*.json (static files in public/data). Each file is fetched once
// per page load and shared between components.
const cache = new Map<string, Promise<unknown>>();

function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`/data/${name}`).then((r) => {
        if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(name) as Promise<T>;
}

export interface DataState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
}

export function useData<T>(name: string): DataState<T> {
  const [state, setState] = useState<DataState<T>>({ data: undefined, error: undefined, loading: true });
  useEffect(() => {
    let alive = true;
    load<T>(name)
      .then((data) => alive && setState({ data, error: undefined, loading: false }))
      .catch((e: Error) => {
        cache.delete(name);
        if (alive) setState({ data: undefined, error: e.message, loading: false });
      });
    return () => {
      alive = false;
    };
  }, [name]);
  return state;
}
