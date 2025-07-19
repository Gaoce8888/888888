import { useState } from 'react';

export function useAIChat() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function ask(prompt: string): Promise<string | null> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:6006/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      return data.reply;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { ask, loading, error };
}