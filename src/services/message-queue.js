import EventEmitter from 'eventemitter3';
import { compress, decompress } from 'lz-string';

/**
 * 消息优先级枚举
 */
export const MessagePriority = {
  CRITICAL: 0,    // 紧急消息（系统通知、紧急客服）
  HIGH: 1,        // 高优先级（重要消息）
  NORMAL: 2,      // 普通消息
  LOW: 3          // 低优先级（统计数据等）
};

/**
 * 企业级消息队列管理器
 * 功能：优先级队列、重试机制、批量处理、数据压缩、本地存储
 */
class MessageQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxQueueSize: 1000,
      retryAttempts: 3,
      retryDelay: 1000,
      batchSize: 10,
      processInterval: 100,
      persistToStorage: true,
      compressionEnabled: true,
      maxRetryDelay: 30000,
      ...options
    };
    
    // 优先级队列
    this.queues = {
      [MessagePriority.CRITICAL]: [],
      [MessagePriority.HIGH]: [],
      [MessagePriority.NORMAL]: [],
      [MessagePriority.LOW]: []
    };
    
    // 处理中的消息
    this.processing = new Map();
    
    // 失败的消息
    this.failed = [];
    
    // 统计信息
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      retries: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };
    
    // 处理器
    this.processor = null;
    this.isProcessing = false;
    
    // 存储键名
    this.storageKey = 'enterpriseMessageQueue';
    
    this.init();
  }
  
  init() {
    // 从本地存储恢复队列
    if (this.options.persistToStorage) {
      this.loadFromStorage();
    }
    
    // 启动处理器
    this.startProcessor();
    
    // 监听页面卸载事件，保存队列状态
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.saveToStorage();
      });
    }
  }
  
  /**
   * 添加消息到队列
   * @param {Object} message - 消息对象
   * @param {number} priority - 优先级
   * @param {Object} options - 选项
   */
  enqueue(message, priority = MessagePriority.NORMAL, options = {}) {
    // 检查队列大小
    const totalSize = this.getTotalQueueSize();
    if (totalSize >= this.options.maxQueueSize) {
      // 队列满时，移除低优先级消息
      this.removeLowPriorityMessages();
    }
    
    const queueItem = {
      id: this.generateId(),
      message: this.options.compressionEnabled ? this.compressMessage(message) : message,
      priority,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts || this.options.retryAttempts,
      delay: options.delay || this.options.retryDelay,
      timeout: options.timeout || 30000,
      callback: options.callback,
      metadata: options.metadata || {}
    };
    
    this.queues[priority].push(queueItem);
    this.stats.enqueued++;
    
    this.emit('enqueued', queueItem);
    
    // 持久化
    if (this.options.persistToStorage) {
      this.saveToStorage();
    }
    
    return queueItem.id;
  }
  
  /**
   * 启动消息处理器
   */
  startProcessor() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processor = setInterval(() => {
      this.processMessages();
    }, this.options.processInterval);
  }
  
  /**
   * 停止消息处理器
   */
  stopProcessor() {
    if (this.processor) {
      clearInterval(this.processor);
      this.processor = null;
    }
    this.isProcessing = false;
  }
  
  /**
   * 处理消息（批量）
   */
  async processMessages() {
    const batch = this.getNextBatch();
    if (batch.length === 0) return;
    
    // 并行处理批量消息
    const promises = batch.map(item => this.processMessage(item));
    await Promise.allSettled(promises);
  }
  
  /**
   * 获取下一批待处理消息
   */
  getNextBatch() {
    const batch = [];
    
    // 按优先级顺序获取消息
    for (const priority of Object.keys(this.queues).sort()) {
      const queue = this.queues[priority];
      while (queue.length > 0 && batch.length < this.options.batchSize) {
        batch.push(queue.shift());
      }
      if (batch.length >= this.options.batchSize) break;
    }
    
    return batch;
  }
  
  /**
   * 处理单个消息
   */
  async processMessage(item) {
    const startTime = Date.now();
    item.attempts++;
    
    this.processing.set(item.id, item);
    
    try {
      // 解压缩消息
      const message = this.options.compressionEnabled ? 
        this.decompressMessage(item.message) : item.message;
      
      // 触发处理事件
      const result = await this.emitAsync('processMessage', message, item.metadata);
      
      if (result && result.success) {
        // 处理成功
        this.handleProcessSuccess(item, startTime);
      } else {
        // 处理失败
        this.handleProcessFailure(item, result?.error || new Error('Processing failed'));
      }
      
    } catch (error) {
      this.handleProcessFailure(item, error);
    } finally {
      this.processing.delete(item.id);
    }
  }
  
  /**
   * 处理成功
   */
  handleProcessSuccess(item, startTime) {
    const processingTime = Date.now() - startTime;
    
    this.stats.processed++;
    this.stats.totalProcessingTime += processingTime;
    this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.processed;
    
    this.emit('processed', {
      id: item.id,
      processingTime,
      attempts: item.attempts
    });
    
    // 执行回调
    if (item.callback && typeof item.callback === 'function') {
      try {
        item.callback(null, { success: true, processingTime });
      } catch (error) {
        console.error('回调执行失败:', error);
      }
    }
  }
  
  /**
   * 处理失败
   */
  handleProcessFailure(item, error) {
    this.stats.retries++;
    
    if (item.attempts < item.maxAttempts) {
      // 重试
      const delay = Math.min(
        item.delay * Math.pow(2, item.attempts - 1),
        this.options.maxRetryDelay
      );
      
      setTimeout(() => {
        this.queues[item.priority].unshift(item);
      }, delay);
      
      this.emit('retry', {
        id: item.id,
        attempt: item.attempts,
        maxAttempts: item.maxAttempts,
        delay,
        error: error.message
      });
      
    } else {
      // 重试次数用尽，移到失败队列
      this.failed.push({
        ...item,
        failedAt: Date.now(),
        lastError: error.message
      });
      
      this.stats.failed++;
      
      this.emit('failed', {
        id: item.id,
        attempts: item.attempts,
        error: error.message
      });
      
      // 执行回调
      if (item.callback && typeof item.callback === 'function') {
        try {
          item.callback(error, { success: false, attempts: item.attempts });
        } catch (callbackError) {
          console.error('回调执行失败:', callbackError);
        }
      }
    }
  }
  
  /**
   * 异步事件触发
   */
  emitAsync(event, ...args) {
    return new Promise((resolve) => {
      const listeners = this.listeners(event);
      
      if (listeners.length === 0) {
        resolve({ success: false, error: new Error('No listeners') });
        return;
      }
      
      // 调用第一个监听器
      const listener = listeners[0];
      
      try {
        const callback = (error, result) => {
          if (error) {
            resolve({ success: false, error });
          } else {
            resolve({ success: true, result });
          }
        };
        
        // 添加回调到参数末尾
        const result = listener(...args, callback);
        
        // 如果返回Promise，等待完成
        if (result && typeof result.then === 'function') {
          result
            .then(res => resolve({ success: true, result: res }))
            .catch(err => resolve({ success: false, error: err }));
        }
        
      } catch (error) {
        resolve({ success: false, error });
      }
    });
  }
  
  /**
   * 压缩消息
   */
  compressMessage(message) {
    try {
      const jsonString = JSON.stringify(message);
      return compress(jsonString);
    } catch (error) {
      console.warn('消息压缩失败，使用原始消息:', error);
      return message;
    }
  }
  
  /**
   * 解压缩消息
   */
  decompressMessage(compressedMessage) {
    try {
      if (typeof compressedMessage === 'string') {
        const jsonString = decompress(compressedMessage);
        return JSON.parse(jsonString);
      }
      return compressedMessage;
    } catch (error) {
      console.warn('消息解压缩失败，使用原始消息:', error);
      return compressedMessage;
    }
  }
  
  /**
   * 移除低优先级消息
   */
  removeLowPriorityMessages() {
    // 从低优先级开始移除
    for (let priority = MessagePriority.LOW; priority >= MessagePriority.NORMAL; priority--) {
      if (this.queues[priority].length > 0) {
        const removed = this.queues[priority].splice(0, Math.ceil(this.queues[priority].length * 0.3));
        this.emit('messagesRemoved', { priority, count: removed.length });
        break;
      }
    }
  }
  
  /**
   * 获取队列总大小
   */
  getTotalQueueSize() {
    return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0);
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueSizes: Object.keys(this.queues).reduce((sizes, priority) => {
        sizes[priority] = this.queues[priority].length;
        return sizes;
      }, {}),
      totalQueueSize: this.getTotalQueueSize(),
      processingCount: this.processing.size,
      failedCount: this.failed.length
    };
  }
  
  /**
   * 清空指定优先级队列
   */
  clearQueue(priority) {
    if (this.queues[priority]) {
      const count = this.queues[priority].length;
      this.queues[priority] = [];
      this.emit('queueCleared', { priority, count });
      return count;
    }
    return 0;
  }
  
  /**
   * 清空所有队列
   */
  clearAllQueues() {
    const counts = {};
    Object.keys(this.queues).forEach(priority => {
      counts[priority] = this.queues[priority].length;
      this.queues[priority] = [];
    });
    
    this.failed = [];
    this.processing.clear();
    
    this.emit('allQueuesCleared', counts);
    return counts;
  }
  
  /**
   * 重试失败的消息
   */
  retryFailedMessages() {
    const retryCount = this.failed.length;
    
    this.failed.forEach(item => {
      // 重置尝试次数
      item.attempts = 0;
      item.delay = this.options.retryDelay;
      delete item.failedAt;
      delete item.lastError;
      
      this.queues[item.priority].push(item);
    });
    
    this.failed = [];
    this.emit('failedMessagesRetried', { count: retryCount });
    
    return retryCount;
  }
  
  /**
   * 保存到本地存储
   */
  saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const data = {
        queues: this.queues,
        failed: this.failed,
        stats: this.stats,
        timestamp: Date.now()
      };
      
      const jsonString = JSON.stringify(data);
      const compressed = this.options.compressionEnabled ? compress(jsonString) : jsonString;
      
      localStorage.setItem(this.storageKey, compressed);
    } catch (error) {
      console.error('保存队列状态失败:', error);
    }
  }
  
  /**
   * 从本地存储加载
   */
  loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;
      
      const jsonString = this.options.compressionEnabled ? decompress(stored) : stored;
      const data = JSON.parse(jsonString);
      
      // 检查数据时效性（1天）
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(this.storageKey);
        return;
      }
      
      this.queues = data.queues || this.queues;
      this.failed = data.failed || [];
      
      // 合并统计信息
      if (data.stats) {
        Object.assign(this.stats, data.stats);
      }
      
      this.emit('loadedFromStorage', {
        queueSize: this.getTotalQueueSize(),
        failedCount: this.failed.length
      });
      
    } catch (error) {
      console.error('加载队列状态失败:', error);
      localStorage.removeItem(this.storageKey);
    }
  }
  
  /**
   * 生成唯一ID
   */
  generateId() {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 销毁队列
   */
  destroy() {
    this.stopProcessor();
    this.clearAllQueues();
    
    if (this.options.persistToStorage) {
      this.saveToStorage();
    }
    
    this.removeAllListeners();
  }
}

// 创建全局实例
export const messageQueue = new MessageQueue();

export default MessageQueue;