import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ErrorBoundary,
  PerformanceMonitor,
  VirtualizedMessageList,
  VirtualizedUserList,
  DebouncedInput,
  PerformancePanel
} from './components/OptimizedComponents';
import { getWebSocketClient } from './services/websocket-client';
import { messageQueue, MessagePriority } from './services/message-queue';
import { messageCache, userCache } from './services/cache-manager';
import { useMessageState, useUserState, useConnectionState } from './hooks/useOptimizedState';

/**
 * 企业级客服系统主组件
 * 整合所有高性能功能
 */
function EnhancedApp() {
  // 状态管理
  const messageState = useMessageState();
  const userState = useUserState();
  const connectionState = useConnectionState();
  
  // WebSocket客户端
  const [wsClient, setWsClient] = useState(null);
  const messageListRef = useRef(null);
  
  // 性能监控
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [showPerformancePanel, setShowPerformancePanel] = useState(false);
  
  // UI状态
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // 初始化WebSocket连接
  useEffect(() => {
    const initWebSocket = () => {
      const client = getWebSocketClient('ws://localhost:6006/ws', {
        userId: 'kf001',
        userType: 'kefu',
        enableEnterpriseFeatures: true,
        reconnectInterval: 1000,
        maxReconnectAttempts: 10
      });
      
      setWsClient(client);
      
      // 连接状态事件
      client.on('connected', (data) => {
        console.log('✅ 连接已建立:', data);
        connectionState.setConnected(true);
        
        // 从缓存加载历史消息
        loadCachedMessages();
        loadCachedUsers();
      });
      
      client.on('disconnected', (data) => {
        console.log('❌ 连接已断开:', data);
        connectionState.setConnected(false);
      });
      
      client.on('reconnecting', (data) => {
        console.log('🔄 正在重连:', data);
        connectionState.setConnecting(true);
        connectionState.incrementReconnectAttempts();
      });
      
      client.on('failover', (data) => {
        console.log('🔀 故障切换:', data);
      });
      
      client.on('qualityChanged', (quality) => {
        connectionState.updateNetworkQuality(quality);
      });
      
      // 消息事件
      client.on('message', handleWebSocketMessage);
      
      // 性能监控
      client.on('metricsUpdated', (metrics) => {
        setPerformanceMetrics(metrics);
      });
      
      return client;
    };
    
    const client = initWebSocket();
    
    return () => {
      if (client) {
        client.disconnect();
      }
    };
  }, []);
  
  // 设置消息队列处理器
  useEffect(() => {
    messageQueue.on('processMessage', (message, metadata, callback) => {
      if (wsClient && connectionState.isConnected) {
        try {
          wsClient.send(message);
          callback(null, { success: true });
        } catch (error) {
          callback(error);
        }
      } else {
        callback(new Error('WebSocket not connected'));
      }
    });
    
    return () => {
      messageQueue.removeAllListeners('processMessage');
    };
  }, [wsClient, connectionState.isConnected]);
  
  // 处理WebSocket消息
  const handleWebSocketMessage = useCallback((data) => {
    switch (data.type) {
      case 'chat_message':
        const message = {
          id: data.id || `msg_${Date.now()}`,
          from: data.from,
          to: data.to,
          content: data.content,
          timestamp: data.timestamp || Date.now(),
          type: 'text'
        };
        
        messageState.addMessage(message);
        
        // 缓存消息
        messageCache.set(`message_${message.id}`, message);
        
        // 自动滚动到底部
        if (messageListRef.current) {
          messageListRef.current.scrollToBottom();
        }
        break;
        
      case 'user_status':
        userState.updateUserStatus(data.userId, data.status);
        
        // 缓存用户状态
        userCache.set(`user_status_${data.userId}`, data.status);
        break;
        
      case 'user_list':
        if (data.users && Array.isArray(data.users)) {
          data.users.forEach(user => {
            userState.addUser(user);
            userCache.set(`user_${user.id}`, user);
          });
        }
        break;
        
      case 'pong':
        // 心跳响应，更新延迟
        if (data.timestamp) {
          const latency = Date.now() - data.timestamp;
          connectionState.updateNetworkQuality(
            latency < 100 ? 'excellent' : 
            latency < 300 ? 'good' : 
            latency < 1000 ? 'fair' : 'poor',
            latency
          );
        }
        break;
        
      default:
        console.log('收到未知消息类型:', data.type);
    }
  }, [messageState, userState, connectionState]);
  
  // 加载缓存的消息
  const loadCachedMessages = useCallback(() => {
    const cachedKeys = messageCache.keys();
    const messages = cachedKeys
      .filter(key => key.startsWith('message_'))
      .map(key => messageCache.get(key))
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (messages.length > 0) {
      messageState.addMessages(messages);
    }
  }, [messageState]);
  
  // 加载缓存的用户
  const loadCachedUsers = useCallback(() => {
    const cachedKeys = userCache.keys();
    const users = cachedKeys
      .filter(key => key.startsWith('user_'))
      .map(key => userCache.get(key))
      .filter(Boolean);
    
    users.forEach(user => {
      userState.addUser(user);
    });
  }, [userState]);
  
  // 发送消息
  const sendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isSending || !userState.selectedUserId) {
      return;
    }
    
    setIsSending(true);
    
    try {
      const message = {
        type: 'chat_message',
        from: userState.currentUserId,
        to: userState.selectedUserId,
        content: inputMessage.trim(),
        timestamp: Date.now()
      };
      
      // 高优先级消息直接发送
      if (connectionState.isConnected) {
        const messageId = wsClient.send(message);
        if (messageId) {
          // 立即显示在界面上
          messageState.addMessage({
            ...message,
            id: messageId,
            from: userState.currentUserId
          });
          
          setInputMessage('');
        }
      } else {
        // 连接断开时加入优先队列
        messageQueue.enqueue(message, MessagePriority.HIGH);
        
        // 显示为待发送状态
        messageState.addMessage({
          ...message,
          id: `pending_${Date.now()}`,
          from: userState.currentUserId,
          status: 'pending'
        });
        
        setInputMessage('');
      }
      
    } catch (error) {
      console.error('发送消息失败:', error);
    } finally {
      setIsSending(false);
    }
  }, [inputMessage, isSending, userState, connectionState, wsClient, messageState]);
  
  // 处理用户选择
  const handleUserSelect = useCallback((user) => {
    userState.selectUser(user.id);
    
    // 加载该用户的历史消息
    const userMessages = messageCache.keys()
      .filter(key => key.startsWith('message_'))
      .map(key => messageCache.get(key))
      .filter(msg => msg.from === user.id || msg.to === user.id)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    messageState.clearMessages();
    messageState.addMessages(userMessages);
  }, [userState, messageState]);
  
  // 处理输入框回车
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);
  
  // 连接状态指示器
  const ConnectionStatus = useMemo(() => {
    const getStatusColor = () => {
      if (connectionState.isConnecting) return '#ffa500';
      if (connectionState.isConnected) {
        switch (connectionState.connectionQuality) {
          case 'excellent': return '#4caf50';
          case 'good': return '#8bc34a';
          case 'fair': return '#ff9800';
          case 'poor': return '#f44336';
          default: return '#9e9e9e';
        }
      }
      return '#f44336';
    };
    
    const getStatusText = () => {
      if (connectionState.isConnecting) return '连接中...';
      if (connectionState.isConnected) {
        return `已连接 (${connectionState.connectionQuality}) ${connectionState.latency}ms`;
      }
      return `已断开 (重试: ${connectionState.reconnectAttempts})`;
    };
    
    return (
      <div style={{
        padding: '8px 12px',
        backgroundColor: getStatusColor(),
        color: 'white',
        fontSize: '12px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center'
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: 'white',
          marginRight: '8px',
          animation: connectionState.isConnecting ? 'pulse 1s infinite' : 'none'
        }} />
        {getStatusText()}
      </div>
    );
  }, [connectionState]);
  
  // 模拟数据（仅用于演示）
  useEffect(() => {
    // 模拟用户数据
    const mockUsers = [
      { id: 'customer_001', name: '张三', status: 'online', unreadCount: 3 },
      { id: 'customer_002', name: '李四', status: 'online', unreadCount: 0 },
      { id: 'customer_003', name: '王五', status: 'offline', unreadCount: 1 },
      { id: 'customer_004', name: '赵六', status: 'online', unreadCount: 0 },
      { id: 'customer_005', name: '刘七', status: 'offline', unreadCount: 2 }
    ];
    
    mockUsers.forEach(user => userState.addUser(user));
    userState.setCurrentUser('kf001');
    
    // 模拟消息数据
    const mockMessages = [
      {
        id: 'msg_001',
        from: 'customer_001',
        to: 'kf001',
        content: '你好，我需要帮助',
        timestamp: Date.now() - 300000
      },
      {
        id: 'msg_002',
        from: 'kf001',
        to: 'customer_001',
        content: '您好！我是客服小王，请问有什么可以帮助您的？',
        timestamp: Date.now() - 290000
      },
      {
        id: 'msg_003',
        from: 'customer_001',
        to: 'kf001',
        content: '我的订单出现了问题',
        timestamp: Date.now() - 280000
      }
    ];
    
    mockMessages.forEach(msg => {
      messageState.addMessage(msg);
      messageCache.set(`message_${msg.id}`, msg);
    });
  }, []);
  
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('应用程序错误:', error, errorInfo);
      }}
    >
      <PerformanceMonitor
        name="EnhancedApp"
        onMetrics={(metrics) => {
          setPerformanceMetrics(prev => ({ ...prev, app: metrics }));
        }}
      >
        <div style={{
          height: '100vh',
          display: 'flex',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif'
        }}>
          {/* 性能监控面板 */}
          <PerformancePanel metrics={performanceMetrics} />
          
          {/* 用户列表 */}
          <div style={{
            width: '300px',
            borderRight: '1px solid #e0e0e0',
            backgroundColor: '#f8f9fa',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* 头部 */}
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #e0e0e0',
              backgroundColor: 'white'
            }}>
              <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#333' }}>
                客服中心
              </h2>
              {ConnectionStatus}
              <div style={{ marginTop: '12px' }}>
                <DebouncedInput
                  placeholder="搜索用户..."
                  onChange={userState.searchUsers}
                  style={{ fontSize: '14px' }}
                />
              </div>
            </div>
            
            {/* 用户列表 */}
            <div style={{ flex: 1 }}>
              <VirtualizedUserList
                users={userState.filteredUsers}
                selectedUserId={userState.selectedUserId}
                onUserSelect={handleUserSelect}
                containerHeight={window.innerHeight - 200}
                itemHeight={64}
              />
            </div>
          </div>
          
          {/* 聊天区域 */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'white'
          }}>
            {/* 聊天头部 */}
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #e0e0e0',
              backgroundColor: '#f8f9fa'
            }}>
              {userState.selectedUserId ? (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#0084ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    marginRight: '12px'
                  }}>
                    {userState.filteredUsers.find(u => u.id === userState.selectedUserId)?.name?.[0] || 'U'}
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#333' }}>
                      {userState.filteredUsers.find(u => u.id === userState.selectedUserId)?.name || '未知用户'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {userState.filteredUsers.find(u => u.id === userState.selectedUserId)?.status === 'online' ? '在线' : '离线'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#999', fontSize: '14px' }}>
                  请选择一个用户开始聊天
                </div>
              )}
            </div>
            
            {/* 消息列表 */}
            <div style={{ flex: 1 }}>
              {userState.selectedUserId ? (
                <VirtualizedMessageList
                  ref={messageListRef}
                  messages={messageState.filteredMessages}
                  currentUserId={userState.currentUserId}
                  containerHeight={window.innerHeight - 200}
                  itemHeight={80}
                />
              ) : (
                <div style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#999',
                  fontSize: '16px'
                }}>
                  选择一个用户开始聊天
                </div>
              )}
            </div>
            
            {/* 输入区域 */}
            {userState.selectedUserId && (
              <div style={{
                padding: '16px',
                borderTop: '1px solid #e0e0e0',
                backgroundColor: '#f8f9fa'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="输入消息... (按Enter发送，Shift+Enter换行)"
                    style={{
                      flex: 1,
                      minHeight: '40px',
                      maxHeight: '120px',
                      padding: '8px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '20px',
                      resize: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      fontSize: '14px',
                      lineHeight: '1.4'
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isSending || !connectionState.isConnected}
                    style={{
                      marginLeft: '8px',
                      padding: '8px 16px',
                      backgroundColor: connectionState.isConnected ? '#0084ff' : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '20px',
                      cursor: connectionState.isConnected ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: '500',
                      minWidth: '60px'
                    }}
                  >
                    {isSending ? '发送中...' : '发送'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* CSS动画 */}
        <style>
          {`
            @keyframes pulse {
              0% { opacity: 1; }
              50% { opacity: 0.5; }
              100% { opacity: 1; }
            }
          `}
        </style>
      </PerformanceMonitor>
    </ErrorBoundary>
  );
}

export default EnhancedApp;