import EventEmitter from 'eventemitter3';

/**
 * 企业级连接池管理器
 * 支持主备连接、自动故障转移、负载均衡
 */
export class ConnectionPool extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.connections = new Map();
    this.primaryConnection = null;
    this.backupConnections = [];
    this.maxConnections = 3;
    this.currentIndex = 0;
    this.healthCheckInterval = null;
    
    // 启动健康检查
    this.startHealthCheck();
  }

  /**
   * 获取可用连接
   */
  getConnection() {
    // 优先使用主连接
    if (this.primaryConnection && this.primaryConnection.readyState === WebSocket.OPEN) {
      return this.primaryConnection;
    }

    // 查找健康的备用连接
    for (const connection of this.backupConnections) {
      if (connection.readyState === WebSocket.OPEN) {
        this.promoteToMainConnection(connection);
        return connection;
      }
    }

    // 创建新连接
    return this.createConnection();
  }

  /**
   * 创建新连接
   */
  createConnection(isBackup = false) {
    const connection = new WebSocket(this.client.url);
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const connectionInfo = {
      id: connectionId,
      connection,
      isBackup,
      isPrimary: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        latency: [],
        avgLatency: 0
      }
    };

    this.connections.set(connectionId, connectionInfo);
    this.setupConnectionHandlers(connection, connectionInfo);

    if (!isBackup && !this.primaryConnection) {
      this.primaryConnection = connection;
      connectionInfo.isPrimary = true;
    } else if (isBackup) {
      this.backupConnections.push(connection);
    }

    // 维护连接池大小
    this.maintainPoolSize();

    return connection;
  }

  /**
   * 设置连接事件处理器
   */
  setupConnectionHandlers(connection, connectionInfo) {
    connection.onopen = () => {
      console.log(`[ConnectionPool] Connection ${connectionInfo.id} opened`);
      this.emit('connectionOpen', connectionInfo);
      
      // 备用连接需要认证
      if (connectionInfo.isBackup) {
        this.authenticateConnection(connection);
      }
    };

    connection.onmessage = (event) => {
      connectionInfo.lastActivity = Date.now();
      connectionInfo.metrics.messagesReceived++;
      
      // 只有主连接的消息才传递给客户端
      if (connection === this.primaryConnection) {
        this.client.handleMessage(event.data);
      }
    };

    connection.onerror = (error) => {
      connectionInfo.metrics.errors++;
      console.error(`[ConnectionPool] Connection ${connectionInfo.id} error:`, error);
      this.emit('connectionError', { connectionInfo, error });
    };

    connection.onclose = (event) => {
      console.log(`[ConnectionPool] Connection ${connectionInfo.id} closed`);
      this.handleConnectionClose(connectionInfo);
    };
  }

  /**
   * 认证连接
   */
  authenticateConnection(connection) {
    if (connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({
        type: 'auth',
        userId: this.client.options.userId,
        userType: this.client.options.userType,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 处理连接关闭
   */
  handleConnectionClose(connectionInfo) {
    this.connections.delete(connectionInfo.id);

    if (connectionInfo.connection === this.primaryConnection) {
      console.log('[ConnectionPool] Primary connection lost, switching to backup');
      this.primaryConnection = null;
      this.switchToBackup();
    } else {
      const index = this.backupConnections.indexOf(connectionInfo.connection);
      if (index > -1) {
        this.backupConnections.splice(index, 1);
      }
    }

    // 补充连接
    this.maintainPoolSize();
  }

  /**
   * 切换到备用连接
   */
  switchToBackup() {
    const healthyBackup = this.backupConnections.find(
      conn => conn.readyState === WebSocket.OPEN
    );

    if (healthyBackup) {
      this.promoteToMainConnection(healthyBackup);
      this.emit('failover', { from: 'primary', to: 'backup' });
    } else {
      console.log('[ConnectionPool] No healthy backup found, creating new primary');
      this.createConnection(false);
    }
  }

  /**
   * 提升备用连接为主连接
   */
  promoteToMainConnection(connection) {
    const index = this.backupConnections.indexOf(connection);
    if (index > -1) {
      this.backupConnections.splice(index, 1);
    }

    this.primaryConnection = connection;
    
    // 更新连接信息
    for (const [id, info] of this.connections) {
      if (info.connection === connection) {
        info.isPrimary = true;
        info.isBackup = false;
        break;
      }
    }

    console.log('[ConnectionPool] Promoted backup connection to primary');
  }

  /**
   * 维护连接池大小
   */
  maintainPoolSize() {
    const totalConnections = (this.primaryConnection ? 1 : 0) + this.backupConnections.length;
    
    if (totalConnections < this.maxConnections) {
      const connectionsNeeded = this.maxConnections - totalConnections;
      
      for (let i = 0; i < connectionsNeeded; i++) {
        setTimeout(() => {
          if (!this.primaryConnection) {
            this.createConnection(false);
          } else {
            this.createConnection(true);
          }
        }, i * 1000); // 错开连接时间，避免同时创建
      }
    }
  }

  /**
   * 负载均衡发送
   */
  sendBalanced(data) {
    const connections = [this.primaryConnection, ...this.backupConnections].filter(
      conn => conn && conn.readyState === WebSocket.OPEN
    );

    if (connections.length === 0) {
      throw new Error('No available connections');
    }

    // 轮询策略
    const connection = connections[this.currentIndex % connections.length];
    this.currentIndex++;

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    connection.send(message);

    // 更新连接指标
    for (const [id, info] of this.connections) {
      if (info.connection === connection) {
        info.metrics.messagesSent++;
        info.lastActivity = Date.now();
        break;
      }
    }
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 10000); // 每10秒检查一次
  }

  /**
   * 执行健康检查
   */
  performHealthCheck() {
    const results = [];

    for (const [id, info] of this.connections) {
      const isHealthy = 
        info.connection.readyState === WebSocket.OPEN &&
        info.metrics.errors < 10 &&
        (Date.now() - info.lastActivity) < 60000; // 1分钟内有活动

      results.push({
        id,
        healthy: isHealthy,
        state: this.getConnectionState(info.connection),
        lastActivity: Date.now() - info.lastActivity,
        errors: info.metrics.errors
      });

      // 关闭不健康的连接
      if (!isHealthy && info.connection.readyState === WebSocket.OPEN) {
        console.log(`[ConnectionPool] Closing unhealthy connection ${id}`);
        info.connection.close();
      }
    }

    this.emit('healthCheck', results);
    return results;
  }

  /**
   * 获取连接状态
   */
  getConnectionState(connection) {
    if (!connection) return 'CLOSED';
    
    switch (connection.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * 获取连接池状态
   */
  getPoolStatus() {
    const status = {
      totalConnections: this.connections.size,
      primaryConnection: null,
      backupConnections: [],
      metrics: {
        totalMessagesSent: 0,
        totalMessagesReceived: 0,
        totalErrors: 0,
        averageLatency: 0
      }
    };

    let totalLatency = 0;
    let latencyCount = 0;

    for (const [id, info] of this.connections) {
      const connStatus = {
        id,
        state: this.getConnectionState(info.connection),
        isPrimary: info.isPrimary,
        isBackup: info.isBackup,
        uptime: Date.now() - info.createdAt,
        lastActivity: Date.now() - info.lastActivity,
        metrics: info.metrics
      };

      if (info.isPrimary) {
        status.primaryConnection = connStatus;
      } else if (info.isBackup) {
        status.backupConnections.push(connStatus);
      }

      // 汇总指标
      status.metrics.totalMessagesSent += info.metrics.messagesSent;
      status.metrics.totalMessagesReceived += info.metrics.messagesReceived;
      status.metrics.totalErrors += info.metrics.errors;
      
      if (info.metrics.latency.length > 0) {
        totalLatency += info.metrics.latency.reduce((a, b) => a + b, 0);
        latencyCount += info.metrics.latency.length;
      }
    }

    status.metrics.averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    return status;
  }

  /**
   * 关闭所有连接
   */
  closeAll() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const [id, info] of this.connections) {
      if (info.connection.readyState === WebSocket.OPEN) {
        info.connection.close();
      }
    }
    
    this.connections.clear();
    this.primaryConnection = null;
    this.backupConnections = [];
    this.removeAllListeners();
  }
}