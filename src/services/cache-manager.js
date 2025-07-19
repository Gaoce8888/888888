import { compress, decompress } from 'lz-string';

/**
 * LRU缓存节点
 */
class CacheNode {
  constructor(key, value, size = 0) {
    this.key = key;
    this.value = value;
    this.size = size;
    this.timestamp = Date.now();
    this.accessCount = 1;
    this.lastAccessed = Date.now();
    this.prev = null;
    this.next = null;
  }
}

/**
 * 企业级智能缓存管理器
 * 功能：LRU算法、数据压缩、过期策略、内存监控、持久化
 */
class CacheManager {
  constructor(options = {}) {
    this.options = {
      maxSize: 100 * 1024 * 1024, // 100MB
      maxItems: 10000,
      defaultTTL: 5 * 60 * 1000,  // 5分钟
      compressionEnabled: true,
      compressionThreshold: 1024,  // 1KB以上压缩
      persistToStorage: true,
      storageKey: 'enterpriseCache',
      cleanupInterval: 60000,      // 1分钟清理一次
      memoryWarningThreshold: 0.8, // 80%内存警告
      ...options
    };
    
    // 缓存数据
    this.cache = new Map();
    this.head = null;
    this.tail = null;
    
    // 统计信息
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      items: 0,
      compressionRatio: 0,
      memoryUsage: 0,
      cleanups: 0
    };
    
    // 定时器
    this.cleanupTimer = null;
    
