export class LRUCache<K = string, V = unknown> {
  private capacity: number;
  private map: Map<K, V>;

  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.map = new Map();
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      // Remove oldest
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Reinsert to mark as recently used
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  has(key: K) {
    return this.map.has(key);
  }

  size() {
    return this.map.size;
  }

  clear() {
    this.map.clear();
  }

  values() {
    return Array.from(this.map.values());
  }
}