import EventEmitter from 'eventemitter3';
import { WebSocketClient, WebSocketClientOptions } from '../websocket-client';

export type ConnectionPoolEvents = 'open' | 'message' | 'error' | 'close' | 'switched';

export class ConnectionPool extends EventEmitter<ConnectionPoolEvents> {
  private urls: string[];
  private options: WebSocketClientOptions;
  private currentIndex = 0;
  private client: WebSocketClient;

  constructor(urls: string[], options: WebSocketClientOptions) {
    super();
    if (!urls.length) throw new Error('At least one websocket url required');
    this.urls = urls;
    this.options = options;
    this.client = this.createClient(this.urls[this.currentIndex]);
  }

  private createClient(url: string) {
    const c = new WebSocketClient(url, this.options);
    c.on('open', () => this.emit('open'));
    c.on('message', (msg) => this.emit('message', msg));
    c.on('error', (err) => this.emit('error', err));
    c.on('close', () => {
      this.emit('close');
      this.failover();
    });
    return c;
  }

  private failover() {
    if (this.currentIndex < this.urls.length - 1) {
      this.currentIndex += 1;
      this.emit('switched');
      this.client = this.createClient(this.urls[this.currentIndex]);
    } else {
      // Restart from first url after delay
      this.currentIndex = 0;
      setTimeout(() => {
        this.client = this.createClient(this.urls[this.currentIndex]);
      }, this.options.reconnectInterval ?? 2000);
    }
  }

  send(data: unknown) {
    this.client.send(data);
  }

  getPerformanceMetrics() {
    return this.client.getPerformanceMetrics();
  }

  close() {
    this.client.close();
  }
}