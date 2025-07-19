import { EnterpriseWebSocketClient, ConnectionState } from '../services/websocket-client';
import { ConnectionPool } from '../services/connection-pool';
import { NetworkMonitor } from '../services/network-monitor';
import { MessageQueue } from '../services/message-queue';

// Mock dependencies
jest.mock('../services/connection-pool');
jest.mock('../services/network-monitor');
jest.mock('../services/message-queue');

// Mock WebSocket
global.WebSocket = jest.fn();

describe('EnterpriseWebSocketClient', () => {
  let client;
  let mockWebSocket;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup WebSocket mock
    mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      readyState: WebSocket.OPEN
    };
    
    global.WebSocket.mockImplementation(() => mockWebSocket);
    
    // Create client instance
    client = new EnterpriseWebSocketClient('ws://localhost:6006/ws', {
      userId: 'test-user',
      userType: 'kefu',
      enableEnterpriseFeatures: true
    });
  });
  
  afterEach(() => {
    if (client) {
      client.close();
    }
  });
  
  describe('Connection Management', () => {
    test('should initialize with disconnected state', () => {
      expect(client.state).toBe(ConnectionState.DISCONNECTED);
    });
    
    test('should create WebSocket connection on connect', async () => {
      await client.connect();
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:6006/ws');
    });
    
    test('should handle connection success', async () => {
      const connectedSpy = jest.fn();
      client.on('connected', connectedSpy);
      
      await client.connect();
      
      // Simulate connection open
      mockWebSocket.onopen();
      
      expect(client.state).toBe(ConnectionState.CONNECTED);
      expect(connectedSpy).toHaveBeenCalled();
    });
    
    test('should handle connection failure', async () => {
      const errorSpy = jest.fn();
      client.on('error', errorSpy);
      
      await client.connect();
      
      // Simulate connection error
      const error = new Error('Connection failed');
      mockWebSocket.onerror(error);
      
      expect(client.metrics.errors).toBe(1);
    });
    
    test('should attempt reconnection on disconnect', () => {
      jest.useFakeTimers();
      
      client.connect();
      mockWebSocket.onopen();
      
      // Simulate disconnect
      mockWebSocket.onclose({ code: 1000, reason: 'Normal closure' });
      
      expect(client.state).toBe(ConnectionState.RECONNECTING);
      
      // Fast-forward time
      jest.advanceTimersByTime(1000);
      
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
      
      jest.useRealTimers();
    });
  });
  
  describe('Message Handling', () => {
    beforeEach(() => {
      client.connect();
      mockWebSocket.onopen();
    });
    
    test('should send messages when connected', async () => {
      const message = { type: 'test', content: 'Hello' };
      
      await client.send(message);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(client.metrics.messagesSent).toBe(1);
    });
    
    test('should queue messages when disconnected', async () => {
      client.state = ConnectionState.DISCONNECTED;
      
      const message = { type: 'test', content: 'Hello' };
      const promise = client.send(message);
      
      expect(mockWebSocket.send).not.toHaveBeenCalled();
      expect(MessageQueue.mock.instances[0].enqueue).toHaveBeenCalledWith(message);
    });
    
    test('should handle incoming messages', () => {
      const messageSpy = jest.fn();
      client.on('message', messageSpy);
      
      const message = { type: 'message', content: 'Hello', from: 'user1' };
      mockWebSocket.onmessage({ data: JSON.stringify(message) });
      
      expect(messageSpy).toHaveBeenCalledWith(message);
      expect(client.metrics.messagesReceived).toBe(1);
    });
    
    test('should handle malformed messages', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockWebSocket.onmessage({ data: 'invalid json' });
      
      expect(errorSpy).toHaveBeenCalled();
      expect(client.metrics.errors).toBe(1);
      
      errorSpy.mockRestore();
    });
  });
  
  describe('Heartbeat Mechanism', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      client.connect();
      mockWebSocket.onopen();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    test('should send heartbeat at intervals', () => {
      // Fast-forward time
      jest.advanceTimersByTime(30000);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ping"')
      );
    });
    
    test('should update latency on pong', () => {
      const timestamp = Date.now() - 50;
      const pong = { type: 'pong', timestamp };
      
      mockWebSocket.onmessage({ data: JSON.stringify(pong) });
      
      expect(client.metrics.latency.length).toBeGreaterThan(0);
    });
  });
  
  describe('Enterprise Features', () => {
    test('should initialize connection pool when enabled', () => {
      expect(ConnectionPool).toHaveBeenCalledWith(client);
    });
    
    test('should initialize network monitor when enabled', () => {
      expect(NetworkMonitor).toHaveBeenCalled();
    });
    
    test('should initialize message queue when enabled', () => {
      expect(MessageQueue).toHaveBeenCalledWith({
        maxQueueSize: 1000,
        retryAttempts: 3,
        retryDelay: 1000
      });
    });
    
    test('should not initialize enterprise features when disabled', () => {
      jest.clearAllMocks();
      
      const basicClient = new EnterpriseWebSocketClient('ws://localhost:6006/ws', {
        enableEnterpriseFeatures: false
      });
      
      expect(ConnectionPool).not.toHaveBeenCalled();
      expect(NetworkMonitor).not.toHaveBeenCalled();
      expect(MessageQueue).not.toHaveBeenCalled();
      
      basicClient.close();
    });
  });
  
  describe('Performance Metrics', () => {
    test('should track performance metrics', () => {
      const metrics = client.getPerformanceMetrics();
      
      expect(metrics).toMatchObject({
        connectionTime: expect.any(Number),
        messagesSent: expect.any(Number),
        messagesReceived: expect.any(Number),
        errors: expect.any(Number),
        reconnections: expect.any(Number),
        averageLatency: expect.any(Number),
        connectionState: expect.any(String),
        networkQuality: expect.any(Number)
      });
    });
    
    test('should calculate average latency correctly', () => {
      // Add some latency measurements
      client.metrics.latency = [10, 20, 30, 40, 50];
      
      const metrics = client.getPerformanceMetrics();
      
      expect(metrics.averageLatency).toBe(30);
    });
  });
  
  describe('Cleanup', () => {
    test('should clean up resources on close', () => {
      const removeAllListenersSpy = jest.spyOn(client, 'removeAllListeners');
      
      client.close();
      
      expect(mockWebSocket.close).toHaveBeenCalled();
      expect(removeAllListenersSpy).toHaveBeenCalled();
      expect(client.state).toBe(ConnectionState.DISCONNECTED);
    });
    
    test('should clear message callbacks on close', () => {
      // Add some callbacks
      client.messageCallbacks.set(1, { resolve: jest.fn(), reject: jest.fn() });
      client.messageCallbacks.set(2, { resolve: jest.fn(), reject: jest.fn() });
      
      client.close();
      
      expect(client.messageCallbacks.size).toBe(0);
    });
  });
});

describe('WebSocket Client Integration', () => {
  test('should handle full message flow', async () => {
    const client = new EnterpriseWebSocketClient('ws://localhost:6006/ws', {
      userId: 'test-user',
      userType: 'kefu'
    });
    
    const mockWs = {
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN
    };
    
    global.WebSocket.mockImplementation(() => mockWs);
    
    // Connect
    await client.connect();
    mockWs.onopen();
    
    // Send message
    const messagePromise = client.sendMessage({
      type: 'message',
      to: 'user123',
      content: 'Hello'
    });
    
    // Simulate ack
    const ack = { type: 'ack', messageId: 1, status: 'delivered' };
    mockWs.onmessage({ data: JSON.stringify(ack) });
    
    const result = await messagePromise;
    expect(result).toMatchObject({ status: 'delivered' });
    
    client.close();
  });
});