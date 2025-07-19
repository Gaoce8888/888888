/**
 * 性能优化实用工具
 */

/**
 * Web Vitals 报告
 */
export const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

/**
 * 性能观察器
 */
export class PerformanceObserver {
  constructor() {
    this.observers = new Map();
    this.metrics = {
      navigation: {},
      resource: [],
      paint: {},
      measure: []
    };
  }

  /**
   * 开始观察
   */
  observe() {
    // 导航计时
    if ('PerformanceNavigationTiming' in window) {
      const navigationObserver = new window.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.metrics.navigation = {
            domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
            loadComplete: entry.loadEventEnd - entry.loadEventStart,
            domInteractive: entry.domInteractive - entry.fetchStart,
            requestTime: entry.responseEnd - entry.requestStart
          };
        }
      });
      
      navigationObserver.observe({ entryTypes: ['navigation'] });
      this.observers.set('navigation', navigationObserver);
    }

    // 资源计时
    if ('PerformanceResourceTiming' in window) {
      const resourceObserver = new window.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.metrics.resource.push({
            name: entry.name,
            type: entry.initiatorType,
            duration: entry.duration,
            size: entry.transferSize,
            cached: entry.transferSize === 0
          });
        }
      });
      
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.set('resource', resourceObserver);
    }

    // 绘制计时
    if ('PerformancePaintTiming' in window) {
      const paintObserver = new window.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.metrics.paint[entry.name] = entry.startTime;
        }
      });
      
      paintObserver.observe({ entryTypes: ['paint'] });
      this.observers.set('paint', paintObserver);
    }
  }

  /**
   * 停止观察
   */
  disconnect() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return this.metrics;
  }

  /**
   * 生成报告
   */
  generateReport() {
    const report = {
      ...this.metrics,
      summary: {
        totalResources: this.metrics.resource.length,
        cachedResources: this.metrics.resource.filter(r => r.cached).length,
        totalResourceTime: this.metrics.resource.reduce((sum, r) => sum + r.duration, 0),
        totalResourceSize: this.metrics.resource.reduce((sum, r) => sum + (r.size || 0), 0)
      }
    };

    return report;
  }
}

/**
 * 延迟加载工具
 */
export const lazyLoad = (importFn, delay = 0) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(importFn());
    }, delay);
  });
};

/**
 * 预加载资源
 */
export const preloadResource = (url, type = 'fetch') => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = url;
  link.as = type;
  document.head.appendChild(link);
};

/**
 * 预连接到域名
 */
export const preconnect = (url) => {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = url;
  document.head.appendChild(link);
};

/**
 * 请求空闲回调
 */
export const requestIdleCallback = window.requestIdleCallback || 
  function(cb) {
    const start = Date.now();
    return setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
      });
    }, 1);
  };

/**
 * 取消空闲回调
 */
export const cancelIdleCallback = window.cancelIdleCallback || 
  function(id) {
    clearTimeout(id);
  };

/**
 * 批量任务处理器
 */
export class TaskScheduler {
  constructor(options = {}) {
    this.tasks = [];
    this.running = false;
    this.options = {
      batchSize: options.batchSize || 5,
      delay: options.delay || 16,
      priority: options.priority || 'normal'
    };
  }

  /**
   * 添加任务
   */
  addTask(task, priority = 'normal') {
    this.tasks.push({ task, priority, timestamp: Date.now() });
    
    if (!this.running) {
      this.processTasks();
    }
  }

  /**
   * 处理任务
   */
  async processTasks() {
    this.running = true;

    while (this.tasks.length > 0) {
      // 按优先级排序
      this.tasks.sort((a, b) => {
        const priorityWeight = { high: 3, normal: 2, low: 1 };
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      });

      // 获取一批任务
      const batch = this.tasks.splice(0, this.options.batchSize);

      // 执行任务
      await Promise.all(batch.map(({ task }) => {
        try {
          return task();
        } catch (error) {
          console.error('Task execution failed:', error);
        }
      }));

      // 延迟以避免阻塞主线程
      await new Promise(resolve => setTimeout(resolve, this.options.delay));
    }

    this.running = false;
  }

  /**
   * 清空任务
   */
  clear() {
    this.tasks = [];
  }
}

/**
 * 内存管理器
 */
export class MemoryManager {
  constructor(threshold = 0.9) {
    this.threshold = threshold;
    this.callbacks = new Set();
    this.monitoring = false;
  }

  /**
   * 开始监控
   */
  startMonitoring() {
    if (!performance.memory) {
      console.warn('Performance.memory API not available');
      return;
    }

    this.monitoring = true;
    this.checkMemory();
  }

  /**
   * 检查内存
   */
  checkMemory() {
    if (!this.monitoring) return;

    const memory = performance.memory;
    const usage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

    if (usage > this.threshold) {
      this.triggerCleanup();
    }

    // 定期检查
    requestIdleCallback(() => this.checkMemory());
  }

  /**
   * 触发清理
   */
  triggerCleanup() {
    console.warn(`Memory usage high: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)}MB`);
    
    this.callbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Memory cleanup callback failed:', error);
      }
    });

    // 强制垃圾回收（如果可用）
    if (window.gc) {
      window.gc();
    }
  }

  /**
   * 注册清理回调
   */
  onHighMemory(callback) {
    this.callbacks.add(callback);
    
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    this.monitoring = false;
  }
}

/**
 * 图片懒加载
 */
export class ImageLazyLoader {
  constructor(options = {}) {
    this.options = {
      rootMargin: options.rootMargin || '50px',
      threshold: options.threshold || 0.01,
      placeholder: options.placeholder || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=='
    };
    
    this.observer = null;
    this.init();
  }

  init() {
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadImage(entry.target);
          }
        });
      }, {
        rootMargin: this.options.rootMargin,
        threshold: this.options.threshold
      });
    }
  }

  observe(img) {
    if (this.observer) {
      // 设置占位图
      img.src = this.options.placeholder;
      
      // 保存真实图片地址
      if (img.dataset.src) {
        this.observer.observe(img);
      }
    } else {
      // 降级处理
      this.loadImage(img);
    }
  }

  loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;

    // 预加载图片
    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = src;
      img.classList.add('loaded');
      
      if (this.observer) {
        this.observer.unobserve(img);
      }
    };
    
    tempImg.src = src;
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

/**
 * 计算函数执行时间
 */
export const measureExecutionTime = (fn, name = 'Function') => {
  return function(...args) {
    const start = performance.now();
    const result = fn.apply(this, args);
    const end = performance.now();
    
    console.log(`[Performance] ${name} execution time: ${(end - start).toFixed(2)}ms`);
    
    return result;
  };
};

/**
 * 异步函数执行时间测量
 */
export const measureAsyncExecutionTime = (fn, name = 'AsyncFunction') => {
  return async function(...args) {
    const start = performance.now();
    
    try {
      const result = await fn.apply(this, args);
      const end = performance.now();
      
      console.log(`[Performance] ${name} execution time: ${(end - start).toFixed(2)}ms`);
      
      return result;
    } catch (error) {
      const end = performance.now();
      console.log(`[Performance] ${name} failed after: ${(end - start).toFixed(2)}ms`);
      throw error;
    }
  };
};