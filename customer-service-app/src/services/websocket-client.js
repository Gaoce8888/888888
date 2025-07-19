import EventEmitter from 'eventemitter3';
import logger from '../utils/logger';
import { ConnectionPool } from './connection-pool';
import { NetworkMonitor } from './network-monitor';
import { MessageQueue } from './message-queue';

// WebSocket连接状态
const ConnectionState = {
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  DISCONNECTED: 'DISCONNECTED',
  FAILED: 'FAILED'
};

// 企业级WebSocket客户端
class EnterpriseWebSocketClient extends EventEmitter {
  constructor(url, options = {}) {
    super();
    
    this.url = url;
    this.options = {
      userId: options.userId || 'anonymous',
      userType: options.userType || 'customer',
      enableEnterpriseFeatures: options.enableEnterpriseFeatures !== false,
      reconnectInterval: options.reconnectInterval || 1000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      heartbeatInterval: options.heartbeatInterval || 30000,
      messageTimeout: options.messageTimeout || 10000,
      priority: options.priority || 'high',
      quality: options.quality || 'high_performance',
      ...options
    };

    this.state = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.messageCallbacks = new Map();
    this.messageId = 0;
    
    // 企业级功能
    if (this.options.enableEnterpriseFeatures) {
      this.connectionPool = new ConnectionPool(this);
      this.networkMonitor = new NetworkMonitor();
      this.messageQueue = new MessageQueue({
        maxQueueSize: this.options.maxQueueSize || 1000,
        retryAttempts: this.options.retryAttempts || 3,
        retryDelay: this.options.retryDelay || 1000
      });
      
      this.initializeEnterpriseFeatures();
    }

    // 性能指标
    this.metrics = {
      connectionTime: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      reconnections: 0,
      latency: [],
      networkQuality: 100
    };

    this.connect();
  }

  initializeEnterpriseFeatures() {
    // 网络监控
    this.networkMonitor.on('online', () => {
      logger.debug('[WebSocket] Network online, attempting reconnection');
      this.connect();
    });

    this.networkMonitor.on('offline', () => {
      logger.debug('[WebSocket] Network offline');
      this.handleDisconnect();
    });

    this.networkMonitor.on('qualityChange', (quality) => {
      this.metrics.networkQuality = quality;
      this.adjustConnectionStrategy(quality);
    });

    // 消息队列处理
    this.messageQueue.on('processMessage', (message, callback) => {
      this.sendMessage(message).then(callback).catch(callback);
    });
  }

