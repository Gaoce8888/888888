import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import EnhancedApp from './EnhancedApp';
import { reportWebVitals } from './utils/performance';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <EnhancedApp />
  </React.StrictMode>
);

// 性能监控
reportWebVitals((metric) => {
  console.log('[Web Vitals]', metric);
  
  // 在生产环境中，这里可以将指标发送到分析服务
  if (process.env.NODE_ENV === 'production') {
    // 发送到分析服务
    // analytics.send(metric);
  }
});

// 开发环境性能监控
if (process.env.NODE_ENV === 'development') {
  // 监控React渲染
  if (window.React && window.React.Profiler) {
    console.log('[React Profiler] Enabled');
  }
  
  // 性能面板
  window.performanceMonitor = {
    getMetrics: () => performance.getEntriesByType('measure'),
    clearMetrics: () => performance.clearMeasures(),
    memory: () => performance.memory
  };
}