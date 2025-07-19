import React, { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import logger from '../utils/logger';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { debounce, throttle } from 'lodash';

/**
 * 优化的消息组件 - 使用memo和优化的渲染
 */
export const OptimizedMessage = memo(({ 
  message, 
  currentUserId, 
  onRetry,
  onDelete 
}) => {
  const isOwn = message.from === currentUserId;
  
  // 格式化时间
  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }, [message.timestamp]);
  
  // 消息状态图标
  const statusIcon = useMemo(() => {
    switch (message.status) {
      case 'sending':
        return '⏳';
      case 'sent':
        return '✓';
      case 'delivered':
        return '✓✓';
      case 'read':
        return '👁️';
      case 'failed':
        return '❌';
      default:
        return '';
    }
  }, [message.status]);
  
  return (
    <div className={`message ${isOwn ? 'own' : 'other'}`}>
      <div className="message-bubble">
        <div className="message-content">{message.content}</div>
        <div className="message-meta">
          <span className="message-time">{formattedTime}</span>
          {isOwn && <span className="message-status">{statusIcon}</span>}
        </div>
      </div>
      {message.status === 'failed' && (
        <div className="message-actions">
          <button onClick={() => onRetry(message.id)}>重试</button>
          <button onClick={() => onDelete(message.id)}>删除</button>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，只在必要时重新渲染
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.currentUserId === nextProps.currentUserId
  );
});

OptimizedMessage.displayName = 'OptimizedMessage';

/**
 * 优化的用户列表项组件
 */
export const OptimizedUserItem = memo(({ 
  user, 
  isSelected, 
  unreadCount,
  lastMessage,
  onClick 
}) => {
  // 在线状态指示器
  const statusIndicator = useMemo(() => {
    const statusClass = user.online ? 'online' : 'offline';
    const statusText = user.online ? '在线' : '离线';
    return { statusClass, statusText };
  }, [user.online]);
  
  // 格式化最后消息时间
  const lastMessageTime = useMemo(() => {
    if (!lastMessage) return '';
    
    const date = new Date(lastMessage.timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    
    return date.toLocaleDateString('zh-CN');
  }, [lastMessage]);
  
  const handleClick = useCallback(() => {
    onClick(user.id);
  }, [onClick, user.id]);
  
  return (
    <div 
      className={`user-item ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      <div className="user-avatar">
        <img src={user.avatar || '/default-avatar.png'} alt={user.name} />
        <span className={`status-dot ${statusIndicator.statusClass}`} />
      </div>
      
      <div className="user-info">
        <div className="user-header">
          <span className="user-name">{user.name}</span>
          {lastMessageTime && (
            <span className="last-message-time">{lastMessageTime}</span>
          )}
        </div>
        
        {lastMessage && (
          <div className="last-message">
            {lastMessage.content.substring(0, 30)}...
          </div>
        )}
      </div>
      
      {unreadCount > 0 && (
        <div className="unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.user.id === nextProps.user.id &&
    prevProps.user.online === nextProps.user.online &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.unreadCount === nextProps.unreadCount &&
    prevProps.lastMessage?.id === nextProps.lastMessage?.id
  );
});

OptimizedUserItem.displayName = 'OptimizedUserItem';

/**
 * 虚拟滚动消息列表
 */
export const VirtualizedMessageList = ({ 
  messages, 
  currentUserId,
  containerHeight = 400,
  itemHeight = 80,
  onLoadMore,
  hasMore = false
}) => {
  const listRef = useRef();
  const scrollPositionRef = useRef(0);
  
  // 消息行渲染器
  const MessageRow = useCallback(({ index, style }) => {
    const message = messages[index];
    
    if (!message) {
      return <div style={style}>加载中...</div>;
    }
    
    return (
      <div style={style}>
        <OptimizedMessage
          message={message}
          currentUserId={currentUserId}
          onRetry={() => logger.debug('Retry:', message.id)}
          onDelete={() => logger.debug('Delete:', message.id)}
        />
      </div>
    );
  }, [messages, currentUserId]);
  
  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(messages.length - 1, 'end');
    }
  }, [messages.length]);
  
  // 处理滚动事件（节流）
  const handleScroll = useCallback(
    throttle(({ scrollOffset, scrollDirection }) => {
      scrollPositionRef.current = scrollOffset;
      
      // 如果滚动到顶部且有更多消息，加载更多
      if (scrollOffset === 0 && scrollDirection === 'backward' && hasMore && onLoadMore) {
        onLoadMore();
      }
    }, 100),
    [hasMore, onLoadMore]
  );
  
  // 新消息时自动滚动到底部
  useEffect(() => {
    const isNearBottom = scrollPositionRef.current > 
      (messages.length * itemHeight - containerHeight - 100);
    
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom, itemHeight, containerHeight]);
  
  return (
    <List
      ref={listRef}
      height={containerHeight}
      itemCount={messages.length}
      itemSize={itemHeight}
      width="100%"
      onScroll={handleScroll}
      overscanCount={5}
    >
      {MessageRow}
    </List>
  );
};

/**
 * 带无限加载的消息列表
 */
export const InfiniteMessageList = ({ 
  messages,
  currentUserId,
  loadMoreMessages,
  hasNextPage,
  containerHeight = 400
}) => {
  const itemCount = hasNextPage ? messages.length + 1 : messages.length;
  
  const loadMoreItems = useCallback(
    (startIndex, stopIndex) => {
      return loadMoreMessages(startIndex, stopIndex);
    },
    [loadMoreMessages]
  );
  
  const isItemLoaded = useCallback(
    (index) => !hasNextPage || index < messages.length,
    [hasNextPage, messages.length]
  );
  
  const Item = useCallback(
    ({ index, style }) => {
      if (!isItemLoaded(index)) {
        return <div style={style}>加载中...</div>;
      }
      
      return (
        <div style={style}>
          <OptimizedMessage
            message={messages[index]}
            currentUserId={currentUserId}
          />
        </div>
      );
    },
    [messages, currentUserId, isItemLoaded]
  );
  
  return (
    <InfiniteLoader
      isItemLoaded={isItemLoaded}
      itemCount={itemCount}
      loadMoreItems={loadMoreItems}
    >
      {({ onItemsRendered, ref }) => (
        <List
          ref={ref}
          height={containerHeight}
          itemCount={itemCount}
          itemSize={80}
          onItemsRendered={onItemsRendered}
          width="100%"
        >
          {Item}
        </List>
      )}
    </InfiniteLoader>
  );
};

/**
 * 输入框组件 - 带防抖
 */
export const OptimizedInput = memo(({ 
  onSend,
  placeholder = "输入消息...",
  maxLength = 1000
}) => {
  const [value, setValue] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const inputRef = useRef();
  
  // 防抖的输入状态更新
  const updateTypingStatus = useMemo(
    () => debounce((typing) => {
      setIsTyping(typing);
    }, 300),
    []
  );
  
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    
    if (newValue.length <= maxLength) {
      setValue(newValue);
      updateTypingStatus(true);
      
      setTimeout(() => {
        updateTypingStatus(false);
      }, 1000);
    }
  }, [maxLength, updateTypingStatus]);
  
  const handleSend = useCallback(() => {
    const trimmedValue = value.trim();
    
    if (trimmedValue) {
      onSend(trimmedValue);
      setValue('');
      inputRef.current?.focus();
    }
  }, [value, onSend]);
  
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);
  
  return (
    <div className="input-container">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        className="message-input"
        rows={3}
      />
      <div className="input-footer">
        <span className="char-count">
          {value.length}/{maxLength}
        </span>
        {isTyping && <span className="typing-indicator">正在输入...</span>}
        <button 
          onClick={handleSend}
          disabled={!value.trim()}
          className="send-button"
        >
          发送
        </button>
      </div>
    </div>
  );
});

OptimizedInput.displayName = 'OptimizedInput';

// 导出所有组件
export default {
  OptimizedMessage,
  OptimizedUserItem,
  VirtualizedMessageList,
  InfiniteMessageList,
  OptimizedInput
};