  connect() {
    if (this.state === ConnectionState.CONNECTING || 
        this.state === ConnectionState.CONNECTED) {
      return Promise.resolve();
    }

    this.state = ConnectionState.CONNECTING;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      try {
        if (this.options.enableEnterpriseFeatures && this.connectionPool) {
          // 使用连接池
          this.ws = this.connectionPool.getConnection();
        } else {
          // 标准连接
          this.ws = new WebSocket(this.url);
        }

        this.setupEventHandlers();

        this.ws.onopen = () => {
          this.metrics.connectionTime = Date.now() - startTime;
          this.state = ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          
          this.sendAuth();
          this.startHeartbeat();
          
          this.emit('connected');
          resolve();
        };

        this.ws.onerror = (error) => {
          this.metrics.errors++;
          logger.error('[WebSocket] Connection error:', error);
          reject(error);
        };

      } catch (error) {
        this.state = ConnectionState.FAILED;
        reject(error);
      }
    });
  }

  setupEventHandlers() {
    this.ws.onmessage = (event) => {
      this.metrics.messagesReceived++;
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event) => {
      logger.debug('[WebSocket] Connection closed:', event.code, event.reason);
      this.handleDisconnect();
    };
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      // 处理心跳响应
      if (message.type === 'pong') {
        this.updateLatency(message.timestamp);
        return;
      }

      // 处理消息确认
      if (message.type === 'ack' && message.messageId) {
        this.handleMessageAck(message.messageId, message);
        return;
      }

      // 触发消息事件
      this.emit('message', message);
      
      // 发送已读确认
      if (message.type === 'message' && message.id) {
        this.sendAck(message.id);
      }
      
    } catch (error) {
      logger.error('[WebSocket] Failed to parse message:', error);
      this.metrics.errors++;
    }
  }

  sendAuth() {
    this.send({
      type: 'auth',
      userId: this.options.userId,
      userType: this.options.userType,
      timestamp: Date.now()
    });
  }

  send(data) {
    if (this.state !== ConnectionState.CONNECTED) {
      if (this.options.enableEnterpriseFeatures && this.messageQueue) {
        // 加入消息队列
        return this.messageQueue.enqueue(data);
      }
      return Promise.reject(new Error('WebSocket not connected'));
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
      this.metrics.messagesSent++;
      return Promise.resolve();
    } catch (error) {
      this.metrics.errors++;
      return Promise.reject(error);
    }
  }

  sendMessage(data) {
    const messageId = ++this.messageId;
    const message = {
      ...data,
      messageId,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(messageId);
        reject(new Error('Message timeout'));
      }, this.options.messageTimeout);

      this.messageCallbacks.set(messageId, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now()
      });

      this.send(message).catch(reject);
    });
  }

  handleMessageAck(messageId, ack) {
    const callback = this.messageCallbacks.get(messageId);
    if (callback) {
      clearTimeout(callback.timeout);
      const latency = Date.now() - callback.timestamp;
      this.metrics.latency.push(latency);
      
      if (this.metrics.latency.length > 100) {
        this.metrics.latency.shift();
      }
      
      callback.resolve(ack);
      this.messageCallbacks.delete(messageId);
    }
  }

  sendAck(messageId) {
    this.send({
      type: 'ack',
      messageId,
      timestamp: Date.now()
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.state === ConnectionState.CONNECTED) {
        this.send({
          type: 'ping',
          timestamp: Date.now()
        });
      }
    }, this.options.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  updateLatency(serverTimestamp) {
    const latency = Date.now() - serverTimestamp;
    this.metrics.latency.push(latency);
    
    if (this.metrics.latency.length > 100) {
      this.metrics.latency.shift();
    }
  }

  handleDisconnect() {
    this.state = ConnectionState.DISCONNECTED;
    this.stopHeartbeat();
    this.emit('disconnected');
    
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.state = ConnectionState.FAILED;
      this.emit('failed');
    }
  }

  scheduleReconnect() {
    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;
    this.metrics.reconnections++;
    
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );
    
    logger.debug(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.state === ConnectionState.RECONNECTING) {
        this.connect();
      }
    }, delay);
  }

  adjustConnectionStrategy(quality) {
    if (quality < 50) {
      // 低质量网络策略
      this.options.heartbeatInterval = 60000;
      this.options.messageTimeout = 20000;
    } else if (quality < 80) {
      // 中等质量网络策略
      this.options.heartbeatInterval = 45000;
      this.options.messageTimeout = 15000;
    } else {
      // 高质量网络策略
      this.options.heartbeatInterval = 30000;
      this.options.messageTimeout = 10000;
    }
  }

  getPerformanceMetrics() {
    const avgLatency = this.metrics.latency.length > 0
      ? this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length
      : 0;

    return {
      ...this.metrics,
      averageLatency: avgLatency,
      connectionState: this.state,
      queueSize: this.messageQueue ? this.messageQueue.getStats().size : 0
    };
  }

  close() {
    this.state = ConnectionState.DISCONNECTED;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
    }
    
    if (this.connectionPool) {
      this.connectionPool.closeAll();
    }
    
    if (this.networkMonitor) {
      this.networkMonitor.stop();
    }
    
    if (this.messageQueue) {
      this.messageQueue.clear();
    }
    
    this.messageCallbacks.clear();
    this.removeAllListeners();
  }
}

// 单例管理器
const clientInstances = new Map();

export function getWebSocketClient(url, options) {
  const key = `${url}_${options.userId}_${options.userType}`;
  
  if (!clientInstances.has(key)) {
    clientInstances.set(key, new EnterpriseWebSocketClient(url, options));
  }
  
  return clientInstances.get(key);
}

export { EnterpriseWebSocketClient, ConnectionState };