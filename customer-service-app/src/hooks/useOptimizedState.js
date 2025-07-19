import { useReducer, useCallback, useRef, useEffect } from 'react';
import logger from '../utils/logger';
import { throttle, debounce } from 'lodash';

/**
 * 优化的状态管理Hook
 * 支持细粒度更新、批量更新和性能优化
 */
export const useOptimizedState = (initialState) => {
  // 状态reducer
  const reducer = (state, action) => {
    switch (action.type) {
      case 'SET_USERS':
        return {
          ...state,
          users: action.payload
        };
        
      case 'SELECT_USER':
        return {
          ...state,
          selectedUser: action.payload
        };
        
      case 'ADD_MESSAGE':
        const { userId, message } = action.payload;
        return {
          ...state,
          messages: {
            ...state.messages,
            [userId]: [...(state.messages[userId] || []), message]
          }
        };
        
      case 'UPDATE_MESSAGE_STATUS':
        const { messageId, status } = action.payload;
        const updatedMessages = { ...state.messages };
        
        Object.keys(updatedMessages).forEach(userId => {
          updatedMessages[userId] = updatedMessages[userId].map(msg =>
            msg.id === messageId ? { ...msg, status } : msg
          );
        });
        
        return {
          ...state,
          messages: updatedMessages
        };
        
      case 'INCREMENT_UNREAD':
        return {
          ...state,
          unreadCounts: {
            ...state.unreadCounts,
            [action.payload]: (state.unreadCounts[action.payload] || 0) + 1
          }
        };
        
      case 'CLEAR_UNREAD':
        const { [action.payload]: _, ...restUnread } = state.unreadCounts;
        return {
          ...state,
          unreadCounts: restUnread
        };
        
      case 'UPDATE_USER_STATUS':
        return {
          ...state,
          users: state.users.map(user =>
            user.id === action.payload.userId
              ? { ...user, online: action.payload.online }
              : user
          )
        };
        
      case 'SET_TYPING':
        return {
          ...state,
          users: state.users.map(user =>
            user.id === action.payload.userId
              ? { ...user, isTyping: action.payload.isTyping }
              : user
          )
        };
        
      case 'SET_CONNECTION_STATUS':
        return {
          ...state,
          connectionStatus: action.payload
        };
        
      case 'SET_NETWORK_QUALITY':
        return {
          ...state,
          networkQuality: action.payload
        };
        
      case 'SET_LOADING':
        return {
          ...state,
          isLoading: action.payload
        };
        
      case 'BATCH_UPDATE':
        return {
          ...state,
          ...action.payload
        };
        
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  
  // 批量更新队列
  const batchQueueRef = useRef([]);
  const batchTimeoutRef = useRef(null);
  
  // 批量dispatch
  const batchedDispatch = useCallback((action) => {
    batchQueueRef.current.push(action);
    
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
    
    batchTimeoutRef.current = setTimeout(() => {
      const actions = [...batchQueueRef.current];
      batchQueueRef.current = [];
      
      // 合并相同类型的action
      const mergedActions = mergeActions(actions);
      
      mergedActions.forEach(action => {
        dispatch(action);
      });
    }, 16); // 一帧的时间
  }, []);
  
  // 合并相同类型的actions
  const mergeActions = (actions) => {
    const merged = new Map();
    
    actions.forEach(action => {
      if (action.type === 'ADD_MESSAGE') {
        // 合并消息添加
        const key = `${action.type}-${action.payload.userId}`;
        if (!merged.has(key)) {
          merged.set(key, {
            type: action.type,
            payload: {
              userId: action.payload.userId,
              messages: []
            }
          });
        }
        merged.get(key).payload.messages.push(action.payload.message);
      } else {
        // 其他action直接添加
        merged.set(`${action.type}-${Date.now()}`, action);
      }
    });
    
    return Array.from(merged.values());
  };
  
  // 清理
  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, []);
  
  return [state, batchedDispatch];
};

/**
 * 批量状态更新Hook
 */
export const useBatchedState = (initialState) => {
  const [state, setState] = useReducer(
    (prevState, updates) => ({ ...prevState, ...updates }),
    initialState
  );
  
  const pendingUpdatesRef = useRef({});
  const updateTimeoutRef = useRef(null);
  
  const batchedSetState = useCallback((updates) => {
    Object.assign(pendingUpdatesRef.current, updates);
    
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = setTimeout(() => {
      const updates = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      setState(updates);
    }, 16);
  }, []);
  
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);
  
  return [state, batchedSetState];
};

