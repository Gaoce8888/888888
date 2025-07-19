import React, { useEffect, useRef, useState, memo } from 'react';
import { reportWebVitals } from '../utils/performance';

/**
 * 性能监控组件
 * 监控子组件的渲染性能和资源使用
 */
export const PerformanceMonitor = ({ 
  children, 
  name = 'Component',
  threshold = 16.67, // 60fps对应的帧时间
  onMetrics,
  showOverlay = false
}) => {
  const [metrics, setMetrics] = useState({
    renderCount: 0,
    renderTime: 0,
    avgRenderTime: 0,
    maxRenderTime: 0,
    minRenderTime: Infinity,
    memoryUsage: 0,
    fps: 60
  });
  
  const renderTimesRef = useRef([]);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const rafIdRef = useRef();
  
  // 测量渲染时间
  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const renderTime = performance.now() - startTime;
      renderTimesRef.current.push(renderTime);
      
      // 保持最近100次渲染时间
      if (renderTimesRef.current.length > 100) {
        renderTimesRef.current.shift();
      }
      
      // 更新统计
      updateMetrics(renderTime);
    };
  });
  
  // 更新性能指标
  const updateMetrics = (renderTime) => {
    const renderTimes = renderTimesRef.current;
    const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
    const maxRenderTime = Math.max(...renderTimes);
    const minRenderTime = Math.min(...renderTimes);
    
    // 获取内存使用（如果支持）
    let memoryUsage = 0;
    if (performance.memory) {
      memoryUsage = performance.memory.usedJSHeapSize / 1048576; // MB
    }
    
    const newMetrics = {
      renderCount: renderTimes.length,
      renderTime,
      avgRenderTime,
      maxRenderTime,
      minRenderTime,
      memoryUsage,
      fps: metrics.fps
    };
    
    setMetrics(newMetrics);
    
    // 触发回调
    if (onMetrics) {
      onMetrics({
        component: name,
        ...newMetrics,
        timestamp: Date.now()
      });
    }
    
    // 性能警告
    if (renderTime > threshold) {
      console.warn(`[PerformanceMonitor] ${name} render time (${renderTime.toFixed(2)}ms) exceeded threshold (${threshold}ms)`);
    }
  };
  
  // FPS监控
  useEffect(() => {
    const measureFPS = () => {
      frameCountRef.current++;
      
      const currentTime = performance.now();
      const deltaTime = currentTime - lastFrameTimeRef.current;
      
      if (deltaTime >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / deltaTime);
        setMetrics(prev => ({ ...prev, fps }));
        
        frameCountRef.current = 0;
        lastFrameTimeRef.current = currentTime;
      }
      
      rafIdRef.current = requestAnimationFrame(measureFPS);
    };
    
    rafIdRef.current = requestAnimationFrame(measureFPS);
    
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);
  
  // 性能标记
  useEffect(() => {
    performance.mark(`${name}-start`);
    
    return () => {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      // 获取测量结果
      const measures = performance.getEntriesByName(name);
      if (measures.length > 0) {
        const measure = measures[measures.length - 1];
        console.log(`[PerformanceMonitor] ${name} total time: ${measure.duration.toFixed(2)}ms`);
      }
    };
  }, [name]);
  
  return (
    <>
      {children}
      {showOverlay && <PerformanceOverlay metrics={metrics} name={name} />}
    </>
  );
};

/**
 * 性能指标覆盖层
 */
