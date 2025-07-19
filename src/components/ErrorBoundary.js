import React, { Component } from 'react';
import * as Sentry from '@sentry/react';

/**
 * 企业级错误边界组件
 * 提供错误捕获、恢复和报告功能
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastErrorTime: null,
      errorId: null
    };
    
    this.resetTimeoutId = null;
    this.errorHistory = [];
  }
  
  static getDerivedStateFromError(error) {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
      lastErrorTime: Date.now()
    };
  }
  
  componentDidCatch(error, errorInfo) {
    const { onError, errorReportingEnabled = true } = this.props;
    
    // 记录错误历史
    this.errorHistory.push({
      error,
      errorInfo,
      timestamp: Date.now(),
      errorId: this.state.errorId
    });
    
    // 保持最近10个错误
    if (this.errorHistory.length > 10) {
      this.errorHistory.shift();
    }
    
    // 更新错误计数
    this.setState(prevState => ({
      errorCount: prevState.errorCount + 1,
      errorInfo
    }));
    
    // 日志记录
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    
    // 触发错误回调
    if (onError) {
      onError(error, errorInfo, this.state.errorId);
    }
    
    // 错误报告（生产环境）
    if (errorReportingEnabled && process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo);
    }
    
    // 自动恢复机制
    this.scheduleAutoRecovery();
  }
  
  /**
   * 报告错误到监控服务
   */
  reportError(error, errorInfo) {
    // Sentry 集成
    if (typeof Sentry !== 'undefined' && Sentry.captureException) {
      Sentry.withScope((scope) => {
        scope.setTag('errorBoundary', true);
        scope.setContext('errorInfo', {
          componentStack: errorInfo.componentStack,
          errorId: this.state.errorId,
          errorCount: this.state.errorCount
        });
        Sentry.captureException(error);
      });
    }
    
    // 自定义错误报告
    const errorReport = {
      message: error.toString(),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      errorCount: this.state.errorCount
    };
    
    // 发送到自定义错误收集服务
    this.sendErrorReport(errorReport);
  }
  
  /**
   * 发送错误报告
   */
  async sendErrorReport(errorReport) {
    try {
      const response = await fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorReport)
      });
      
      if (!response.ok) {
        console.error('Failed to send error report');
      }
    } catch (error) {
      console.error('Error sending report:', error);
    }
  }
  
  /**
   * 自动恢复机制
   */
  scheduleAutoRecovery() {
    const { autoRecovery = true, autoRecoveryDelay = 5000 } = this.props;
    
    if (!autoRecovery) return;
    
    // 清除之前的定时器
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
    
    // 如果错误频繁发生，延长恢复时间
    const delay = this.state.errorCount > 3 
      ? autoRecoveryDelay * this.state.errorCount 
      : autoRecoveryDelay;
    
    this.resetTimeoutId = setTimeout(() => {
      this.handleReset();
    }, delay);
  }
  
  /**
   * 重置错误状态
   */
  handleReset = () => {
    const { onReset } = this.props;
    
    // 清除定时器
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }
    
    // 重置状态
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    });
    
    // 触发重置回调
    if (onReset) {
      onReset();
    }
  };
  
  /**
   * 手动重试
   */
  handleRetry = () => {
    const { onRetry } = this.props;
    
    // 触发重试回调
    if (onRetry) {
      onRetry(this.state.error, this.state.errorInfo);
    }
    
    this.handleReset();
  };
  
  /**
   * 获取错误详情
   */
  getErrorDetails() {
    const { error, errorInfo, errorCount, lastErrorTime } = this.state;
    
    if (!error) return null;
    
    return {
      message: error.toString(),
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      errorCount,
      lastErrorTime,
      errorHistory: this.errorHistory
    };
  }
  
  componentWillUnmount() {
    // 清理定时器
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }
  
  render() {
    const { hasError, error, errorCount } = this.state;
    const { 
      children, 
      fallback, 
      fallbackComponent: FallbackComponent,
      showDetails = process.env.NODE_ENV === 'development'
    } = this.props;
    
    if (hasError) {
      // 自定义降级组件
      if (FallbackComponent) {
        return (
          <FallbackComponent
            error={error}
            errorDetails={this.getErrorDetails()}
            onRetry={this.handleRetry}
            onReset={this.handleReset}
          />
        );
      }
      
      // 自定义降级UI
      if (fallback) {
        return typeof fallback === 'function' 
          ? fallback({ 
              error, 
              retry: this.handleRetry, 
              reset: this.handleReset,
              details: this.getErrorDetails()
            })
          : fallback;
      }
      
      // 默认降级UI
      return (
        <div className="error-boundary-default">
          <div className="error-container">
            <h2>😔 出错了</h2>
            <p>页面遇到了一些问题，我们正在努力修复。</p>
            
            {errorCount > 1 && (
              <p className="error-count">
                这是第 {errorCount} 次出错
              </p>
            )}
            
            <div className="error-actions">
              <button onClick={this.handleRetry} className="retry-button">
                🔄 重试
              </button>
              <button onClick={this.handleReset} className="reset-button">
                🏠 重置
              </button>
            </div>
            
            {showDetails && (
              <details className="error-details">
                <summary>错误详情</summary>
                <pre>{error && error.toString()}</pre>
                <pre>{error && error.stack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    
    return children;
  }
}

/**
 * 错误边界 Hook
 */
export const useErrorHandler = () => {
  const [error, setError] = React.useState(null);
  
  const resetError = () => setError(null);
  
  const captureError = React.useCallback((error) => {
    setError(error);
  }, []);
  
  // 抛出错误让最近的错误边界捕获
  if (error) {
    throw error;
  }
  
  return { captureError, resetError };
};

/**
 * 异步错误边界
 */
export const AsyncErrorBoundary = ({ children, ...props }) => {
  const { captureError } = useErrorHandler();
  
  // 捕获未处理的 Promise 拒绝
  React.useEffect(() => {
    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      captureError(new Error(event.reason));
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [captureError]);
  
  return (
    <ErrorBoundary {...props}>
      {children}
    </ErrorBoundary>
  );
};

/**
 * 带重试的错误边界
 */
export const RetryErrorBoundary = ({ 
  children, 
  maxRetries = 3,
  retryDelay = 1000,
  ...props 
}) => {
  const [retryCount, setRetryCount] = React.useState(0);
  
  const handleRetry = React.useCallback(() => {
    if (retryCount < maxRetries) {
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
      }, retryDelay * (retryCount + 1));
    }
  }, [retryCount, maxRetries, retryDelay]);
  
  return (
    <ErrorBoundary
      key={retryCount}
      onRetry={handleRetry}
      fallback={({ error, retry, reset }) => (
        <div className="retry-error-boundary">
          <h3>出错了</h3>
          <p>{error.message}</p>
          {retryCount < maxRetries ? (
            <div>
              <p>重试次数: {retryCount}/{maxRetries}</p>
              <button onClick={retry}>重试</button>
            </div>
          ) : (
            <div>
              <p>已达到最大重试次数</p>
              <button onClick={reset}>重置</button>
            </div>
          )}
        </div>
      )}
      {...props}
    >
      {children}
    </ErrorBoundary>
  );
};

// 导出默认样式
export const errorBoundaryStyles = `
  .error-boundary-default {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
    padding: 20px;
  }
  
  .error-container {
    text-align: center;
    max-width: 500px;
  }
  
  .error-container h2 {
    font-size: 24px;
    margin-bottom: 16px;
    color: #d32f2f;
  }
  
  .error-container p {
    margin-bottom: 20px;
    color: #666;
  }
  
  .error-count {
    font-size: 14px;
    color: #999;
  }
  
  .error-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 20px;
  }
  
  .retry-button,
  .reset-button {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.3s;
  }
  
  .retry-button {
    background-color: #2196f3;
    color: white;
  }
  
  .retry-button:hover {
    background-color: #1976d2;
  }
  
  .reset-button {
    background-color: #f5f5f5;
    color: #333;
  }
  
  .reset-button:hover {
    background-color: #e0e0e0;
  }
  
  .error-details {
    margin-top: 20px;
    text-align: left;
    background-color: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
  }
  
  .error-details summary {
    cursor: pointer;
    font-weight: bold;
    margin-bottom: 10px;
  }
  
  .error-details pre {
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-size: 12px;
    color: #d32f2f;
  }
`;

export default ErrorBoundary;