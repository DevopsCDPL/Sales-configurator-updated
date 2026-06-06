import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  componentDidUpdate(prevProps: Props) {
    // Auto-recover when children change (e.g. route change)
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Navigate to home using history instead of hard reload to avoid loops
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box
          sx={{
            minHeight: '60vh',
            bgcolor: '#F9FAFB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
          }}
        >
          <Box
            sx={{
              bgcolor: 'var(--bg-surface)',
              borderRadius: 3,
              p: 4,
              maxWidth: 500,
              width: '100%',
              boxShadow: 'none',
              border: '1px solid var(--border)',
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: 48, mb: 1 }}>😕</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '1.2rem', color: '#0F172A', mb: 1 }}>
              Something didn't load correctly
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#64748B', mb: 2 }}>
              This section encountered an issue. You can retry or go back to the dashboard.
            </Typography>
            {this.state.error && (
              <Box
                sx={{
                  bgcolor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 2,
                  p: 2,
                  mb: 2,
                  textAlign: 'left',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#DC2626' }}>
                  {this.state.error.toString()}
                </Typography>
                {this.state.errorInfo && (
                  <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#7F1D1D', mt: 1, whiteSpace: 'pre-wrap' }}>
                    {this.state.errorInfo.componentStack}
                  </Typography>
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                onClick={this.handleRetry}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  px: 3,
                  borderColor: '#E2E8F0',
                  color: '#475569',
                  '&:hover': { bgcolor: '#F8FAFC', borderColor: '#CBD5E1' },
                }}
              >
                Retry
              </Button>
              <Button
                variant="contained"
                onClick={this.handleGoHome}
                sx={{
                  bgcolor: '#1F7A63',
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  px: 3,
                  '&:hover': { bgcolor: '#2A9D7E' },
                }}
              >
                Go to Dashboard
              </Button>
            </Box>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
