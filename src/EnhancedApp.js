import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getWebSocketClient } from './services/websocket-client';
import { MessageCache } from './services/message-cache';
import { 
  OptimizedMessage, 
  OptimizedUserItem, 
  VirtualizedMessageList,
  OptimizedInput 
} from './components/OptimizedComponents';
import { PerformanceMonitor, PerformanceReport } from './components/PerformanceMonitor';
import { ErrorBoundary, AsyncErrorBoundary } from './components/ErrorBoundary';
import { useOptimizedState, useBatchedState } from './hooks/useOptimizedState';
import { useWebSocket } from './hooks/useWebSocket';
import { usePerformanceTracking } from './hooks/usePerformanceTracking';
import './App.css';

/**
 * 企业级增强型客服应用
 * 集成所有性能优化和企业级功能
 */
const EnhancedApp = () => {
  // 使用优化的状态管理
  const [state, dispatch] = useOptimizedState({
    currentUser: {
      id: 'kf001',
      name: '客服小王',
      type: 'kefu',
      avatar: '/avatars/kefu.png'
    },
    selectedUser: null,
    users: [],
    messages: {},
    unreadCounts: {},
    isLoading: true,
    connectionStatus: 'connecting',
    networkQuality: 100
  });

  // 消息缓存
  const messageCache = useMemo(() => new MessageCache({
    maxSize: 5000,
    ttl: 10 * 60 * 1000, // 10分钟
    compressionEnabled: true
  }), []);

  // WebSocket连接
  const wsClient = useWebSocket('ws://localhost:6006/ws', {
    userId: state.currentUser.id,
    userType: state.currentUser.type,
    enableEnterpriseFeatures: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
    onMessage: handleWebSocketMessage,
    onStatusChange: handleConnectionStatusChange
  });

  // 性能追踪
  const { trackAction, getMetrics } = usePerformanceTracking('EnhancedApp');

  // 处理WebSocket消息
  const handleWebSocketMessage = useCallback(async (message) => {
    trackAction('message_received');
    
    switch (message.type) {
      case 'userList':
        dispatch({
          type: 'SET_USERS',
          payload: message.users
        });
        break;
        
      case 'message':
        // 缓存消息
        await messageCache.set(`msg_${message.id}`, message);
        
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            userId: message.from === state.currentUser.id ? message.to : message.from,
            message
          }
        });
        
        // 更新未读计数
        if (message.from !== state.currentUser.id && message.from !== state.selectedUser?.id) {
          dispatch({
            type: 'INCREMENT_UNREAD',
            payload: message.from
          });
        }
        break;
        
      case 'userStatus':
        dispatch({
          type: 'UPDATE_USER_STATUS',
          payload: {
            userId: message.userId,
            online: message.online
          }
        });
        break;
        
      case 'typing':
        dispatch({
          type: 'SET_TYPING',
          payload: {
            userId: message.from,
            isTyping: message.isTyping
          }
        });
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  }, [messageCache, state.currentUser.id, state.selectedUser, dispatch, trackAction]);

  // 处理连接状态变化
  const handleConnectionStatusChange = useCallback((status) => {
    dispatch({
      type: 'SET_CONNECTION_STATUS',
      payload: status
    });
  }, [dispatch]);

  // 选择用户
  const handleSelectUser = useCallback((userId) => {
    trackAction('user_selected');
    
    const user = state.users.find(u => u.id === userId);
    if (user) {
      dispatch({
        type: 'SELECT_USER',
        payload: user
      });
      
      // 清除未读消息
      dispatch({
        type: 'CLEAR_UNREAD',
        payload: userId
      });
    }
  }, [state.users, dispatch, trackAction]);

  // 发送消息
  const handleSendMessage = useCallback(async (content) => {
    if (!state.selectedUser || !content.trim()) return;
    
    trackAction('message_send');
    
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'message',
      from: state.currentUser.id,
      to: state.selectedUser.id,
      content: content.trim(),
      timestamp: Date.now(),
      status: 'sending'
    };
    
    // 立即显示消息（乐观更新）
    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        userId: state.selectedUser.id,
        message
      }
    });
    
    try {
      // 发送消息
      await wsClient.sendMessage({
        type: 'message',
        to: state.selectedUser.id,
        content: content.trim()
      });
      
      // 更新消息状态
      dispatch({
        type: 'UPDATE_MESSAGE_STATUS',
        payload: {
          messageId: message.id,
          status: 'sent'
        }
      });
      
      // 缓存消息
      await messageCache.set(`msg_${message.id}`, message);
      
    } catch (error) {
      console.error('Send message failed:', error);
      
      // 更新消息状态为失败
      dispatch({
        type: 'UPDATE_MESSAGE_STATUS',
        payload: {
          messageId: message.id,
          status: 'failed'
        }
      });
    }
  }, [state.selectedUser, state.currentUser.id, wsClient, messageCache, dispatch, trackAction]);

  // 重试发送消息
  const handleRetryMessage = useCallback(async (messageId) => {
    trackAction('message_retry');
    
    const messages = state.messages[state.selectedUser?.id] || [];
    const message = messages.find(m => m.id === messageId);
    
    if (message) {
      dispatch({
        type: 'UPDATE_MESSAGE_STATUS',
        payload: {
          messageId,
          status: 'sending'
        }
      });
      
      try {
        await wsClient.sendMessage({
          type: 'message',
          to: message.to,
          content: message.content
        });
        
        dispatch({
          type: 'UPDATE_MESSAGE_STATUS',
          payload: {
            messageId,
            status: 'sent'
          }
        });
      } catch (error) {
        dispatch({
          type: 'UPDATE_MESSAGE_STATUS',
          payload: {
            messageId,
            status: 'failed'
          }
        });
      }
    }
  }, [state.messages, state.selectedUser, wsClient, dispatch, trackAction]);

  // 加载更多消息
  const handleLoadMoreMessages = useCallback(async () => {
    if (!state.selectedUser) return;
    
    trackAction('load_more_messages');
    
    // 这里应该从服务器加载历史消息
    // 示例：模拟加载
    console.log('Loading more messages for:', state.selectedUser.id);
  }, [state.selectedUser, trackAction]);

  // 获取用户的最后一条消息
  const getLastMessage = useCallback((userId) => {
    const messages = state.messages[userId] || [];
    return messages[messages.length - 1];
  }, [state.messages]);

  // 初始化
  useEffect(() => {
    dispatch({
      type: 'SET_LOADING',
      payload: false
    });
  }, [dispatch]);

  // 清理资源
  useEffect(() => {
    return () => {
      messageCache.destroy();
      wsClient.close();
    };
  }, [messageCache, wsClient]);

  // 渲染用户列表
  const renderUserList = useMemo(() => (
    <div className="user-list">
      <div className="user-list-header">
        <h3>会话列表</h3>
        <span className="online-count">
          在线: {state.users.filter(u => u.online).length}/{state.users.length}
        </span>
      </div>
      
      <div className="user-list-content">
        {state.users.map(user => (
          <PerformanceMonitor key={user.id} name={`UserItem-${user.id}`}>
            <OptimizedUserItem
              user={user}
              isSelected={state.selectedUser?.id === user.id}
              unreadCount={state.unreadCounts[user.id] || 0}
              lastMessage={getLastMessage(user.id)}
              onClick={handleSelectUser}
            />
          </PerformanceMonitor>
        ))}
      </div>
    </div>
  ), [state.users, state.selectedUser, state.unreadCounts, getLastMessage, handleSelectUser]);

  // 渲染聊天窗口
  const renderChatWindow = useMemo(() => {
    if (!state.selectedUser) {
      return (
        <div className="chat-placeholder">
          <p>请选择一个用户开始聊天</p>
        </div>
      );
    }

    const messages = state.messages[state.selectedUser.id] || [];

    return (
      <div className="chat-window">
        <div className="chat-header">
          <div className="user-info">
            <img src={state.selectedUser.avatar} alt={state.selectedUser.name} />
            <div>
              <h3>{state.selectedUser.name}</h3>
              <span className={`status ${state.selectedUser.online ? 'online' : 'offline'}`}>
                {state.selectedUser.online ? '在线' : '离线'}
              </span>
            </div>
          </div>
          
          <div className="chat-actions">
            <button className="icon-button">📞</button>
            <button className="icon-button">📹</button>
            <button className="icon-button">⋮</button>
          </div>
        </div>
        
        <PerformanceMonitor name="MessageList">
          <VirtualizedMessageList
            messages={messages}
            currentUserId={state.currentUser.id}
            containerHeight={400}
            onLoadMore={handleLoadMoreMessages}
            hasMore={false}
          />
        </PerformanceMonitor>
        
        <div className="chat-input">
          <OptimizedInput
            onSend={handleSendMessage}
            placeholder="输入消息..."
            maxLength={1000}
          />
        </div>
      </div>
    );
  }, [state.selectedUser, state.messages, state.currentUser.id, handleSendMessage, handleLoadMoreMessages]);

  // 渲染状态栏
  const renderStatusBar = useMemo(() => (
    <div className="status-bar">
      <div className="connection-status">
        <span className={`status-indicator ${state.connectionStatus}`} />
        <span>{state.connectionStatus === 'connected' ? '已连接' : '连接中...'}</span>
      </div>
      
      <div className="network-quality">
        <span>网络质量: </span>
        <span className={`quality-indicator quality-${Math.floor(state.networkQuality / 25)}`}>
          {state.networkQuality}%
        </span>
      </div>
      
      <div className="performance-metrics">
        <button onClick={() => console.log(getMetrics())}>
          查看性能指标
        </button>
      </div>
    </div>
  ), [state.connectionStatus, state.networkQuality, getMetrics]);

  // 主渲染
  return (
    <AsyncErrorBoundary
      fallback={({ error, retry }) => (
        <div className="error-page">
          <h1>应用出错了</h1>
          <p>{error.message}</p>
          <button onClick={retry}>重新加载</button>
        </div>
      )}
    >
      <div className="enhanced-app">
        <PerformanceReport interval={30000} />
        
        <div className="app-header">
          <h1>企业级客服系统</h1>
          <div className="user-profile">
            <img src={state.currentUser.avatar} alt={state.currentUser.name} />
            <span>{state.currentUser.name}</span>
          </div>
        </div>
        
        <div className="app-content">
          <ErrorBoundary>
            <aside className="sidebar">
              {renderUserList}
            </aside>
          </ErrorBoundary>
          
          <ErrorBoundary>
            <main className="main-content">
              {renderChatWindow}
            </main>
          </ErrorBoundary>
        </div>
        
        {renderStatusBar}
      </div>
    </AsyncErrorBoundary>
  );
};

export default EnhancedApp;