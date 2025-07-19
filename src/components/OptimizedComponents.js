import React, { 
  memo, 
  useCallback, 
  useMemo, 
  useRef, 
  useEffect, 
  useState, 
  forwardRef,
  Component 
} from 'react';
import { FixedSizeList as List } from 'react-window';
import { debounce, throttle } from 'lodash';

/**
 * 性能监控组件
 */
export const PerformanceMonitor = memo(({ name, children, onMetrics }) => {
  const startTimeRef = useRef(Date.now());
  const renderCountRef = useRef(0);
  const lastMetricsRef = useRef(null);
  
  useEffect(() => {
    renderCountRef.current++;
    
    const endTime = Date.now();
    const renderTime = endTime - startTimeRef.current;
    
    const metrics = {
      name,
      renderTime,
      renderCount: renderCountRef.current,
      timestamp: endTime,
      memory: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null
    };
    
    lastMetricsRef.current = metrics;
    
    if (onMetrics) {
      onMetrics(metrics);
    }
    
    // 开发环境下输出性能信息
    if (process.env.NODE_ENV === 'development' && renderTime > 16) {
      console.warn(`[Performance] ${name} 渲染时间过长: ${renderTime}ms`);
    }
    
    startTimeRef.current = Date.now();
  });
  
  return children;
});

PerformanceMonitor.displayName = 'PerformanceMonitor';

/**
 * 错误边界组件
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
    
    // 调用错误处理回调
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // 发送错误到监控服务
    this.reportError(error, errorInfo);
  }
  
  reportError = (error, errorInfo) => {
    // 这里可以集成错误监控服务
    console.error('ErrorBoundary caught an error:', {
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      errorBoundary: this.constructor.name,
      retryCount: this.state.retryCount
    });
  };
  
  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));
  };
  
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          retry: this.handleRetry,
          retryCount: this.state.retryCount
        });
      }
      
      return (
        <div style={{
          padding: '20px',
          border: '1px solid #ff6b6b',
          borderRadius: '4px',
          backgroundColor: '#ffe0e0',
          color: '#d63031'
        }}>
          <h3>组件出现错误</h3>
          <p>{this.state.error?.message}</p>
          <button 
            onClick={this.handleRetry}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0984e3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            重试 ({this.state.retryCount})
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}

/**
 * 优化的消息组件
 */
