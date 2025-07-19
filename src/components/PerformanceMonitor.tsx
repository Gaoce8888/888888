import React, { useEffect, useRef } from 'react';

interface Props {
  name: string;
  onMetrics?: (metrics: { mountTime: number }) => void;
  children: React.ReactNode;
}

export default function PerformanceMonitor({ name, onMetrics, children }: Props) {
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const mountTime = performance.now() - startRef.current;
    onMetrics?.({ mountTime });
    // eslint-disable-next-line no-console
    console.log(`[Perf] ${name} mounted in ${mountTime.toFixed(2)}ms`);
  }, [name, onMetrics]);

  return <>{children}</>;
}