import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { captureException } from '../lib/errorMonitoring.ts';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * React Error Boundary that catches render errors in child components
 * and displays a fallback UI instead of crashing the entire app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, info);
        captureException(error, { componentStack: info.componentStack ?? '' });
        this.props.onError?.(error, info);

        if (this.isChunkLoadError(error)) {
            this.handleChunkError();
        }
    }

    private isChunkLoadError(error: Error): boolean {
        return /Failed to fetch dynamically imported module|Loading chunk|Loading CSS chunk/i.test(error.message);
    }

    private handleChunkError() {
        const reloadKey = 'spine-scanner-chunk-reload';
        const lastReload = sessionStorage.getItem(reloadKey);
        const now = Date.now();
        if (lastReload && now - parseInt(lastReload) < 10_000) return;
        sessionStorage.setItem(reloadKey, String(now));

        const w = window as Window;
        if (typeof w.caches !== 'undefined') {
            w.caches.keys().then(names => Promise.all(names.map(n => w.caches.delete(n))))
                .finally(() => w.location.reload());
        } else {
            w.location.reload();
        }
    }

    handleRetry = () => {
        if (this.state.error && this.isChunkLoadError(this.state.error)) {
            this.handleChunkError();
            return;
        }
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div style={{
                    padding: '2rem',
                    margin: '1rem',
                    borderRadius: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    textAlign: 'center',
                }}>
                    <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>
                        Something went wrong
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        style={{
                            padding: '0.5rem 1.5rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
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
