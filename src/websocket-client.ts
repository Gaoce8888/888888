import EventEmitter from 'eventemitter3';

export interface WebSocketClientOptions {
  userId: string;
  userType: string;
  enableEnterpriseFeatures?: boolean;
  reconnectInterval?: number; // ms
  maxReconnectAttempts?: number;
  heartbeatInterval?: number; // ms
  messageTimeout?: number; // ms
  priority?: 'low' | 'normal' | 'high';
}

export interface PerformanceMetrics {
  latency: number; // ms
  reconnectAttempts: number;
  uptime: number; // ms
}

export class WebSocketClient extends EventEmitter<
  'open' | 'close' | 'error' | 'message'
> {
  private url: string;
  private options: WebSocketClientOptions;
  private socket?: WebSocket;
  private reconnectAttempts = 0;
  private connectedAt = 0;
  private heartbeatTimer?: number;
  private latency = 0;

  constructor(url: string, options: WebSocketClientOptions) {
    super();
    this.url = url;
    this.options = {
      reconnectInterval: 2000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30_000,
      enableEnterpriseFeatures: true,
      messageTimeout: 10_000,
      ...options,
    };

    this.connect();
  }

  private connect() {
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.connectedAt = Date.now();
      this.emit('open');
      if (this.options.enableEnterpriseFeatures) {
        this.startHeartbeat();
      }
    });

    this.socket.addEventListener('message', (ev) => {
      this.emit('message', JSON.parse(ev.data));
    });

    this.socket.addEventListener('close', () => {
      this.emit('close');
      this.stopHeartbeat();
      if (this.shouldReconnect()) {
        setTimeout(() => this.connect(), this.options.reconnectInterval);
      }
    });

    this.socket.addEventListener('error', (ev) => {
      this.emit('error', ev);
      this.socket?.close();
    });
  }

  private shouldReconnect() {
    return (
      this.options.enableEnterpriseFeatures &&
      this.reconnectAttempts++ < (this.options.maxReconnectAttempts ?? 0)
    );
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      const start = Date.now();
      this.send({ type: 'ping' });
      const timeout = setTimeout(() => {
        // If pong not received in time, close to trigger reconnect.
        this.socket?.close();
      }, this.options.messageTimeout);

      const handlePong = () => {
        clearTimeout(timeout);
        this.latency = Date.now() - start;
        this.off('message', handlePong as any);
      };

      this.on('message', handlePong as any);
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  send(data: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not open. Message queued?');
    }
  }

  close() {
    this.stopHeartbeat();
    this.socket?.close();
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return {
      latency: this.latency,
      reconnectAttempts: this.reconnectAttempts,
      uptime: Date.now() - this.connectedAt,
    };
  }
}

export function getWebSocketClient(
  url: string,
  options: WebSocketClientOptions
) {
  return new WebSocketClient(url, options);
}