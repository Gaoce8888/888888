import { useRef, useCallback, useEffect, useState } from 'react';
import logger from '../utils/logger';

/**
 * 性能追踪Hook
 * 用于监控组件渲染和操作性能
 */
export const usePerformanceTracking = (componentName) => {
  const metricsRef = useRef({
    renders: 0,
    actions: {},
    measurements: [],
    marks: new Map()
  });
  
  const [summary, setSummary] = useState({
    renders: 0,
    avgRenderTime: 0,
    actions: {}
  });
  
  // 组件渲染追踪
  useEffect(() => {
    const startTime = performance.now();
    metricsRef.current.renders++;
    
    return () => {
      const renderTime = performance.now() - startTime;
      metricsRef.current.measurements.push({
        type: 'render',
        duration: renderTime,
        timestamp: Date.now()
      });
      
      // 保持最近100次测量
      if (metricsRef.current.measurements.length > 100) {
        metricsRef.current.measurements.shift();
      }
      
      // 更新摘要
      updateSummary();
    };
  });
  
  // 追踪操作
  const trackAction = useCallback((actionName, metadata = {}) => {
    const startTime = performance.now();
    const markName = `${componentName}-${actionName}-${Date.now()}`;
    
    performance.mark(markName);
    metricsRef.current.marks.set(markName, { actionName, startTime, metadata });
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 记录操作指标
      if (!metricsRef.current.actions[actionName]) {
        metricsRef.current.actions[actionName] = {
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          minDuration: Infinity,
          maxDuration: 0
        };
      }
      
      const actionMetrics = metricsRef.current.actions[actionName];
      actionMetrics.count++;
      actionMetrics.totalDuration += duration;
      actionMetrics.avgDuration = actionMetrics.totalDuration / actionMetrics.count;
      actionMetrics.minDuration = Math.min(actionMetrics.minDuration, duration);
      actionMetrics.maxDuration = Math.max(actionMetrics.maxDuration, duration);
      
      // 记录测量
      metricsRef.current.measurements.push({
        type: 'action',
        name: actionName,
        duration,
        timestamp: Date.now(),
        metadata
      });
      
      // 清理性能标记
      performance.clearMarks(markName);
      metricsRef.current.marks.delete(markName);
      
      // 更新摘要
      updateSummary();
      
      return duration;
    };
  }, [componentName]);
  
  // 异步操作追踪
  const trackAsyncAction = useCallback(async (actionName, asyncFn, metadata = {}) => {
    const endTracking = trackAction(actionName, metadata);
    
    try {
      const result = await asyncFn();
      endTracking();
      return result;
    } catch (error) {
      endTracking();
      throw error;
    }
  }, [trackAction]);
  
  // 更新摘要
  const updateSummary = useCallback(() => {
    const renderMeasurements = metricsRef.current.measurements.filter(m => m.type === 'render');
    const avgRenderTime = renderMeasurements.length > 0
      ? renderMeasurements.reduce((sum, m) => sum + m.duration, 0) / renderMeasurements.length
      : 0;
    
    setSummary({
      renders: metricsRef.current.renders,
      avgRenderTime,
      actions: { ...metricsRef.current.actions }
    });
  }, []);
  
  // 获取详细指标
  const getMetrics = useCallback(() => {
    const metrics = metricsRef.current;
    const renderMeasurements = metrics.measurements.filter(m => m.type === 'render');
    const actionMeasurements = metrics.measurements.filter(m => m.type === 'action');
    
    return {
      component: componentName,
      renders: metrics.renders,
      renderMetrics: {
        count: renderMeasurements.length,
        avgDuration: renderMeasurements.length > 0
          ? renderMeasurements.reduce((sum, m) => sum + m.duration, 0) / renderMeasurements.length
          : 0,
        measurements: renderMeasurements.slice(-10) // 最近10次
      },
      actions: metrics.actions,
      recentActions: actionMeasurements.slice(-20), // 最近20个操作
      timestamp: Date.now()
    };
  }, [componentName]);
  
  // 重置指标
  const resetMetrics = useCallback(() => {
    metricsRef.current = {
      renders: 0,
      actions: {},
      measurements: [],
      marks: new Map()
    };
    setSummary({
      renders: 0,
      avgRenderTime: 0,
      actions: {}
    });
  }, []);
  
  // 导出到控制台
  const logMetrics = useCallback(() => {
    const metrics = getMetrics();
    console.group(`🚀 Performance Metrics: ${componentName}`);
    logger.debug('📊 Summary:', {
      renders: metrics.renders,
      avgRenderTime: `${metrics.renderMetrics.avgDuration.toFixed(2)}ms`
    });
    console.table(metrics.actions);
    console.groupEnd();
  }, [componentName, getMetrics]);
  
  return {
    trackAction,
    trackAsyncAction,
    getMetrics,
    resetMetrics,
    logMetrics,
    summary
  };
};

