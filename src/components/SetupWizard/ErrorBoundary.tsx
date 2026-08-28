import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#dc2626',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <p>Something went wrong.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
