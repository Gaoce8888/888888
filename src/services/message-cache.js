import LZString from 'lz-string';
import localforage from 'localforage';

/**
 * 企业级消息缓存系统
 * 支持LRU缓存、数据压缩和持久化存储
 */
export class MessageCache {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 10000,
      maxMemorySize: options.maxMemorySize || 50 * 1024 * 1024, // 50MB
      ttl: options.ttl || 5 * 60 * 1000, // 5分钟
      compressionEnabled: options.compressionEnabled !== false,
      persistEnabled: options.persistEnabled !== false,
      compressionThreshold: options.compressionThreshold || 1024, // 1KB
      ...options
    };
    
    // LRU缓存映射
    this.cache = new Map();
    
    // 访问顺序记录
    this.accessOrder = [];
    
    // 缓存统计
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      compressions: 0,
      decompressions: 0,
      totalSize: 0,
      compressedSize: 0
    };
    
    // 初始化存储
    if (this.options.persistEnabled) {
      this.initStorage();
    }
    
    // 定期清理过期项
    this.startCleanup();
  }

  /**
   * 初始化持久化存储
   */
  async initStorage() {
    try {
      this.storage = localforage.createInstance({
        name: 'CustomerServiceApp',
        storeName: 'MessageCache'
      });
      
      // 恢复缓存
      await this.restoreFromStorage();
    } catch (error) {
      console.error('[MessageCache] Storage init failed:', error);
    }
  }

  /**
   * 从存储恢复缓存
   */
  async restoreFromStorage() {
    if (!this.storage) return;
    
    try {
      const keys = await this.storage.keys();
      
      for (const key of keys) {
        const item = await this.storage.getItem(key);
        
        if (item && !this.isExpired(item)) {
          this.cache.set(key, item);
          this.accessOrder.push(key);
          this.stats.totalSize += item.size || 0;
        } else {
          // 清理过期项
          await this.storage.removeItem(key);
        }
      }
      
      console.log(`[MessageCache] Restored ${this.cache.size} items from storage`);
    } catch (error) {
      console.error('[MessageCache] Failed to restore from storage:', error);
    }
  }

  /**
   * 获取缓存项
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    // 检查是否过期
    if (this.isExpired(item)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // 更新访问顺序
    this.updateAccessOrder(key);
    this.stats.hits++;
    
    // 解压数据
    if (item.compressed) {
      this.stats.decompressions++;
      return this.decompress(item.data);
    }
    
    return item.data;
  }

  /**
   * 设置缓存项
   */
  async set(key, value, ttl = this.options.ttl) {
    // 计算数据大小
    const size = this.calculateSize(value);
    
    // 检查内存限制
    if (this.stats.totalSize + size > this.options.maxMemorySize) {
      this.evictLRU();
    }
    
    // 检查缓存大小限制
    while (this.cache.size >= this.options.maxSize) {
      this.evictLRU();
    }
    
    // 压缩数据
    let data = value;
    let compressed = false;
    
    if (this.options.compressionEnabled && size > this.options.compressionThreshold) {
      data = this.compress(value);
      compressed = true;
      this.stats.compressions++;
      this.stats.compressedSize += this.calculateSize(data);
    }
    
    const item = {
      key,
      data,
      size,
      compressed,
      timestamp: Date.now(),
      ttl,
      expires: Date.now() + ttl
    };
    
    // 更新缓存
    if (this.cache.has(key)) {
      const oldItem = this.cache.get(key);
      this.stats.totalSize -= oldItem.size || 0;
    }
    
    this.cache.set(key, item);
    this.updateAccessOrder(key);
    this.stats.totalSize += size;
    
    // 持久化到存储
    if (this.storage && this.options.persistEnabled) {
      try {
        await this.storage.setItem(key, item);
      } catch (error) {
        console.error('[MessageCache] Failed to persist item:', error);
      }
    }
    
    return true;
  }

  /**
   * 批量设置缓存
   */
  async setBatch(items, ttl = this.options.ttl) {
    const promises = [];
    
    for (const [key, value] of items) {
      promises.push(this.set(key, value, ttl));
    }
    
    return Promise.all(promises);
  }

  /**
   * 删除缓存项
   */
  async delete(key) {
    const item = this.cache.get(key);
    
    if (item) {
      this.stats.totalSize -= item.size || 0;
      if (item.compressed) {
        this.stats.compressedSize -= this.calculateSize(item.data);
      }
      
      this.cache.delete(key);
      
      // 从访问顺序中移除
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      
      // 从存储中删除
      if (this.storage) {
        try {
          await this.storage.removeItem(key);
        } catch (error) {
          console.error('[MessageCache] Failed to delete from storage:', error);
        }
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * 清空缓存
   */
  async clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.totalSize = 0;
    this.stats.compressedSize = 0;
    
    if (this.storage) {
      try {
        await this.storage.clear();
      } catch (error) {
        console.error('[MessageCache] Failed to clear storage:', error);
      }
    }
  }

  /**
   * 检查项是否过期
   */
  isExpired(item) {
    return item.expires && Date.now() > item.expires;
  }

  /**
   * 更新访问顺序
   */
  updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    
    this.accessOrder.push(key);
  }

  /**
   * 驱逐最少使用的项
   */
  evictLRU() {
    if (this.accessOrder.length === 0) return;
    
    const key = this.accessOrder.shift();
    const item = this.cache.get(key);
    
    if (item) {
      this.stats.evictions++;
      this.delete(key);
    }
  }

  /**
   * 压缩数据
   */
  compress(data) {
    try {
      const json = JSON.stringify(data);
      return LZString.compressToUTF16(json);
    } catch (error) {
      console.error('[MessageCache] Compression failed:', error);
      return data;
    }
  }

  /**
   * 解压数据
   */
  decompress(data) {
    try {
      const json = LZString.decompressFromUTF16(data);
      return JSON.parse(json);
    } catch (error) {
      console.error('[MessageCache] Decompression failed:', error);
      return data;
    }
  }

  /**
   * 计算数据大小
   */
  calculateSize(data) {
    try {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return new Blob([str]).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 启动定期清理
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 清理过期项
   */
  async cleanup() {
    const expiredKeys = [];
    
    for (const [key, item] of this.cache) {
      if (this.isExpired(item)) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      await this.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      console.log(`[MessageCache] Cleaned up ${expiredKeys.length} expired items`);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;
    
    const compressionRate = this.stats.totalSize > 0
      ? ((this.stats.totalSize - this.stats.compressedSize) / this.stats.totalSize) * 100
      : 0;
    
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: hitRate.toFixed(2) + '%',
      compressionRate: compressionRate.toFixed(2) + '%',
      memoryUsage: this.formatBytes(this.stats.totalSize),
      averageItemSize: this.cache.size > 0 
        ? this.formatBytes(this.stats.totalSize / this.cache.size)
        : '0 B'
    };
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取缓存快照
   */
  getSnapshot() {
    const snapshot = {
      items: [],
      stats: this.getStats(),
      timestamp: Date.now()
    };
    
    for (const [key, item] of this.cache) {
      snapshot.items.push({
        key,
        size: this.formatBytes(item.size),
        compressed: item.compressed,
        age: Date.now() - item.timestamp,
        ttl: item.ttl,
        expires: item.expires - Date.now()
      });
    }
    
    return snapshot;
  }

  /**
   * 预热缓存
   */
  async warmup(keys, loader) {
    const promises = [];
    
    for (const key of keys) {
      if (!this.cache.has(key)) {
        promises.push(
          loader(key).then(data => {
            if (data) {
              return this.set(key, data);
            }
          }).catch(error => {
            console.error(`[MessageCache] Failed to warmup ${key}:`, error);
          })
        );
      }
    }
    
    await Promise.all(promises);
    console.log(`[MessageCache] Warmed up ${promises.length} items`);
  }

  /**
   * 销毁缓存
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.clear();
  }
}