import { useState } from 'react';

export function useIntent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function classify(text: string): Promise<string | null> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:6006/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      return data.intent;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { classify, loading, error };
}