export const OptimizedMessage = memo(({ 
  message, 
  currentUserId, 
  style,
  onAction 
}) => {
  const isOwn = message.from === currentUserId;
  const timeRef = useRef(null);
  
  const formattedTime = useMemo(() => {
    return new Date(message.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [message.timestamp]);
  
  const handleAction = useCallback((action, data) => {
    if (onAction) {
      onAction(action, { ...data, messageId: message.id });
    }
  }, [onAction, message.id]);
  
  const messageStyle = useMemo(() => ({
    ...style,
    display: 'flex',
    flexDirection: isOwn ? 'row-reverse' : 'row',
    marginBottom: '12px',
    padding: '8px 12px'
  }), [style, isOwn]);
  
  const contentStyle = useMemo(() => ({
    maxWidth: '70%',
    padding: '8px 12px',
    borderRadius: '12px',
    backgroundColor: isOwn ? '#0084ff' : '#f1f3f4',
    color: isOwn ? 'white' : '#333',
    wordBreak: 'break-word',
    fontSize: '14px',
    lineHeight: '1.4'
  }), [isOwn]);
  
  const timeStyle = useMemo(() => ({
    fontSize: '12px',
    color: '#999',
    margin: isOwn ? '0 8px 0 0' : '0 0 0 8px',
    alignSelf: 'flex-end'
  }), [isOwn]);
  
  return (
    <div style={messageStyle}>
      <div style={contentStyle}>
        {message.content}
      </div>
      <div ref={timeRef} style={timeStyle}>
        {formattedTime}
      </div>
    </div>
  );
});

OptimizedMessage.displayName = 'OptimizedMessage';

/**
 * 优化的用户项组件
 */
export const OptimizedUserItem = memo(({ 
  user, 
  isSelected, 
  onSelect, 
  style 
}) => {
  const handleSelect = useCallback(() => {
    if (onSelect) {
      onSelect(user);
    }
  }, [onSelect, user]);
  
  const itemStyle = useMemo(() => ({
    ...style,
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    backgroundColor: isSelected ? '#e3f2fd' : 'transparent',
    borderLeft: isSelected ? '3px solid #0084ff' : '3px solid transparent',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f5f5f5'
    }
  }), [style, isSelected]);
  
  const avatarStyle = useMemo(() => ({
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#0084ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    marginRight: '12px'
  }), []);
  
  const nameStyle = useMemo(() => ({
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '2px'
  }), []);
  
  const statusStyle = useMemo(() => ({
    fontSize: '12px',
    color: user.status === 'online' ? '#4caf50' : '#999'
  }), [user.status]);
  
  const avatarText = useMemo(() => {
    return user.name ? user.name.charAt(0).toUpperCase() : 'U';
  }, [user.name]);
  
  return (
    <div style={itemStyle} onClick={handleSelect}>
      <div style={avatarStyle}>
        {avatarText}
      </div>
      <div style={{ flex: 1 }}>
        <div style={nameStyle}>{user.name}</div>
        <div style={statusStyle}>{user.status === 'online' ? '在线' : '离线'}</div>
      </div>
      {user.unreadCount > 0 && (
        <div style={{
          backgroundColor: '#ff4757',
          color: 'white',
          borderRadius: '50%',
          minWidth: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          {user.unreadCount > 99 ? '99+' : user.unreadCount}
        </div>
      )}
    </div>
  );
});

OptimizedUserItem.displayName = 'OptimizedUserItem';

/**
 * 虚拟化消息列表
 */
export const VirtualizedMessageList = memo(forwardRef(({ 
  messages, 
  currentUserId, 
  containerHeight = 400,
  itemHeight = 80,
  onAction,
  onScroll 
}, ref) => {
  const listRef = useRef(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  
  // 节流滚动处理
  const handleScroll = useCallback(
    throttle(({ scrollDirection, scrollOffset, scrollUpdateWasRequested }) => {
      // 如果用户手动滚动，禁用自动滚动
      if (!scrollUpdateWasRequested && scrollDirection === 'backward') {
        setIsAutoScrolling(false);
      }
      
      // 如果滚动到底部，重新启用自动滚动
      const isAtBottom = scrollOffset >= (messages.length * itemHeight - containerHeight);
      if (isAtBottom) {
        setIsAutoScrolling(true);
      }
      
      if (onScroll) {
        onScroll({ scrollDirection, scrollOffset, scrollUpdateWasRequested });
      }
    }, 100),
    [messages.length, itemHeight, containerHeight, onScroll]
  );
  
  // 自动滚动到底部
  useEffect(() => {
    if (isAutoScrolling && listRef.current && messages.length > 0) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length, isAutoScrolling]);
  
  // 消息项渲染器
  const MessageItem = useCallback(({ index, style }) => {
    const message = messages[index];
    
    return (
      <PerformanceMonitor name={`Message-${message.id}`}>
        <OptimizedMessage
          message={message}
          currentUserId={currentUserId}
          style={style}
          onAction={onAction}
        />
      </PerformanceMonitor>
    );
  }, [messages, currentUserId, onAction]);
  
  // 暴露方法给父组件
  React.useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (listRef.current && messages.length > 0) {
        listRef.current.scrollToItem(messages.length - 1, 'end');
        setIsAutoScrolling(true);
      }
    },
    scrollToTop: () => {
      if (listRef.current) {
        listRef.current.scrollToItem(0, 'start');
        setIsAutoScrolling(false);
      }
    },
    scrollToMessage: (messageIndex) => {
      if (listRef.current && messageIndex >= 0 && messageIndex < messages.length) {
        listRef.current.scrollToItem(messageIndex, 'center');
        setIsAutoScrolling(false);
      }
    }
  }), [messages.length]);
  
  if (messages.length === 0) {
    return (
      <div style={{
        height: containerHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        fontSize: '14px'
      }}>
        暂无消息
      </div>
    );
  }
  
  return (
    <ErrorBoundary
      fallback={({ error, retry }) => (
        <div style={{
          height: containerHeight,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff6b6b',
          fontSize: '14px',
          padding: '20px'
        }}>
          <p>消息列表加载失败</p>
          <button 
            onClick={retry}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#0084ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      )}
    >
      <PerformanceMonitor name="VirtualizedMessageList">
        <List
          ref={listRef}
          height={containerHeight}
          itemCount={messages.length}
          itemSize={itemHeight}
          onScroll={handleScroll}
          overscanCount={5}
        >
          {MessageItem}
        </List>
      </PerformanceMonitor>
    </ErrorBoundary>
  );
}));

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

/**
 * 虚拟化用户列表
 */
export const VirtualizedUserList = memo(({ 
  users, 
  selectedUserId, 
  onUserSelect, 
  containerHeight = 400,
  itemHeight = 64,
  onScroll 
}) => {
  const listRef = useRef(null);
  
  const handleScroll = useCallback(
    throttle((scrollInfo) => {
      if (onScroll) {
        onScroll(scrollInfo);
      }
    }, 100),
    [onScroll]
  );
  
  const UserItem = useCallback(({ index, style }) => {
    const user = users[index];
    const isSelected = user.id === selectedUserId;
    
    return (
      <PerformanceMonitor name={`User-${user.id}`}>
        <OptimizedUserItem
          user={user}
          isSelected={isSelected}
          onSelect={onUserSelect}
          style={style}
        />
      </PerformanceMonitor>
    );
  }, [users, selectedUserId, onUserSelect]);
  
  if (users.length === 0) {
    return (
      <div style={{
        height: containerHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        fontSize: '14px'
      }}>
        暂无用户
      </div>
    );
  }
  
  return (
    <ErrorBoundary
      fallback={({ error, retry }) => (
        <div style={{
          height: containerHeight,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff6b6b',
          fontSize: '14px',
          padding: '20px'
        }}>
          <p>用户列表加载失败</p>
          <button 
            onClick={retry}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#0084ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      )}
    >
      <PerformanceMonitor name="VirtualizedUserList">
        <List
          ref={listRef}
          height={containerHeight}
          itemCount={users.length}
          itemSize={itemHeight}
          onScroll={handleScroll}
          overscanCount={3}
        >
          {UserItem}
        </List>
      </PerformanceMonitor>
    </ErrorBoundary>
  );
});

VirtualizedUserList.displayName = 'VirtualizedUserList';

/**
 * 防抖输入组件
 */
export const DebouncedInput = memo(({ 
  value, 
  onChange, 
  delay = 300, 
  placeholder = '',
  style,
  ...props 
}) => {
  const [inputValue, setInputValue] = useState(value || '');
  const debouncedOnChange = useRef();
  
  // 创建防抖函数
  useEffect(() => {
    debouncedOnChange.current = debounce((value) => {
      if (onChange) {
        onChange(value);
      }
    }, delay);
    
    return () => {
      if (debouncedOnChange.current) {
        debouncedOnChange.current.cancel();
      }
    };
  }, [onChange, delay]);
  
  // 处理输入变化
  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    if (debouncedOnChange.current) {
      debouncedOnChange.current(newValue);
    }
  }, []);
  
  // 同步外部value变化
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value || '');
    }
  }, [value]);
  
  const inputStyle = useMemo(() => ({
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    ...style
  }), [style]);
  
  return (
    <input
      type="text"
      value={inputValue}
      onChange={handleInputChange}
      placeholder={placeholder}
      style={inputStyle}
      {...props}
    />
  );
});

