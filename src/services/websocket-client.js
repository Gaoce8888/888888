import EventEmitter from 'eventemitter3';

/**
 * 企业级WebSocket客户端管理器
 * 功能：连接池管理、自动重连、故障切换、性能监控
 */
class EnterpriseWebSocketClient extends EventEmitter {
  constructor(url, options = {}) {
    super();
    
    this.url = url;
    this.options = {
      enableEnterpriseFeatures: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      messageTimeout: 10000,
      priority: 'high',
      quality: 'high_performance',
      ...options
    };
    
    // 连接状态
    this.state = {
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
      connectionQuality: 'unknown',
      lastHeartbeat: null,
      startTime: Date.now()
    };
    
    // 连接池
    this.connections = {
      primary: null,
      backup: null,
      active: null
    };
    
    // 性能监控
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      latency: 0,
      errors: 0,
      reconnects: 0,
      uptime: 0
    };
    
    // 消息队列
    this.messageQueue = [];
    this.pendingMessages = new Map();
    
    // 定时器
    this.timers = {
      heartbeat: null,
      reconnect: null,
      metricsUpdate: null
    };
    
    this.init();
  }
  
  init() {
    if (this.options.enableEnterpriseFeatures) {
      this.setupConnectionPool();
      this.startMetricsMonitoring();
    } else {
      this.connect();
    }
  }
  
  setupConnectionPool() {
    // 创建主连接
    this.createConnection('primary');
    
    // 延迟创建备用连接
    setTimeout(() => {
      this.createConnection('backup');
    }, 5000);
  }
  
  createConnection(type) {
    try {
      const ws = new WebSocket(this.url);
      this.connections[type] = ws;
      
      ws.onopen = () => this.handleConnectionOpen(type);
      ws.onmessage = (event) => this.handleMessage(event, type);
      ws.onclose = (event) => this.handleConnectionClose(event, type);
      ws.onerror = (error) => this.handleConnectionError(error, type);
      
      if (type === 'primary') {
        this.connections.active = ws;
        this.state.isConnecting = true;
      }
      
    } catch (error) {
      console.error(`创建${type}连接失败:`, error);
      this.handleConnectionError(error, type);
    }
  }
  
  handleConnectionOpen(type) {
    console.log(`${type}连接已建立`);
    
    if (type === 'primary' || !this.state.isConnected) {
      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.state.reconnectAttempts = 0;
      this.connections.active = this.connections[type];
      
      // 发送认证信息
      this.authenticate();
      
      // 启动心跳
      this.startHeartbeat();
      
      // 处理积压消息
      this.processMessageQueue();
      
      this.emit('connected', { type, quality: this.state.connectionQuality });
    }
  }
  
  handleMessage(event, type) {
    try {
      const data = JSON.parse(event.data);
      this.metrics.messagesReceived++;
      
      // 更新延迟统计
      if (data.timestamp) {
        this.metrics.latency = Date.now() - data.timestamp;
      }
      
      // 处理心跳响应
      if (data.type === 'pong') {
        this.state.lastHeartbeat = Date.now();
        this.updateConnectionQuality();
        return;
      }
      
      // 处理消息确认
      if (data.type === 'ack' && data.messageId) {
        this.handleMessageAck(data.messageId);
        return;
      }
      
      this.emit('message', data);
      
    } catch (error) {
      console.error('消息解析失败:', error);
      this.metrics.errors++;
    }
  }
  
  handleConnectionClose(event, type) {
    console.log(`${type}连接已关闭:`, event.code, event.reason);
    
    if (type === 'primary' && this.state.isConnected) {
      this.state.isConnected = false;
      
      // 切换到备用连接
      if (this.connections.backup && this.connections.backup.readyState === WebSocket.OPEN) {
        console.log('切换到备用连接');
        this.connections.active = this.connections.backup;
        this.state.isConnected = true;
        this.emit('failover', { from: 'primary', to: 'backup' });
      } else {
        this.attemptReconnect();
      }
    }
    
    this.clearTimers();
    this.emit('disconnected', { type, code: event.code, reason: event.reason });
  }
  
  handleConnectionError(error, type) {
    console.error(`${type}连接错误:`, error);
    this.metrics.errors++;
    
    if (type === 'primary' && this.state.isConnected) {
      // 尝试故障切换
      this.attemptFailover();
    }
    
    this.emit('error', { error, type });
  }
  
  attemptFailover() {
    if (this.connections.backup && this.connections.backup.readyState === WebSocket.OPEN) {
      console.log('执行故障切换');
      this.connections.active = this.connections.backup;
      this.emit('failover', { from: 'primary', to: 'backup' });
      
      // 重建主连接
      setTimeout(() => {
        this.createConnection('primary');
      }, 2000);
    } else {
      this.attemptReconnect();
    }
  }
  
  attemptReconnect() {
    if (this.state.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('重连次数已达上限');
      this.emit('reconnectFailed');
      return;
    }
    
    this.state.reconnectAttempts++;
    this.metrics.reconnects++;
    
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.state.reconnectAttempts - 1),
      30000
    );
    
    console.log(`${delay}ms后尝试第${this.state.reconnectAttempts}次重连`);
    
    this.timers.reconnect = setTimeout(() => {
      this.createConnection('primary');
    }, delay);
    
    this.emit('reconnecting', { 
      attempt: this.state.reconnectAttempts, 
      delay 
    });
  }
  
  authenticate() {
    const authData = {
      type: 'auth',
      userId: this.options.userId,
      userType: this.options.userType,
      timestamp: Date.now()
    };
    
    this.send(authData);
  }
  
  startHeartbeat() {
    this.clearTimer('heartbeat');
    
    this.timers.heartbeat = setInterval(() => {
      if (this.state.isConnected) {
        this.send({ type: 'ping', timestamp: Date.now() });
        
        // 检查心跳超时
        if (this.state.lastHeartbeat && 
            Date.now() - this.state.lastHeartbeat > this.options.heartbeatInterval * 2) {
          console.warn('心跳超时，尝试重连');
          this.attemptReconnect();
        }
      }
    }, this.options.heartbeatInterval);
  }
  
  send(data) {
    const message = {
      ...data,
      id: this.generateMessageId(),
      timestamp: Date.now()
    };
    
    if (this.state.isConnected && this.connections.active) {
      try {
        this.connections.active.send(JSON.stringify(message));
        this.metrics.messagesSent++;
        
        // 添加到待确认队列
        if (message.requiresAck !== false) {
          this.pendingMessages.set(message.id, {
            message,
            timestamp: Date.now(),
            retries: 0
          });
          
          // 设置超时
          setTimeout(() => {
            this.handleMessageTimeout(message.id);
          }, this.options.messageTimeout);
        }
        
        return message.id;
      } catch (error) {
        console.error('发送消息失败:', error);
        this.queueMessage(message);
        return null;
      }
    } else {
      this.queueMessage(message);
      return null;
    }
  }
  
  queueMessage(message) {
    this.messageQueue.push(message);
    this.emit('messageQueued', message);
  }
  
  processMessageQueue() {
    while (this.messageQueue.length > 0 && this.state.isConnected) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }
  
  handleMessageAck(messageId) {
    if (this.pendingMessages.has(messageId)) {
      this.pendingMessages.delete(messageId);
      this.emit('messageDelivered', messageId);
    }
  }
  
  handleMessageTimeout(messageId) {
    if (this.pendingMessages.has(messageId)) {
      const pending = this.pendingMessages.get(messageId);
      pending.retries++;
      
      if (pending.retries < 3) {
        // 重试发送
        this.send(pending.message);
      } else {
        // 发送失败
        this.pendingMessages.delete(messageId);
        this.emit('messageFailed', messageId);
      }
    }
  }
  
  updateConnectionQuality() {
    const latency = this.metrics.latency;
    
    if (latency < 100) {
      this.state.connectionQuality = 'excellent';
    } else if (latency < 300) {
      this.state.connectionQuality = 'good';
    } else if (latency < 1000) {
      this.state.connectionQuality = 'fair';
    } else {
      this.state.connectionQuality = 'poor';
    }
    
    this.emit('qualityChanged', this.state.connectionQuality);
  }
  
  startMetricsMonitoring() {
    this.timers.metricsUpdate = setInterval(() => {
      this.metrics.uptime = Date.now() - this.state.startTime;
      this.emit('metricsUpdated', this.getMetrics());
    }, 5000);
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      connectionState: this.state,
      queueSize: this.messageQueue.length,
      pendingMessages: this.pendingMessages.size
    };
  }
  
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  clearTimer(name) {
    if (this.timers[name]) {
      clearInterval(this.timers[name]);
      this.timers[name] = null;
    }
  }
  
  clearTimers() {
    Object.keys(this.timers).forEach(name => this.clearTimer(name));
  }
  
  disconnect() {
    this.clearTimers();
    
    Object.values(this.connections).forEach(ws => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    
    this.state.isConnected = false;
    this.emit('disconnected', { type: 'manual' });
  }
  
  // 兼容性方法
  connect() {
    if (!this.options.enableEnterpriseFeatures) {
      this.createConnection('primary');
    }
  }
}

// 单例模式
let wsClientInstance = null;

export function getWebSocketClient(url, options) {
  if (!wsClientInstance) {
    wsClientInstance = new EnterpriseWebSocketClient(url, options);
  }
  return wsClientInstance;
}

export { EnterpriseWebSocketClient };
export default EnterpriseWebSocketClient;