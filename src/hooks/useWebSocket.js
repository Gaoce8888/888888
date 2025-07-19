import { useEffect, useRef, useCallback, useState } from 'react';
import { getWebSocketClient } from '../services/websocket-client';

/**
 * WebSocket Hook
 * 封装WebSocket连接管理和消息处理
 */
export const useWebSocket = (url, options = {}) => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [metrics, setMetrics] = useState({});
  const wsClientRef = useRef(null);
  const handlersRef = useRef({});
  
  // 更新处理器
  useEffect(() => {
    handlersRef.current = {
      onMessage: options.onMessage,
      onStatusChange: options.onStatusChange,
      onError: options.onError,
      onMetricsUpdate: options.onMetricsUpdate
    };
  }, [options.onMessage, options.onStatusChange, options.onError, options.onMetricsUpdate]);
  
  // 初始化WebSocket客户端
  useEffect(() => {
    if (!url) return;
    
    // 创建或获取WebSocket客户端
    const client = getWebSocketClient(url, {
      ...options,
      userId: options.userId,
      userType: options.userType,
      enableEnterpriseFeatures: options.enableEnterpriseFeatures !== false
    });
    
    wsClientRef.current = client;
    
    // 设置事件监听器
    const handleMessage = (message) => {
      if (handlersRef.current.onMessage) {
        handlersRef.current.onMessage(message);
      }
    };
    
    const handleConnected = () => {
      setConnectionState('connected');
      if (handlersRef.current.onStatusChange) {
        handlersRef.current.onStatusChange('connected');
      }
    };
    
    const handleDisconnected = () => {
      setConnectionState('disconnected');
      if (handlersRef.current.onStatusChange) {
        handlersRef.current.onStatusChange('disconnected');
      }
    };
    
    const handleReconnecting = () => {
      setConnectionState('reconnecting');
      if (handlersRef.current.onStatusChange) {
        handlersRef.current.onStatusChange('reconnecting');
      }
    };
    
    const handleError = (error) => {
      if (handlersRef.current.onError) {
        handlersRef.current.onError(error);
      }
    };
    
    const handleQualityChange = (quality) => {
      if (handlersRef.current.onMetricsUpdate) {
        handlersRef.current.onMetricsUpdate({ networkQuality: quality });
      }
    };
    
    // 添加事件监听器
    client.on('message', handleMessage);
    client.on('connected', handleConnected);
    client.on('disconnected', handleDisconnected);
    client.on('reconnecting', handleReconnecting);
    client.on('error', handleError);
    
    if (client.networkMonitor) {
      client.networkMonitor.on('qualityChange', handleQualityChange);
    }
    
    // 定期更新性能指标
    const metricsInterval = setInterval(() => {
      const metrics = client.getPerformanceMetrics();
      setMetrics(metrics);
      
      if (handlersRef.current.onMetricsUpdate) {
        handlersRef.current.onMetricsUpdate(metrics);
      }
    }, 5000);
    
    return () => {
      // 清理事件监听器
      client.off('message', handleMessage);
      client.off('connected', handleConnected);
      client.off('disconnected', handleDisconnected);
      client.off('reconnecting', handleReconnecting);
      client.off('error', handleError);
      
      if (client.networkMonitor) {
        client.networkMonitor.off('qualityChange', handleQualityChange);
      }
      
      clearInterval(metricsInterval);
      
      // 不要关闭连接，因为可能被其他组件使用
    };
  }, [url, options.userId, options.userType, options.enableEnterpriseFeatures]);
  
  // 发送消息
  const send = useCallback((data) => {
    if (!wsClientRef.current) {
      console.error('WebSocket client not initialized');
      return Promise.reject(new Error('WebSocket client not initialized'));
    }
    
    return wsClientRef.current.send(data);
  }, []);
  
  // 发送带确认的消息
  const sendMessage = useCallback((data) => {
    if (!wsClientRef.current) {
      console.error('WebSocket client not initialized');
      return Promise.reject(new Error('WebSocket client not initialized'));
    }
    
    return wsClientRef.current.sendMessage(data);
  }, []);
  
  // 手动重连
  const reconnect = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.connect();
    }
  }, []);
  
  // 关闭连接
  const close = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.close();
    }
  }, []);
  
  // 获取连接池状态
  const getPoolStatus = useCallback(() => {
    if (wsClientRef.current && wsClientRef.current.connectionPool) {
      return wsClientRef.current.connectionPool.getPoolStatus();
    }
    return null;
  }, []);
  
  // 获取网络状态
  const getNetworkStatus = useCallback(() => {
    if (wsClientRef.current && wsClientRef.current.networkMonitor) {
      return wsClientRef.current.networkMonitor.getNetworkStatus();
    }
    return null;
  }, []);
  
  // 获取消息队列状态
  const getQueueStatus = useCallback(() => {
    if (wsClientRef.current && wsClientRef.current.messageQueue) {
      return wsClientRef.current.messageQueue.getStats();
    }
    return null;
  }, []);
  
  return {
    // 连接状态
    connectionState,
    isConnected: connectionState === 'connected',
    isReconnecting: connectionState === 'reconnecting',
    
    // 性能指标
    metrics,
    
    // 方法
    send,
    sendMessage,
    reconnect,
    close,
    
    // 状态查询
    getPoolStatus,
    getNetworkStatus,
    getQueueStatus,
    
    // 原始客户端（高级用法）
    client: wsClientRef.current
  };
};

