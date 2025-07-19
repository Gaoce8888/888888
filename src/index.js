import React from 'react';
import ReactDOM from 'react-dom/client';
import EnhancedApp from './EnhancedApp';

// 全局样式
import './styles/global.css';

// 开发环境性能监控
if (process.env.NODE_ENV === 'development') {
  // 性能监控工具
  window.performanceObserver = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.entryType === 'measure') {
        console.log(`[Performance] ${entry.name}: ${entry.duration.toFixed(2)}ms`);
      }
    });
  });
  
  window.performanceObserver.observe({ entryTypes: ['measure'] });
  
  // 内存监控
  if (performance.memory) {
    setInterval(() => {
      const memory = performance.memory;
      const used = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const total = Math.round(memory.totalJSHeapSize / 1024 / 1024);
      const limit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      
      if (used / limit > 0.8) {
        console.warn(`[Memory Warning] 内存使用率较高: ${used}MB / ${limit}MB (${((used/limit)*100).toFixed(1)}%)`);
      }
    }, 10000);
  }
}

// 创建React根节点
const root = ReactDOM.createRoot(document.getElementById('root'));

// 渲染应用
root.render(
  <React.StrictMode>
    <EnhancedApp />
  </React.StrictMode>
);

// 注册Service Worker（生产环境）
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// 全局错误处理
window.addEventListener('error', (event) => {
  console.error('全局错误:', event.error);
  // 这里可以发送错误到监控服务
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
  // 这里可以发送错误到监控服务
});

// 导出应用实例供测试使用
export default EnhancedApp;