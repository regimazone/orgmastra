import { useEffect, useRef, useState } from 'react';
import { faker } from '@faker-js/faker';

export type Trace = {
  id?: string;
  input: string;
  output: string;
  createdAt: string;
  entityId?: string;
  entityType?: string;
};

const LOCAL_STORAGE_KEY = 'mastra.traces';
const INITIAL_TRACE_COUNT = 5;

function generateInitialDatasets(): Trace[] {
  return Array.from({ length: INITIAL_TRACE_COUNT }, () => ({
    id: faker.string.uuid(),
    input: faker.lorem.paragraphs({ min: 1, max: 1 }),
    output: faker.lorem.paragraphs({ min: 4, max: 12 }),
    createdAt: faker.date.recent({ days: 10 }).toISOString(),
    entityId: faker.string.uuid(),
    entityType: 'agent',
  }));
}

function getTracesFromStorage(): Trace[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fallback to initial
    }
  }
  const initial = generateInitialDatasets();
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

export function useNewTraces(id?: string) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isFirstLoad = useRef(true);

  // Simulate fetching datasets from backend
  useEffect(() => {
    setIsLoading(true);
    const timeout = setTimeout(
      () => {
        const data = getTracesFromStorage();
        setTraces(data);
        setIsLoading(false);
        isFirstLoad.current = false;
      },
      200 + Math.random() * 100,
    ); // fake network delay
    return () => clearTimeout(timeout);
  }, []);

  return {
    traces,
    isLoading,
  };
}
