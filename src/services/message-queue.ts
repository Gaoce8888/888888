import EventEmitter from 'eventemitter3';

export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

interface QueueItem<T> {
  data: T;
  priority: MessagePriority;
  attempts: number;
}

export class MessageQueue<T = unknown> extends EventEmitter<
  'enqueue' | 'processMessage'
> {
  private queue: QueueItem<T>[] = [];
  private maxQueueSize: number;
  private retryAttempts: number;
  private retryDelay: number;
  private processing = false;
  constructor({
    maxQueueSize = 1000,
    retryAttempts = 3,
    retryDelay = 1000,
  } = {}) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.retryAttempts = retryAttempts;
    this.retryDelay = retryDelay;
  }

  enqueue(data: T, priority: MessagePriority = MessagePriority.NORMAL) {
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('Queue is full, dropping message');
      return;
    }
    const item: QueueItem<T> = { data, priority, attempts: 0 };
    this.queue.push(item);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.emit('enqueue', data);
    this.process();
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length) {
      const item = this.queue.shift();
      if (!item) break;
      try {
        await new Promise<void>((resolve, reject) => {
          this.emit('processMessage', item.data, (res: { success: boolean }) => {
            res.success ? resolve() : reject(new Error('Processing failed'));
          });
        });
      } catch (err) {
        item.attempts += 1;
        if (item.attempts <= this.retryAttempts) {
          setTimeout(() => {
            this.queue.unshift(item);
            this.process();
          }, this.retryDelay);
        } else {
          console.error('Message dropped after retries', err);
        }
      }
    }
    this.processing = false;
  }

  getStats() {
    return {
      size: this.queue.length,
    };
  }
}

export const messageQueue = new MessageQueue();