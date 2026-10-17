'use client';
import { useEffect, useRef, useState } from 'react';

// Schedule after completion so slow requests never overlap the next refresh.
export function usePoll(load: (signal: AbortSignal) => Promise<void>, key: string) {
  const current = useRef(load);
  current.current = load;
  const [error, setError] = useState('');
  const [misses, setMisses] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try { await current.current(controller.signal); if (!controller.signal.aborted) { setError(''); setMisses(0); } }
      catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Could not refresh'); setMisses(n => n + 1); } }
      if (!controller.signal.aborted) timer = setTimeout(tick, 2000);
    }
    void tick();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, revision]);
  return { error, stale: misses >= 3, refresh: () => setRevision(n => n + 1) };
}
