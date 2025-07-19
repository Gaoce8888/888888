import React, { useEffect, useState } from 'react';
import { getWebSocketClient, WebSocketClient } from './websocket-client';
import { messageQueue, MessagePriority } from './services/message-queue';
import { VirtualizedMessageList } from './components/OptimizedComponents';
import PerformanceMonitor from './components/PerformanceMonitor';
import ErrorBoundary from './components/ErrorBoundary';

interface Message {
  id: string;
  content: string;
  from: string;
}

export default function EnhancedApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [wsClient] = useState<WebSocketClient>(() =>
    getWebSocketClient('ws://localhost:6006/ws', {
      userId: 'kf001',
      userType: 'kefu',
      enableEnterpriseFeatures: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
    })
  );

  useEffect(() => {
    function handleIncoming(msg: Message) {
      setMessages((prev) => [...prev, msg]);
    }

    wsClient.on('message', handleIncoming);

    const processHandler = (msg: Message, done: (res: { success: boolean }) => void) => {
      wsClient.send(msg);
      done({ success: true });
    };
    messageQueue.on('processMessage', processHandler);

    // Example message send via queue
    messageQueue.enqueue(
      { id: Date.now().toString(), content: 'Hello 👋', from: 'kf001' },
      MessagePriority.NORMAL
    );

    return () => {
      wsClient.off('message', handleIncoming);
      messageQueue.off('processMessage', processHandler);
      wsClient.close();
    };
  }, [wsClient]);

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