/**
 * WebSocket消息订阅Hook
 */
export const useWebSocketSubscription = (wsClient, messageType, handler) => {
  const handlerRef = useRef(handler);
  
  // 更新handler引用
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  
  useEffect(() => {
    if (!wsClient) return;
    
    const handleMessage = (message) => {
      if (message.type === messageType && handlerRef.current) {
        handlerRef.current(message);
      }
    };
    
    wsClient.on('message', handleMessage);
    
    return () => {
      wsClient.off('message', handleMessage);
    };
  }, [wsClient, messageType]);
};

/**
 * WebSocket心跳Hook
 */
export const useWebSocketHeartbeat = (wsClient, interval = 30000) => {
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const [isAlive, setIsAlive] = useState(true);
  
  useEffect(() => {
    if (!wsClient || !wsClient.isConnected) return;
    
    const heartbeatInterval = setInterval(() => {
      wsClient.send({ type: 'ping', timestamp: Date.now() })
        .then(() => {
          setLastHeartbeat(Date.now());
          setIsAlive(true);
        })
        .catch(() => {
          setIsAlive(false);
        });
    }, interval);
    
    return () => clearInterval(heartbeatInterval);
  }, [wsClient, interval]);
  
  return { lastHeartbeat, isAlive };
};

/**
 * WebSocket重连Hook
 */
export const useWebSocketReconnect = (wsClient, options = {}) => {
  const {
    maxAttempts = 5,
    delay = 1000,
    backoff = 2,
    onReconnectAttempt,
    onReconnectSuccess,
    onReconnectFailure
  } = options;
  
  const [attempts, setAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const timeoutRef = useRef(null);
  
  useEffect(() => {
    if (!wsClient) return;
    
    const handleDisconnect = () => {
      if (attempts < maxAttempts) {
        setIsReconnecting(true);
        const currentDelay = delay * Math.pow(backoff, attempts);
        
        if (onReconnectAttempt) {
          onReconnectAttempt(attempts + 1, currentDelay);
        }
        
        timeoutRef.current = setTimeout(() => {
          wsClient.connect()
            .then(() => {
              setAttempts(0);
              setIsReconnecting(false);
              if (onReconnectSuccess) {
                onReconnectSuccess();
              }
            })
            .catch(() => {
              setAttempts(prev => prev + 1);
            });
        }, currentDelay);
      } else {
        setIsReconnecting(false);
        if (onReconnectFailure) {
          onReconnectFailure();
        }
      }
    };
    
    wsClient.on('disconnected', handleDisconnect);
    
    return () => {
      wsClient.off('disconnected', handleDisconnect);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [wsClient, attempts, maxAttempts, delay, backoff, onReconnectAttempt, onReconnectSuccess, onReconnectFailure]);
  
  const resetReconnect = useCallback(() => {
    setAttempts(0);
    setIsReconnecting(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);
  
  return {
    attempts,
    isReconnecting,
    resetReconnect
  };
};