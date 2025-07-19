/**
 * 企业级日志系统
 * 生产环境下禁用console，使用专业日志服务
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

class Logger {
  constructor() {
    this.level = process.env.NODE_ENV === 'production' 
      ? LOG_LEVELS.WARN 
      : LOG_LEVELS.DEBUG;
    
    this.buffer = [];
    this.maxBufferSize = 100;
    
    // 生产环境禁用console
    if (process.env.NODE_ENV === 'production') {
      this.disableConsole();
    }
    
    // 初始化远程日志服务
    this.initRemoteLogging();
  }
  
  disableConsole() {
    // 保存原始console方法
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };
    
    // 重写console方法
    console.log = () => {};
    console.error = (...args) => this.error(...args);
    console.warn = (...args) => this.warn(...args);
    console.info = () => {};
    console.debug = () => {};
  }
  
  initRemoteLogging() {
    // 初始化Sentry
    if (process.env.REACT_APP_SENTRY_DSN) {
      import('@sentry/react').then(Sentry => {
        Sentry.init({
          dsn: process.env.REACT_APP_SENTRY_DSN,
          environment: process.env.NODE_ENV,
          integrations: [
            new Sentry.BrowserTracing(),
            new Sentry.Replay()
          ],
          tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,
        });
        
        this.sentry = Sentry;
      });
    }
  }
  
  log(level, message, data = {}) {
    if (level < this.level) return;
    
    const logEntry = {
      level: Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level),
      message,
      data,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      userId: this.getUserId()
    };
    
    // 添加到缓冲区
    this.buffer.push(logEntry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
    
    // 发送到远程服务
    this.sendToRemote(logEntry);
    
    // 开发环境输出到控制台
    if (process.env.NODE_ENV !== 'production' && this.originalConsole) {
      const method = logEntry.level.toLowerCase();
      const consoleMethod = this.originalConsole[method] || this.originalConsole.log;
      consoleMethod(`[${logEntry.level}]`, message, data);
    }
  }
  
  debug(message, data) {
    this.log(LOG_LEVELS.DEBUG, message, data);
  }
  
  info(message, data) {
    this.log(LOG_LEVELS.INFO, message, data);
  }
  
  warn(message, data) {
    this.log(LOG_LEVELS.WARN, message, data);
  }
  
  error(message, error) {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error;
    
    this.log(LOG_LEVELS.ERROR, message, errorData);
    
    // 发送到Sentry
    if (this.sentry && error instanceof Error) {
      this.sentry.captureException(error, {
        contexts: {
          extra: {
            message
          }
        }
      });
    }
  }
  
  fatal(message, error) {
    this.log(LOG_LEVELS.FATAL, message, error);
    
    // 致命错误立即发送
    this.flush();
  }
  
  sendToRemote(logEntry) {
    // 批量发送以提高性能
    if (!this.sendTimer) {
      this.sendTimer = setTimeout(() => {
        this.flushToRemote();
      }, 1000);
    }
  }
  
  async flushToRemote() {
    if (this.buffer.length === 0) return;
    
    const logs = [...this.buffer];
    this.buffer = [];
    
    try {
      // 发送到日志服务器
      if (process.env.REACT_APP_LOG_ENDPOINT) {
        await fetch(process.env.REACT_APP_LOG_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.REACT_APP_LOG_API_KEY
          },
          body: JSON.stringify({ logs })
        });
      }
    } catch (error) {
      // 日志发送失败，保存到本地
      this.saveToLocal(logs);
    }
    
    this.sendTimer = null;
  }
  
  saveToLocal(logs) {
    try {
      const existingLogs = JSON.parse(localStorage.getItem('failed_logs') || '[]');
      const allLogs = [...existingLogs, ...logs].slice(-1000); // 最多保存1000条
      localStorage.setItem('failed_logs', JSON.stringify(allLogs));
    } catch (error) {
      // 忽略存储错误
    }
  }
  
  getUserId() {
    // 从状态管理或认证服务获取用户ID
    return window.__USER_ID__ || 'anonymous';
  }
  
  setUserId(userId) {
    window.__USER_ID__ = userId;
    
    // 同步到Sentry
    if (this.sentry) {
      this.sentry.setUser({ id: userId });
    }
  }
  
  // 性能日志
  logPerformance(metric) {
    this.info('Performance metric', {
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags
    });
    
    // 发送到性能监控服务
    if (window.gtag) {
      window.gtag('event', 'performance', {
        event_category: 'Performance',
        event_label: metric.name,
        value: metric.value
      });
    }
  }
  
  // 用户行为日志
  logUserAction(action, data) {
    this.info('User action', {
      action,
      ...data,
      timestamp: Date.now()
    });
    
    // 发送到分析服务
    if (window.gtag) {
      window.gtag('event', action, {
        event_category: 'User Action',
        ...data
      });
    }
  }
  
  // 错误边界日志
  logErrorBoundary(error, errorInfo) {
    this.error('React Error Boundary', {
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      stack: error.stack
    });
  }
  
  // 获取日志历史
  getLogHistory() {
    return [...this.buffer];
  }
  
  // 清空日志
  clear() {
    this.buffer = [];
  }
  
  // 强制发送所有日志
  flush() {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
    
    this.flushToRemote();
  }
  
  // 创建子日志器
  createLogger(context) {
    return {
      debug: (message, data) => this.debug(`[${context}] ${message}`, data),
      info: (message, data) => this.info(`[${context}] ${message}`, data),
      warn: (message, data) => this.warn(`[${context}] ${message}`, data),
      error: (message, error) => this.error(`[${context}] ${message}`, error)
    };
  }
}

// 单例实例
const logger = new Logger();

// 监听全局错误
window.addEventListener('error', (event) => {
  logger.error('Global error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', {
    reason: event.reason,
    promise: event.promise
  });
});

// 页面卸载时发送剩余日志
window.addEventListener('beforeunload', () => {
  logger.flush();
});

export default logger;

// 导出便捷方法
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
export const logPerformance = logger.logPerformance.bind(logger);
export const logUserAction = logger.logUserAction.bind(logger);