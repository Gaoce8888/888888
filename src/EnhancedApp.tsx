import React, { useEffect } from 'react';
import { messageQueue, MessagePriority } from './services/message-queue';
import { ConnectionPool } from './services/connection-pool';
import { LRUCache } from './services/lru-cache';
import { useOptimizedState } from './hooks/useOptimizedState';
import { VirtualizedMessageList } from './components/OptimizedComponents';
import PerformanceMonitor from './components/PerformanceMonitor';
import ErrorBoundary from './components/ErrorBoundary';

// Persistent message cache (module-level singleton)
const messageCache = new LRUCache<string, Message>(1000);

interface Message {
  id: string;
  content: string;
  from: string;
}

export default function EnhancedApp() {
  const [messages, setMessages] = useOptimizedState<Message[]>(() => messageCache.values());

  const poolRef = React.useRef<ConnectionPool>();
  if (!poolRef.current) {
    poolRef.current = new ConnectionPool(
      ['ws://localhost:6006/ws', 'wss://backup.local/ws'],
      {
        userId: 'kf001',
        userType: 'kefu',
        enableEnterpriseFeatures: true,
        reconnectInterval: 1000,
        maxReconnectAttempts: 10,
      }
    );
  }
  const wsPool = poolRef.current;

  useEffect(() => {
    function handleIncoming(msg: Message) {
      messageCache.set(msg.id, msg);
      setMessages(messageCache.values());
    }

    wsPool.on('message', handleIncoming);

    const processHandler = (msg: Message, done: (res: { success: boolean }) => void) => {
      wsPool.send(msg);
      done({ success: true });
    };
    messageQueue.on('processMessage', processHandler);

    // Example message send via queue
    messageQueue.enqueue(
      { id: Date.now().toString(), content: 'Hello 👋', from: 'kf001' },
      MessagePriority.NORMAL
    );

    return () => {
      wsPool.off('message', handleIncoming);
      messageQueue.off('processMessage', processHandler);
      wsPool.close();
    };
  }, [wsPool]);

  return (
    <ErrorBoundary>
      <PerformanceMonitor name="ChatWindow">
        <VirtualizedMessageList
          messages={messages}
          currentUserId="kf001"
          containerHeight={500}
          itemHeight={80}
        />
      </PerformanceMonitor>
    </ErrorBoundary>
  );
}