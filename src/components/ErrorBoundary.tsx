import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="glass" style={{
                    padding: '2rem',
                    margin: '2rem auto',
                    maxWidth: '500px',
                    textAlign: 'center',
                }}>
                    <AlertTriangle size={48} style={{ color: '#f87171', marginBottom: '1rem' }} />
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={this.handleReset}
                        className="glass"
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'var(--primary)',
                            color: 'white',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }}
                    >
                        <RefreshCw size={16} /> Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