/**
 * 节流状态更新Hook
 */
export const useThrottledState = (initialState, delay = 100) => {
  const [state, setState] = useReducer(
    (prevState, updates) => ({ ...prevState, ...updates }),
    initialState
  );
  
  const throttledSetState = useCallback(
    throttle((updates) => {
      setState(updates);
    }, delay),
    [delay]
  );
  
  return [state, throttledSetState];
};

/**
 * 防抖状态更新Hook
 */
export const useDebouncedState = (initialState, delay = 300) => {
  const [state, setState] = useReducer(
    (prevState, updates) => ({ ...prevState, ...updates }),
    initialState
  );
  
  const debouncedSetState = useCallback(
    debounce((updates) => {
      setState(updates);
    }, delay),
    [delay]
  );
  
  return [state, debouncedSetState];
};

/**
 * 选择性订阅状态Hook
 */
export const useSelectiveState = (globalState, selector) => {
  const [localState, setLocalState] = useReducer(
    (_, newState) => newState,
    selector(globalState)
  );
  
  const prevSelectedRef = useRef(localState);
  
  useEffect(() => {
    const selected = selector(globalState);
    
    // 只在选择的状态真正改变时更新
    if (!shallowEqual(prevSelectedRef.current, selected)) {
      prevSelectedRef.current = selected;
      setLocalState(selected);
    }
  }, [globalState, selector]);
  
  return localState;
};

/**
 * 浅比较工具函数
 */
const shallowEqual = (obj1, obj2) => {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }
  
  return true;
};

/**
 * 持久化状态Hook
 */
export const usePersistentState = (key, initialState) => {
  // 从localStorage读取初始值
  const getInitialState = () => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialState;
    } catch (error) {
      logger.error('Failed to load state from localStorage:', error);
      return initialState;
    }
  };
  
  const [state, setState] = useReducer(
    (prevState, updates) => ({ ...prevState, ...updates }),
    getInitialState()
  );
  
  // 保存到localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      logger.error('Failed to save state to localStorage:', error);
    }
  }, [key, state]);
  
  return [state, setState];
};

/**
 * 撤销/重做状态Hook
 */
export const useUndoableState = (initialState) => {
  const [state, setState] = useReducer((state, action) => {
    switch (action.type) {
      case 'SET':
        return {
          past: [...state.past, state.present],
          present: action.payload,
          future: []
        };
      case 'UNDO':
        if (state.past.length === 0) return state;
        return {
          past: state.past.slice(0, -1),
          present: state.past[state.past.length - 1],
          future: [state.present, ...state.future]
        };
      case 'REDO':
        if (state.future.length === 0) return state;
        return {
          past: [...state.past, state.present],
          present: state.future[0],
          future: state.future.slice(1)
        };
      case 'RESET':
        return {
          past: [],
          present: action.payload || initialState,
          future: []
        };
      default:
        return state;
    }
  }, {
    past: [],
    present: initialState,
    future: []
  });
  
  const setValue = useCallback((value) => {
    setState({ type: 'SET', payload: value });
  }, []);
  
  const undo = useCallback(() => {
    setState({ type: 'UNDO' });
  }, []);
  
  const redo = useCallback(() => {
    setState({ type: 'REDO' });
  }, []);
  
  const reset = useCallback((value) => {
    setState({ type: 'RESET', payload: value });
  }, []);
  
  return {
    state: state.present,
    setState: setValue,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0
  };
};