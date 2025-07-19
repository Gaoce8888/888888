import EventEmitter from 'eventemitter3';
import localforage from 'localforage';

/**
 * 消息优先级枚举
 */
export const MessagePriority = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
  BATCH: 0
};

/**
 * 企业级消息队列系统
 * 支持优先级队列、重试机制、批量处理和持久化存储
 */
export class MessageQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxQueueSize: options.maxQueueSize || 1000,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      batchSize: options.batchSize || 10,
      processInterval: options.processInterval || 100,
      persistToStorage: options.persistToStorage !== false,
      storageKey: options.storageKey || 'message_queue',
      ...options
    };
    
    // 优先级队列
    this.queues = {
      [MessagePriority.CRITICAL]: [],
      [MessagePriority.HIGH]: [],
      [MessagePriority.NORMAL]: [],
      [MessagePriority.LOW]: [],
      [MessagePriority.BATCH]: []
    };
    
    // 处理中的消息
    this.processingMessages = new Map();
    
    // 失败的消息
    this.failedMessages = [];
    
    // 统计信息
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      retried: 0,
      dropped: 0,
      avgProcessTime: 0,
      processTimes: []
    };
    
    // 初始化存储
    if (this.options.persistToStorage) {
      this.initStorage();
    }
    
    // 启动处理器
    this.startProcessor();
  }

  /**
   * 初始化本地存储
   */
  async initStorage() {
    try {
      this.storage = localforage.createInstance({
        name: 'CustomerServiceApp',
        storeName: 'MessageQueue'
      });
      
      // 恢复队列状态
      await this.restoreFromStorage();
    } catch (error) {
      console.error('[MessageQueue] Storage init failed:', error);
    }
  }

  /**
   * 从存储恢复队列
   */
  async restoreFromStorage() {
    if (!this.storage) return;
    
    try {
      const savedState = await this.storage.getItem(this.options.storageKey);
      
      if (savedState && savedState.queues) {
        this.queues = savedState.queues;
        this.stats = savedState.stats || this.stats;
        console.log('[MessageQueue] Restored from storage:', this.getStats());
      }
    } catch (error) {
      console.error('[MessageQueue] Failed to restore from storage:', error);
    }
  }

  /**
   * 保存到存储
   */
  async saveToStorage() {
    if (!this.storage || !this.options.persistToStorage) return;
    
    try {
      await this.storage.setItem(this.options.storageKey, {
        queues: this.queues,
        stats: this.stats,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[MessageQueue] Failed to save to storage:', error);
    }
  }

  /**
   * 入队消息
   */
  enqueue(message, priority = MessagePriority.NORMAL) {
    // 检查队列大小
    const totalSize = this.getTotalSize();
    if (totalSize >= this.options.maxQueueSize) {
      // 队列满，根据优先级决定是否替换
      if (!this.makeRoomForMessage(priority)) {
        this.stats.dropped++;
        this.emit('messageDrop', { message, reason: 'queue_full' });
        return false;
      }
    }
    
    const messageWrapper = {
      id: this.generateMessageId(),
      message,
      priority,
      timestamp: Date.now(),
      attempts: 0,
      lastAttempt: null
    };
    
    this.queues[priority].push(messageWrapper);
    this.stats.enqueued++;
    
    this.emit('messageEnqueued', messageWrapper);
    
    // 保存到存储
    this.saveToStorage();
    
    return messageWrapper.id;
  }

  /**
   * 批量入队
   */
  enqueueBatch(messages, priority = MessagePriority.BATCH) {
    const ids = [];
    
    for (const message of messages) {
      const id = this.enqueue(message, priority);
      if (id) {
        ids.push(id);
      }
    }
    
    return ids;
  }

  /**
   * 生成消息ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 为新消息腾出空间
   */
  makeRoomForMessage(newPriority) {
    // 从低优先级开始删除
    for (let priority = MessagePriority.BATCH; priority < newPriority; priority++) {
      if (this.queues[priority].length > 0) {
        const removed = this.queues[priority].shift();
        this.stats.dropped++;
        this.emit('messageDrop', { message: removed, reason: 'priority_replacement' });
        return true;
      }
    }
    
    return false;
  }

  /**
   * 启动消息处理器
   */
  startProcessor() {
    this.processorInterval = setInterval(() => {
      this.processNextMessage();
    }, this.options.processInterval);
  }

  /**
   * 处理下一条消息
   */
  async processNextMessage() {
    // 按优先级顺序获取消息
    let messageWrapper = null;
    
    for (let priority = MessagePriority.CRITICAL; priority >= MessagePriority.BATCH; priority--) {
      if (this.queues[priority].length > 0) {
        messageWrapper = this.queues[priority].shift();
        break;
      }
    }
    
    if (!messageWrapper) {
      return; // 队列为空
    }
    
    // 标记为处理中
    this.processingMessages.set(messageWrapper.id, messageWrapper);
    
    const startTime = Date.now();
    
    try {
      // 通知处理器处理消息
      await this.processMessage(messageWrapper);
      
      // 处理成功
      this.handleSuccess(messageWrapper, Date.now() - startTime);
      
    } catch (error) {
      // 处理失败
      this.handleFailure(messageWrapper, error);
    }
  }

  /**
   * 处理消息
   */
  async processMessage(messageWrapper) {
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error('Process timeout'));
      }, 30000); // 30秒超时
      
      // 触发处理事件
      this.emit('processMessage', messageWrapper.message, (result) => {
        clearTimeout(timeout);
        
        if (result && result.success) {
          resolve(result);
        } else {
          reject(result?.error || new Error('Process failed'));
        }
      });
    });
  }

  /**
   * 处理成功
   */
  handleSuccess(messageWrapper, processTime) {
    this.processingMessages.delete(messageWrapper.id);
    this.stats.processed++;
    
    // 更新处理时间统计
    this.stats.processTimes.push(processTime);
    if (this.stats.processTimes.length > 100) {
      this.stats.processTimes.shift();
    }
    this.stats.avgProcessTime = this.stats.processTimes.reduce((a, b) => a + b, 0) / this.stats.processTimes.length;
    
    this.emit('messageProcessed', {
      message: messageWrapper,
      processTime
    });
    
    // 保存状态
    this.saveToStorage();
  }

  /**
   * 处理失败
   */
  handleFailure(messageWrapper, error) {
    messageWrapper.attempts++;
    messageWrapper.lastAttempt = Date.now();
    messageWrapper.lastError = error.message;
    
    this.processingMessages.delete(messageWrapper.id);
    
    if (messageWrapper.attempts < this.options.retryAttempts) {
      // 重试
      this.scheduleRetry(messageWrapper);
    } else {
      // 最终失败
      this.stats.failed++;
      this.failedMessages.push(messageWrapper);
      
      // 保持失败队列大小
      if (this.failedMessages.length > 100) {
        this.failedMessages.shift();
      }
      
      this.emit('messageFailed', {
        message: messageWrapper,
        error
      });
    }
    
    // 保存状态
    this.saveToStorage();
  }

  /**
   * 安排重试
   */
  scheduleRetry(messageWrapper) {
    const delay = this.calculateRetryDelay(messageWrapper.attempts);
    
    setTimeout(() => {
      // 重新入队，保持原优先级
      this.queues[messageWrapper.priority].push(messageWrapper);
      this.stats.retried++;
      
      this.emit('messageRetry', {
        message: messageWrapper,
        attempt: messageWrapper.attempts,
        delay
      });
    }, delay);
  }

  /**
   * 计算重试延迟（指数退避）
   */
  calculateRetryDelay(attempts) {
    return Math.min(
      this.options.retryDelay * Math.pow(2, attempts - 1),
      30000 // 最大30秒
    );
  }

  /**
   * 获取队列总大小
   */
  getTotalSize() {
    return Object.values(this.queues).reduce((sum, queue) => sum + queue.length, 0);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const queueSizes = {};
    for (const [priority, queue] of Object.entries(this.queues)) {
      queueSizes[priority] = queue.length;
    }
    
    return {
      ...this.stats,
      queueSizes,
      totalSize: this.getTotalSize(),
      processingCount: this.processingMessages.size,
      failedCount: this.failedMessages.length
    };
  }

  /**
   * 获取队列详情
   */
  getQueueDetails() {
    const details = {
      queues: {},
      processing: Array.from(this.processingMessages.values()),
      failed: this.failedMessages.slice(-10) // 最近10条失败消息
    };
    
    for (const [priority, queue] of Object.entries(this.queues)) {
      details.queues[priority] = queue.slice(0, 10).map(msg => ({
        id: msg.id,
        priority: msg.priority,
        timestamp: msg.timestamp,
        attempts: msg.attempts,
        age: Date.now() - msg.timestamp
      }));
    }
    
    return details;
  }

  /**
   * 清空指定优先级队列
   */
  clearQueue(priority) {
    if (priority !== undefined) {
      this.queues[priority] = [];
    } else {
      // 清空所有队列
      for (const priority in this.queues) {
        this.queues[priority] = [];
      }
    }
    
    this.saveToStorage();
  }

  /**
   * 清空失败队列
   */
  clearFailedMessages() {
    this.failedMessages = [];
  }

  /**
   * 重试失败的消息
   */
  retryFailedMessages() {
    const failed = [...this.failedMessages];
    this.failedMessages = [];
    
    for (const messageWrapper of failed) {
      messageWrapper.attempts = 0;
      this.enqueue(messageWrapper.message, messageWrapper.priority);
    }
    
    return failed.length;
  }

  /**
   * 暂停处理
   */
  pause() {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
    }
  }

  /**
   * 恢复处理
   */
  resume() {
    if (!this.processorInterval) {
      this.startProcessor();
    }
  }

  /**
   * 销毁队列
   */
  async destroy() {
    this.pause();
    
    // 清理存储
    if (this.storage) {
      await this.storage.removeItem(this.options.storageKey);
    }
    
    // 清理数据
    this.clear();
    this.processingMessages.clear();
    this.failedMessages = [];
    
    this.removeAllListeners();
  }

  /**
   * 清空所有数据
   */
  clear() {
    this.clearQueue();
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      retried: 0,
      dropped: 0,
      avgProcessTime: 0,
      processTimes: []
    };
  }
}