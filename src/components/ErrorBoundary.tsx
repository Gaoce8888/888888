import React from 'react';

interface Props {
  fallback?: (info: { error: Error; retry: () => void }) => React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  children: React.ReactNode;
}

interface State {
  error?: Error;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  retry = () => {
    this.setState({ error: undefined });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      return fallback ? fallback({ error, retry: this.retry }) : null;
    }

    return children;
  }
}

export default ErrorBoundary;