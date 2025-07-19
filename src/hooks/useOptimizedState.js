import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { debounce, throttle, isEqual } from 'lodash';

/**
 * 优化的状态管理Hook
 * 功能：细粒度更新、批量处理、性能监控、状态缓存
 */
export function useOptimizedState(initialState, options = {}) {
  const {
    enableBatching = true,
    batchDelay = 16,
    enableCaching = true,
    maxCacheSize = 100,
    enablePerformanceMonitoring = true,
    equalityCheck = isEqual
  } = options;
  
  const [state, setState] = useState(initialState);
  const cacheRef = useRef(new Map());
  const pendingUpdatesRef = useRef([]);
  const metricsRef = useRef({
    updates: 0,
    batchedUpdates: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalUpdateTime: 0
  });
  
  // 批量更新处理器
  const batchedUpdate = useRef();
  
  useEffect(() => {
    if (enableBatching) {
      batchedUpdate.current = debounce(() => {
        if (pendingUpdatesRef.current.length > 0) {
          const updates = pendingUpdatesRef.current;
          pendingUpdatesRef.current = [];
          
          setState(prevState => {
            let newState = prevState;
            
            updates.forEach(update => {
              if (typeof update === 'function') {
                newState = update(newState);
              } else {
                newState = { ...newState, ...update };
              }
            });
            
            return newState;
          });
          
          metricsRef.current.batchedUpdates++;
        }
      }, batchDelay);
      
      return () => {
        if (batchedUpdate.current) {
          batchedUpdate.current.cancel();
        }
      };
    }
  }, [enableBatching, batchDelay]);
  
  // 缓存管理
  const getCachedValue = useCallback((key) => {
    if (!enableCaching) return null;
    
    const cached = cacheRef.current.get(key);
    if (cached) {
      metricsRef.current.cacheHits++;
      return cached.value;
    }
    
    metricsRef.current.cacheMisses++;
    return null;
  }, [enableCaching]);
  
  const setCachedValue = useCallback((key, value) => {
    if (!enableCaching) return;
    
    // 限制缓存大小
    if (cacheRef.current.size >= maxCacheSize) {
      const firstKey = cacheRef.current.keys().next().value;
      cacheRef.current.delete(firstKey);
    }
    
    cacheRef.current.set(key, {
      value,
      timestamp: Date.now()
    });
  }, [enableCaching, maxCacheSize]);
  
  // 优化的setState
  const optimizedSetState = useCallback((updateOrValue, immediate = false) => {
    const startTime = performance.now();
    
    if (immediate || !enableBatching) {
      setState(prevState => {
        let newState;
        
        if (typeof updateOrValue === 'function') {
          newState = updateOrValue(prevState);
        } else {
          newState = { ...prevState, ...updateOrValue };
        }
        
        // 相等性检查
        if (equalityCheck(prevState, newState)) {
          return prevState;
        }
        
        return newState;
      });
    } else {
      pendingUpdatesRef.current.push(updateOrValue);
      if (batchedUpdate.current) {
        batchedUpdate.current();
      }
    }
    
    const endTime = performance.now();
    metricsRef.current.updates++;
    metricsRef.current.totalUpdateTime += endTime - startTime;
  }, [enableBatching, equalityCheck]);
  
  // 获取状态的特定字段
  const getField = useCallback((fieldPath) => {
    const cacheKey = `field_${fieldPath}`;
    const cached = getCachedValue(cacheKey);
    
    if (cached !== null) {
      return cached;
    }
    
    const value = fieldPath.split('.').reduce((obj, key) => obj?.[key], state);
    setCachedValue(cacheKey, value);
    
    return value;
  }, [state, getCachedValue, setCachedValue]);
  
  // 更新状态的特定字段
  const setField = useCallback((fieldPath, value, immediate = false) => {
    const keys = fieldPath.split('.');
    
    optimizedSetState(prevState => {
      const newState = { ...prevState };
      let current = newState;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object') {
          current[key] = {};
        } else {
          current[key] = { ...current[key] };
        }
        current = current[key];
      }
      
      const lastKey = keys[keys.length - 1];
      current[lastKey] = typeof value === 'function' ? value(current[lastKey]) : value;
      
      return newState;
    }, immediate);
    
    // 清理相关缓存
    const cacheKey = `field_${fieldPath}`;
    cacheRef.current.delete(cacheKey);
  }, [optimizedSetState]);
  
  // 批量更新多个字段
  const updateFields = useCallback((updates, immediate = false) => {
    optimizedSetState(prevState => {
      const newState = { ...prevState };
      
      Object.entries(updates).forEach(([fieldPath, value]) => {
        const keys = fieldPath.split('.');
        let current = newState;
        
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (!(key in current) || typeof current[key] !== 'object') {
            current[key] = {};
          } else {
            current[key] = { ...current[key] };
          }
          current = current[key];
        }
        
        const lastKey = keys[keys.length - 1];
        current[lastKey] = typeof value === 'function' ? value(current[lastKey]) : value;
        
        // 清理缓存
        const cacheKey = `field_${fieldPath}`;
        cacheRef.current.delete(cacheKey);
      });
      
      return newState;
    }, immediate);
  }, [optimizedSetState]);
  
  // 重置状态
  const resetState = useCallback((newInitialState = initialState) => {
    setState(newInitialState);
    cacheRef.current.clear();
  }, [initialState]);
  
  // 获取性能指标
  const getMetrics = useCallback(() => {
    const metrics = metricsRef.current;
    return {
      ...metrics,
      averageUpdateTime: metrics.updates > 0 ? metrics.totalUpdateTime / metrics.updates : 0,
      cacheHitRate: (metrics.cacheHits + metrics.cacheMisses) > 0 ? 
        metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) : 0,
      cacheSize: cacheRef.current.size
    };
  }, []);
  
  // 清理缓存
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);
  
  return {
    state,
    setState: optimizedSetState,
    getField,
    setField,
    updateFields,
    resetState,
    getMetrics,
    clearCache
  };
}