    this.init();
  }
  
  init() {
    // 从本地存储加载
    if (this.options.persistToStorage) {
      this.loadFromStorage();
    }
    
    // 启动清理定时器
    this.startCleanup();
    
    // 监听页面卸载
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.saveToStorage();
      });
    }
  }
  
  /**
   * 获取缓存数据
   * @param {string} key - 缓存键
   * @returns {*} 缓存值
   */
  get(key) {
    const node = this.cache.get(key);
    
    if (!node) {
      this.stats.misses++;
      return null;
    }
    
    // 检查是否过期
    if (this.isExpired(node)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // 移到头部（最近使用）
    this.moveToHead(node);
    
    // 更新访问信息
    node.accessCount++;
    node.lastAccessed = Date.now();
    
    this.stats.hits++;
    
    // 解压缩数据
    return this.options.compressionEnabled ? 
      this.decompress(node.value) : node.value;
  }
  
  /**
   * 设置缓存数据
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - 生存时间（毫秒）
   * @returns {boolean} 是否设置成功
   */
  set(key, value, ttl = this.options.defaultTTL) {
    // 检查内存限制
    if (this.isMemoryWarning()) {
      this.forceCleanup();
    }
    
    const existingNode = this.cache.get(key);
    
    if (existingNode) {
      // 更新现有节点
      const oldSize = existingNode.size;
      existingNode.value = this.options.compressionEnabled ? 
        this.compress(value) : value;
      existingNode.size = this.calculateSize(existingNode.value);
      existingNode.timestamp = Date.now();
      existingNode.ttl = ttl;
      
      this.stats.size += existingNode.size - oldSize;
      this.moveToHead(existingNode);
      
    } else {
      // 创建新节点
      const compressedValue = this.options.compressionEnabled ? 
        this.compress(value) : value;
      const size = this.calculateSize(compressedValue);
      
      const node = new CacheNode(key, compressedValue, size);
      node.ttl = ttl;
      
      // 检查容量限制
      while (this.stats.items >= this.options.maxItems || 
             this.stats.size + size > this.options.maxSize) {
        if (!this.removeLRU()) break;
      }
      
      this.cache.set(key, node);
      this.addToHead(node);
      
      this.stats.size += size;
      this.stats.items++;
    }
    
    this.updateCompressionRatio();
    return true;
  }
  
  /**
   * 删除缓存数据
   * @param {string} key - 缓存键
   * @returns {boolean} 是否删除成功
   */
  delete(key) {
    const node = this.cache.get(key);
    
    if (!node) {
      return false;
    }
    
    this.cache.delete(key);
    this.removeNode(node);
    
    this.stats.size -= node.size;
    this.stats.items--;
    
    return true;
  }
  
  /**
   * 检查是否存在
   * @param {string} key - 缓存键
   * @returns {boolean} 是否存在
   */
  has(key) {
    const node = this.cache.get(key);
    return node && !this.isExpired(node);
  }
  
  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    
    this.stats.size = 0;
    this.stats.items = 0;
  }
  
  /**
   * 获取缓存键列表
   * @returns {string[]} 键列表
   */
  keys() {
    const keys = [];
    for (const [key, node] of this.cache) {
      if (!this.isExpired(node)) {
        keys.push(key);
      }
    }
    return keys;
  }
  
  /**
   * 获取缓存大小
   * @returns {number} 缓存大小（字节）
   */
  size() {
    return this.stats.size;
  }
  
  /**
   * 获取缓存项数量
   * @returns {number} 项数量
   */
  count() {
    return this.stats.items;
  }
  
  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      memoryUsagePercent: this.stats.size / this.options.maxSize,
      itemsUsagePercent: this.stats.items / this.options.maxItems
    };
  }
  
  /**
   * 压缩数据
   * @param {*} value - 原始值
   * @returns {*} 压缩后的值
   */
  compress(value) {
    try {
      const jsonString = JSON.stringify(value);
      
      if (jsonString.length < this.options.compressionThreshold) {
        return value; // 小数据不压缩
      }
      
      const compressed = compress(jsonString);
      
      // 如果压缩效果不好，返回原值
      if (compressed.length >= jsonString.length * 0.9) {
        return value;
      }
      
      return {
        __compressed: true,
        data: compressed,
        originalSize: jsonString.length
      };
      
    } catch (error) {
      console.warn('数据压缩失败:', error);
      return value;
    }
  }
  
  /**
   * 解压缩数据
   * @param {*} compressedValue - 压缩值
   * @returns {*} 原始值
   */
  decompress(compressedValue) {
    try {
      if (compressedValue && compressedValue.__compressed) {
        const jsonString = decompress(compressedValue.data);
        return JSON.parse(jsonString);
      }
      return compressedValue;
    } catch (error) {
      console.warn('数据解压缩失败:', error);
      return compressedValue;
    }
  }
  
  /**
   * 计算数据大小
   * @param {*} value - 数据值
   * @returns {number} 大小（字节）
   */
  calculateSize(value) {
    try {
      if (value && value.__compressed) {
        return value.data.length * 2; // Unicode字符占2字节
      }
      
      const jsonString = JSON.stringify(value);
      return jsonString.length * 2;
    } catch (error) {
      return 1024; // 默认1KB
    }
  }
  
  /**
   * 检查是否过期
   * @param {CacheNode} node - 缓存节点
   * @returns {boolean} 是否过期
   */
  isExpired(node) {
    if (!node.ttl) return false;
    return Date.now() - node.timestamp > node.ttl;
  }
  
  /**
   * 检查内存警告
   * @returns {boolean} 是否需要警告
   */
  isMemoryWarning() {
    return this.stats.size > this.options.maxSize * this.options.memoryWarningThreshold;
  }
  
  /**
   * 移动节点到头部
   * @param {CacheNode} node - 节点
   */
  moveToHead(node) {
    this.removeNode(node);
    this.addToHead(node);
  }
  
  /**
   * 添加节点到头部
   * @param {CacheNode} node - 节点
   */
  addToHead(node) {
    node.prev = null;
    node.next = this.head;
    
    if (this.head) {
      this.head.prev = node;
    }
    
    this.head = node;
    
    if (!this.tail) {
      this.tail = node;
    }
  }
  
  /**
   * 移除节点
   * @param {CacheNode} node - 节点
   */
  removeNode(node) {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }
  
  /**
   * 移除LRU节点
   * @returns {boolean} 是否移除成功
   */
  removeLRU() {
    if (!this.tail) return false;
    
    const key = this.tail.key;
    this.delete(key);
    return true;
  }
  
  /**
   * 强制清理
   */
  forceCleanup() {
    const targetSize = this.options.maxSize * 0.7; // 清理到70%
    const targetItems = this.options.maxItems * 0.7;
    
    while ((this.stats.size > targetSize || this.stats.items > targetItems) && this.tail) {
      this.removeLRU();
    }
    
    this.stats.cleanups++;
  }
  
  /**
   * 启动清理定时器
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }
  
  /**
   * 停止清理定时器
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  
  /**
   * 清理过期项
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, node] of this.cache) {
      if (this.isExpired(node)) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.delete(key));
    
    // 如果内存使用过高，强制清理
    if (this.isMemoryWarning()) {
      this.forceCleanup();
    }
    
    this.updateMemoryUsage();
  }
  
  /**
   * 更新压缩比
   */
  updateCompressionRatio() {
    let originalSize = 0;
    let compressedSize = 0;
    
    for (const node of this.cache.values()) {
      if (node.value && node.value.__compressed) {
        originalSize += node.value.originalSize;
        compressedSize += node.value.data.length;
      } else {
        const size = this.calculateSize(node.value);
        originalSize += size;
        compressedSize += size;
      }
    }
    
    this.stats.compressionRatio = originalSize > 0 ? 
      1 - (compressedSize / originalSize) : 0;
  }
  
  /**
   * 更新内存使用
   */
  updateMemoryUsage() {
    // 简单的内存估算
    this.stats.memoryUsage = this.stats.size + 
      (this.stats.items * 200); // 每项额外开销约200字节
  }
  
  /**
   * 保存到本地存储
   */
  saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const data = {
        items: [],
        stats: this.stats,
        timestamp: Date.now()
      };
      
      // 只保存非过期的项
      for (const [key, node] of this.cache) {
        if (!this.isExpired(node)) {
          data.items.push({
            key,
            value: node.value,
            size: node.size,
            timestamp: node.timestamp,
            accessCount: node.accessCount,
            lastAccessed: node.lastAccessed,
            ttl: node.ttl
          });
        }
      }
      
      const jsonString = JSON.stringify(data);
      const compressed = compress(jsonString);
      
      localStorage.setItem(this.options.storageKey, compressed);
      
    } catch (error) {
      console.error('保存缓存失败:', error);
    }
  }
  
  /**
   * 从本地存储加载
   */
  loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(this.options.storageKey);
      if (!stored) return;
      
      const jsonString = decompress(stored);
      const data = JSON.parse(jsonString);
      
      // 检查数据时效性（1天）
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(this.options.storageKey);
        return;
      }
      
      // 恢复缓存项
      data.items.forEach(item => {
        if (!this.isExpired(item)) {
          const node = new CacheNode(item.key, item.value, item.size);
          node.timestamp = item.timestamp;
          node.accessCount = item.accessCount;
          node.lastAccessed = item.lastAccessed;
          node.ttl = item.ttl;
          
          this.cache.set(item.key, node);
          this.addToHead(node);
          
          this.stats.size += item.size;
          this.stats.items++;
        }
      });
      
      // 恢复统计信息
      if (data.stats) {
        Object.assign(this.stats, data.stats);
      }
      
    } catch (error) {
      console.error('加载缓存失败:', error);
      localStorage.removeItem(this.options.storageKey);
    }
  }
  
  /**
   * 销毁缓存
   */
  destroy() {
    this.stopCleanup();
    
    if (this.options.persistToStorage) {
      this.saveToStorage();
    }
    
    this.clear();
  }
}

// 创建全局实例
export const messageCache = new CacheManager({
  maxSize: 50 * 1024 * 1024, // 50MB
  maxItems: 5000,
  storageKey: 'messageCache'
});

export const userCache = new CacheManager({
  maxSize: 10 * 1024 * 1024, // 10MB
  maxItems: 1000,
  defaultTTL: 10 * 60 * 1000, // 10分钟
  storageKey: 'userCache'
});

export default CacheManager;