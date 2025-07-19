import React, { useRef, useState, useEffect, memo } from 'react';

interface Message {
  id: string;
  content: string; // Could be text, html, base64 img, etc.
  from: string;
  type?: 'text' | 'html' | 'image' | 'voice';
  meta?: Record<string, any>;
}

interface UserItemProps {
  id: string;
  name: string;
  avatar?: string;
}

export const OptimizedMessage = memo(({ message, isOwn }: { message: Message; isOwn: boolean }) => {
  const renderContent = () => {
    switch (message.type) {
      case 'html':
        return <div dangerouslySetInnerHTML={{ __html: message.content }} />;
      case 'image':
        return <img src={message.content} alt="img" style={{ maxWidth: '100%', borderRadius: 8 }} />;
      case 'voice':
        return (
          <audio controls>
            <source src={message.content} type={message.meta?.mimeType || 'audio/webm'} />
          </audio>
        );
      default:
        return <span>{message.content}</span>;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        padding: '4px 8px',
      }}
    >
      <div
        style={{
          background: isOwn ? '#DCF8C6' : '#fff',
          borderRadius: 8,
          padding: 8,
          maxWidth: '70%',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          wordBreak: 'break-word',
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
});

export const OptimizedUserItem = memo(({ id, name, avatar }: UserItemProps) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: 8 }}>
    {avatar && (
      <img src={avatar} alt={name} style={{ width: 32, height: 32, borderRadius: '50%', marginRight: 8 }} />
    )}
    <span>{name}</span>
  </div>
));

interface VirtualizedListProps {
  messages: Message[];
  currentUserId: string;
  containerHeight: number;
  itemHeight: number;
}

export function VirtualizedMessageList({
  messages,
  currentUserId,
  containerHeight,
  itemHeight,
}: VirtualizedListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = messages.length * itemHeight;
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(messages.length - 1, Math.floor((scrollTop + containerHeight) / itemHeight));
  const visibleMessages = messages.slice(startIndex, endIndex + 1);

  const offsetY = startIndex * itemHeight;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={containerRef} style={{ height: containerHeight, overflowY: 'auto' }}>
      <div style={{ position: 'relative', height: totalHeight }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {visibleMessages.map((m) => (
            <OptimizedMessage key={m.id} message={m} isOwn={m.from === currentUserId} />
          ))}
        </div>
      </div>
    </div>
  );
}