/**
 * 自动性能报告Hook
 */
export const useAutoPerformanceReport = (interval = 60000) => {
  const [report, setReport] = useState({});
  const trackersRef = useRef(new Map());
  
  // 注册追踪器
  const registerTracker = useCallback((name, tracker) => {
    trackersRef.current.set(name, tracker);
  }, []);
  
  // 注销追踪器
  const unregisterTracker = useCallback((name) => {
    trackersRef.current.delete(name);
  }, []);
  
  // 生成报告
  const generateReport = useCallback(() => {
    const report = {};
    
    trackersRef.current.forEach((tracker, name) => {
      report[name] = tracker.getMetrics();
    });
    
    setReport(report);
    return report;
  }, []);
  
  // 定期生成报告
  useEffect(() => {
    const intervalId = setInterval(() => {
      const report = generateReport();
      
      // 开发环境下输出到控制台
      if (process.env.NODE_ENV === 'development') {
        console.group('🚀 Performance Report');
        Object.entries(report).forEach(([name, metrics]) => {
          console.group(name);
          logger.debug('Renders:', metrics.renders);
          logger.debug('Avg Render Time:', `${metrics.renderMetrics.avgDuration.toFixed(2)}ms`);
          console.table(metrics.actions);
          console.groupEnd();
        });
        console.groupEnd();
      }
    }, interval);
    
    return () => clearInterval(intervalId);
  }, [interval, generateReport]);
  
  return {
    registerTracker,
    unregisterTracker,
    generateReport,
    report
  };
};

/**
 * 渲染性能Hook
 */
export const useRenderPerformance = (componentName) => {
  const renderCount = useRef(0);
  const renderTimes = useRef([]);
  const [stats, setStats] = useState({
    renderCount: 0,
    avgRenderTime: 0,
    lastRenderTime: 0
  });
  
  useEffect(() => {
    renderCount.current++;
    const startTime = performance.now();
    
    // 使用 requestAnimationFrame 确保在渲染后测量
    requestAnimationFrame(() => {
      const renderTime = performance.now() - startTime;
      renderTimes.current.push(renderTime);
      
      // 保持最近50次渲染时间
      if (renderTimes.current.length > 50) {
        renderTimes.current.shift();
      }
      
      const avgRenderTime = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;
      
      setStats({
        renderCount: renderCount.current,
        avgRenderTime,
        lastRenderTime: renderTime
      });
      
      // 性能警告
      if (renderTime > 16.67) { // 超过60fps的帧时间
        logger.warn(`[Performance] ${componentName} render took ${renderTime.toFixed(2)}ms`);
      }
    });
  });
  
  return stats;
};

/**
 * 内存使用Hook
 */
export const useMemoryUsage = (interval = 5000) => {
  const [memory, setMemory] = useState({
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0,
    usage: 0
  });
  
  useEffect(() => {
    if (!performance.memory) {
      logger.warn('Performance.memory is not available');
      return;
    }
    
    const updateMemory = () => {
      const memoryInfo = performance.memory;
      const usage = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;
      
      setMemory({
        usedJSHeapSize: memoryInfo.usedJSHeapSize,
        totalJSHeapSize: memoryInfo.totalJSHeapSize,
        jsHeapSizeLimit: memoryInfo.jsHeapSizeLimit,
        usage
      });
      
      // 内存警告
      if (usage > 90) {
        logger.warn(`[Memory] High memory usage: ${usage.toFixed(2)}%`);
      }
    };
    
    updateMemory();
    const intervalId = setInterval(updateMemory, interval);
    
    return () => clearInterval(intervalId);
  }, [interval]);
  
  return memory;
};

/**
 * FPS监控Hook
 */
export const useFPSMonitor = () => {
  const [fps, setFPS] = useState(60);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  
  useEffect(() => {
    let rafId;
    
    const measureFPS = () => {
      frameCount.current++;
      const currentTime = performance.now();
      const delta = currentTime - lastTime.current;
      
      if (delta >= 1000) {
        const currentFPS = Math.round((frameCount.current * 1000) / delta);
        setFPS(currentFPS);
        
        frameCount.current = 0;
        lastTime.current = currentTime;
        
        // FPS警告
        if (currentFPS < 30) {
          logger.warn(`[FPS] Low frame rate: ${currentFPS} FPS`);
        }
      }
      
      rafId = requestAnimationFrame(measureFPS);
    };
    
    rafId = requestAnimationFrame(measureFPS);
    
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);
  
  return fps;
};