DebouncedInput.displayName = 'DebouncedInput';

/**
 * 性能指标面板
 */
export const PerformancePanel = memo(({ metrics, style }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  const panelStyle = useMemo(() => ({
    position: 'fixed',
    top: '10px',
    right: '10px',
    background: 'rgba(0, 0, 0, 0.8)',
    color: 'white',
    padding: '10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    zIndex: 9999,
    display: isVisible ? 'block' : 'none',
    ...style
  }), [isVisible, style]);
  
  const toggleVisibility = useCallback(() => {
    setIsVisible(prev => !prev);
  }, []);
  
  // 快捷键切换显示
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        toggleVisibility();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [toggleVisibility]);
  
  if (!metrics) {
    return (
      <button 
        onClick={toggleVisibility}
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: '#0084ff',
          color: 'white',
          border: 'none',
          padding: '8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          zIndex: 9999
        }}
      >
        性能
      </button>
    );
  }
  
  return (
    <>
      <button 
        onClick={toggleVisibility}
        style={{
          position: 'fixed',
          top: '10px',
          right: isVisible ? '220px' : '10px',
          background: '#0084ff',
          color: 'white',
          border: 'none',
          padding: '8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          zIndex: 9999
        }}
      >
        性能
      </button>
      
      <div style={panelStyle}>
        <div>渲染时间: {metrics.renderTime}ms</div>
        <div>渲染次数: {metrics.renderCount}</div>
        {metrics.memory && (
          <>
            <div>内存使用: {Math.round(metrics.memory.used / 1024 / 1024)}MB</div>
            <div>内存总计: {Math.round(metrics.memory.total / 1024 / 1024)}MB</div>
          </>
        )}
        <div style={{ marginTop: '5px', fontSize: '10px', color: '#ccc' }}>
          Ctrl+Shift+P 切换显示
        </div>
      </div>
    </>
  );
});

PerformancePanel.displayName = 'PerformancePanel';