const PerformanceOverlay = memo(({ metrics, name }) => {
  const getPerformanceColor = (value, thresholds) => {
    if (value <= thresholds.good) return '#4caf50';
    if (value <= thresholds.warning) return '#ff9800';
    return '#f44336';
  };
  
  const renderTimeColor = getPerformanceColor(metrics.avgRenderTime, {
    good: 16.67,
    warning: 33.34
  });
  
  const fpsColor = getPerformanceColor(60 - metrics.fps, {
    good: 0,
    warning: 30
  });
  
  return (
    <div style={{
      position: 'fixed',
      top: 10,
      right: 10,
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999,
      minWidth: '200px'
    }}>
      <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>
        {name} Performance
      </div>
      <div>
        FPS: <span style={{ color: fpsColor }}>{metrics.fps}</span>
      </div>
      <div>
        Render Time: <span style={{ color: renderTimeColor }}>
          {metrics.renderTime.toFixed(2)}ms
        </span>
      </div>
      <div>
        Avg Time: {metrics.avgRenderTime.toFixed(2)}ms
      </div>
      <div>
        Max Time: {metrics.maxRenderTime.toFixed(2)}ms
      </div>
      <div>
        Render Count: {metrics.renderCount}
      </div>
      {metrics.memoryUsage > 0 && (
        <div>
          Memory: {metrics.memoryUsage.toFixed(2)}MB
        </div>
      )}
    </div>
  );
});

PerformanceOverlay.displayName = 'PerformanceOverlay';

/**
 * 性能分析钩子
 */
export const usePerformanceMonitor = (componentName) => {
  const [metrics, setMetrics] = useState({
    renderCount: 0,
    totalRenderTime: 0,
    avgRenderTime: 0
  });
  
  const renderStartRef = useRef();
  const renderCountRef = useRef(0);
  const totalRenderTimeRef = useRef(0);
  
  useEffect(() => {
    renderStartRef.current = performance.now();
    
    return () => {
      const renderTime = performance.now() - renderStartRef.current;
      renderCountRef.current++;
      totalRenderTimeRef.current += renderTime;
      
      const avgRenderTime = totalRenderTimeRef.current / renderCountRef.current;
      
      setMetrics({
        renderCount: renderCountRef.current,
        totalRenderTime: totalRenderTimeRef.current,
        avgRenderTime,
        lastRenderTime: renderTime
      });
      
      // 开发环境下输出性能日志
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Performance] ${componentName} - Render #${renderCountRef.current}: ${renderTime.toFixed(2)}ms (avg: ${avgRenderTime.toFixed(2)}ms)`);
      }
    };
  });
  
  return metrics;
};

/**
 * 性能报告组件
 */
export const PerformanceReport = ({ interval = 5000 }) => {
  const [report, setReport] = useState({
    vitals: {},
    customMetrics: {},
    timestamp: Date.now()
  });
  
  useEffect(() => {
    // 收集Web Vitals
    reportWebVitals((metric) => {
      setReport(prev => ({
        ...prev,
        vitals: {
          ...prev.vitals,
          [metric.name]: {
            value: metric.value,
            rating: metric.rating
          }
        }
      }));
    });
    
    // 定期生成报告
    const intervalId = setInterval(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      
      const customMetrics = {
        domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart,
        loadComplete: navigation?.loadEventEnd - navigation?.loadEventStart,
        resourceCount: resources.length,
        totalResourceSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
        totalResourceTime: resources.reduce((sum, r) => sum + r.duration, 0)
      };
      
      setReport(prev => ({
        ...prev,
        customMetrics,
        timestamp: Date.now()
      }));
      
      // 在控制台输出性能报告
      console.table({
        'Web Vitals': report.vitals,
        'Custom Metrics': customMetrics
      });
    }, interval);
    
    return () => clearInterval(intervalId);
  }, [interval, report.vitals]);
  
  return null; // 或者返回一个可视化的报告UI
};

/**
 * 批量性能监控
 */
export const BatchPerformanceMonitor = ({ children, onBatchMetrics }) => {
  const metricsRef = useRef(new Map());
  
  const handleMetrics = (metrics) => {
    metricsRef.current.set(metrics.component, metrics);
    
    // 批量报告
    if (onBatchMetrics) {
      const allMetrics = Array.from(metricsRef.current.values());
      onBatchMetrics(allMetrics);
    }
  };
  
  return React.Children.map(children, (child, index) => {
    if (React.isValidElement(child)) {
      return (
        <PerformanceMonitor
          name={child.props.name || `Component-${index}`}
          onMetrics={handleMetrics}
        >
          {child}
        </PerformanceMonitor>
      );
    }
    return child;
  });
};

export default PerformanceMonitor;