/**
 * 消息状态管理Hook
 */
export function useMessageState(initialMessages = []) {
  const { 
    state, 
    setState, 
    getField, 
    setField, 
    updateFields,
    getMetrics 
  } = useOptimizedState({
    messages: initialMessages,
    selectedMessageId: null,
    searchQuery: '',
    filteredMessages: initialMessages,
    isLoading: false,
    hasMore: true
  }, {
    enableBatching: true,
    batchDelay: 8, // 更快的消息更新
    enableCaching: true
  });
  
  // 添加消息
  const addMessage = useCallback((message) => {
    setField('messages', prevMessages => [...prevMessages, message], true);
    
    // 如果没有搜索，同时更新过滤列表
    if (!getField('searchQuery')) {
      setField('filteredMessages', prevFiltered => [...prevFiltered, message]);
    }
  }, [setField, getField]);
  
  // 批量添加消息
  const addMessages = useCallback((newMessages) => {
    setField('messages', prevMessages => [...prevMessages, ...newMessages]);
    
    if (!getField('searchQuery')) {
      setField('filteredMessages', prevFiltered => [...prevFiltered, ...newMessages]);
    }
  }, [setField, getField]);
  
  // 更新消息
  const updateMessage = useCallback((messageId, updates) => {
    setField('messages', prevMessages => 
      prevMessages.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
    
    // 同时更新过滤列表
    setField('filteredMessages', prevFiltered => 
      prevFiltered.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  }, [setField]);
  
  // 删除消息
  const deleteMessage = useCallback((messageId) => {
    setField('messages', prevMessages => 
      prevMessages.filter(msg => msg.id !== messageId)
    );
    
    setField('filteredMessages', prevFiltered => 
      prevFiltered.filter(msg => msg.id !== messageId)
    );
  }, [setField]);
  
  // 搜索消息（防抖）
  const searchMessages = useCallback(
    debounce((query) => {
      setField('searchQuery', query);
      
      if (!query.trim()) {
        setField('filteredMessages', getField('messages'));
      } else {
        const filtered = getField('messages').filter(msg =>
          msg.content.toLowerCase().includes(query.toLowerCase()) ||
          msg.from.toLowerCase().includes(query.toLowerCase())
        );
        setField('filteredMessages', filtered);
      }
    }, 300),
    [setField, getField]
  );
  
  // 选择消息
  const selectMessage = useCallback((messageId) => {
    setField('selectedMessageId', messageId);
  }, [setField]);
  
  // 清空消息
  const clearMessages = useCallback(() => {
    updateFields({
      messages: [],
      filteredMessages: [],
      selectedMessageId: null
    });
  }, [updateFields]);
  
  return {
    // 状态
    messages: getField('messages'),
    filteredMessages: getField('filteredMessages'),
    selectedMessageId: getField('selectedMessageId'),
    searchQuery: getField('searchQuery'),
    isLoading: getField('isLoading'),
    hasMore: getField('hasMore'),
    
    // 方法
    addMessage,
    addMessages,
    updateMessage,
    deleteMessage,
    searchMessages,
    selectMessage,
    clearMessages,
    
    // 设置状态
    setLoading: (loading) => setField('isLoading', loading),
    setHasMore: (hasMore) => setField('hasMore', hasMore),
    
    // 性能指标
    getMetrics
  };
}

/**
 * 用户状态管理Hook
 */
export function useUserState(initialUsers = []) {
  const { 
    state, 
    setState, 
    getField, 
    setField, 
    updateFields,
    getMetrics 
  } = useOptimizedState({
    users: initialUsers,
    currentUserId: null,
    selectedUserId: null,
    onlineUsers: new Set(),
    searchQuery: '',
    filteredUsers: initialUsers
  }, {
    enableBatching: true,
    enableCaching: true
  });
  
  // 设置当前用户
  const setCurrentUser = useCallback((userId) => {
    setField('currentUserId', userId);
  }, [setField]);
  
  // 选择用户
  const selectUser = useCallback((userId) => {
    setField('selectedUserId', userId);
  }, [setField]);
  
  // 添加用户
  const addUser = useCallback((user) => {
    const users = getField('users');
    const existingIndex = users.findIndex(u => u.id === user.id);
    
    if (existingIndex >= 0) {
      // 更新现有用户
      setField('users', prevUsers => 
        prevUsers.map((u, index) => 
          index === existingIndex ? { ...u, ...user } : u
        )
      );
    } else {
      // 添加新用户
      setField('users', prevUsers => [...prevUsers, user]);
    }
    
    // 更新过滤列表
    if (!getField('searchQuery')) {
      setField('filteredUsers', getField('users'));
    }
  }, [getField, setField]);
  
  // 更新用户状态
  const updateUserStatus = useCallback((userId, status) => {
    setField('users', prevUsers => 
      prevUsers.map(user => 
        user.id === userId ? { ...user, status } : user
      )
    );
    
    // 更新在线用户集合
    const onlineUsers = new Set(getField('onlineUsers'));
    if (status === 'online') {
      onlineUsers.add(userId);
    } else {
      onlineUsers.delete(userId);
    }
    setField('onlineUsers', onlineUsers);
  }, [setField, getField]);
  
  // 搜索用户
  const searchUsers = useCallback(
    debounce((query) => {
      setField('searchQuery', query);
      
      if (!query.trim()) {
        setField('filteredUsers', getField('users'));
      } else {
        const filtered = getField('users').filter(user =>
          user.name.toLowerCase().includes(query.toLowerCase()) ||
          user.id.toLowerCase().includes(query.toLowerCase())
        );
        setField('filteredUsers', filtered);
      }
    }, 300),
    [setField, getField]
  );
  
  // 获取在线用户数量
  const getOnlineCount = useCallback(() => {
    return getField('onlineUsers').size;
  }, [getField]);
  
  return {
    // 状态
    users: getField('users'),
    filteredUsers: getField('filteredUsers'),
    currentUserId: getField('currentUserId'),
    selectedUserId: getField('selectedUserId'),
    searchQuery: getField('searchQuery'),
    
    // 方法
    setCurrentUser,
    selectUser,
    addUser,
    updateUserStatus,
    searchUsers,
    getOnlineCount,
    
    // 性能指标
    getMetrics
  };
}

/**
 * 连接状态管理Hook
 */
export function useConnectionState() {
  const { 
    state, 
    getField, 
    setField, 
    updateFields,
    getMetrics 
  } = useOptimizedState({
    isConnected: false,
    isConnecting: false,
    connectionQuality: 'unknown',
    reconnectAttempts: 0,
    lastConnected: null,
    networkStatus: 'unknown',
    latency: 0,
    throughput: 0
  }, {
    enableBatching: true,
    batchDelay: 50 // 连接状态更新稍慢一些
  });
  
  // 设置连接状态
  const setConnected = useCallback((connected) => {
    updateFields({
      isConnected: connected,
      isConnecting: false,
      lastConnected: connected ? Date.now() : getField('lastConnected'),
      reconnectAttempts: connected ? 0 : getField('reconnectAttempts')
    });
  }, [updateFields, getField]);
  
  // 设置连接中状态
  const setConnecting = useCallback((connecting) => {
    setField('isConnecting', connecting);
  }, [setField]);
  
  // 更新网络质量
  const updateNetworkQuality = useCallback((quality, latency = 0) => {
    updateFields({
      connectionQuality: quality,
      latency,
      networkStatus: quality === 'poor' ? 'unstable' : 'stable'
    });
  }, [updateFields]);
  
  // 增加重连尝试次数
  const incrementReconnectAttempts = useCallback(() => {
    setField('reconnectAttempts', prev => prev + 1);
  }, [setField]);
  
  // 重置重连次数
  const resetReconnectAttempts = useCallback(() => {
    setField('reconnectAttempts', 0);
  }, [setField]);
  
  return {
    // 状态
    isConnected: getField('isConnected'),
    isConnecting: getField('isConnecting'),
    connectionQuality: getField('connectionQuality'),
    reconnectAttempts: getField('reconnectAttempts'),
    lastConnected: getField('lastConnected'),
    networkStatus: getField('networkStatus'),
    latency: getField('latency'),
    
    // 方法
    setConnected,
    setConnecting,
    updateNetworkQuality,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    
    // 性能指标
    getMetrics
  };
}

export default useOptimizedState;