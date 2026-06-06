import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, Alert, CircularProgress,
  InputAdornment, alpha,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  Email as EmailIcon,
  CheckCircle as CheckIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import api from '../services/api';

/* ═════════════════════════════════════════════════════════════════════ */
const T = {
  primary: '#1F7A63',
  primaryBg: '#E8F7F2',
  border: 'var(--border)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  card: '#FFFFFF',
  bg: 'var(--bg-surface-2)',
  shadow: '0 1px 2px rgba(0,0,0,0.04)',
  radius: '12px',
  radiusSm: '8px',
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusSm, fontSize: '0.9rem', bgcolor: T.card, transition: 'all .2s',
    '& fieldset': { borderColor: T.border },
    '&:hover fieldset': { borderColor: T.textMuted },
    '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.85rem', fontWeight: 500, color: T.textSecondary,
    '&.Mui-focused': { color: T.primary, fontWeight: 600 },
  },
};

/* ═════════════════════════════════════════════════════════════════════ */
const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccessMsg(`Password reset link sent to ${email}`);
      setSubmitted(true);
      setEmail('');
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
        'Unable to send reset link. Please check your email and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: T.bg,
        px: 2,
        py: 4,
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          boxShadow: T.shadow,
          overflow: 'hidden',
        }}
      >
        {/* Header accent */}
        <Box sx={{ height: 3, bgcolor: T.primary }} />

        <Box sx={{ p: 4 }}>
          {!submitted ? (
            <>
              {/* Header */}
              <Box sx={{ textAlign: 'center', mb: 3.5 }}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 2,
                    borderRadius: T.radius,
                    bgcolor: T.primaryBg,
                    border: `1px solid ${alpha(T.primary, 0.15)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <EmailIcon sx={{ fontSize: 28, color: T.primary }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '1.3rem',
                    fontWeight: 800,
                    color: T.textPrimary,
                    letterSpacing: '-0.01em',
                    mb: 0.5,
                  }}
                >
                  Reset Password
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    color: T.textMuted,
                    lineHeight: 1.5,
                  }}
                >
                  Enter your email address and we'll send you a link to reset your
                  password
                </Typography>
              </Box>

              {/* Error alert */}
              {error && (
                <Alert
                  severity="error"
                  onClose={() => setError(null)}
                  sx={{ mb: 2.5, borderRadius: T.radiusSm }}
                >
                  {error}
                </Alert>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit}>
                <TextField
                  label="Email Address"
                  type="email"
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  size="small"
                  disabled={loading}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon
                          sx={{ fontSize: 18, color: T.textMuted, mr: 0.5 }}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    ...fieldSx,
                    mb: 3,
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading || !email.trim()}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    borderRadius: T.radiusSm,
                    py: 1.2,
                    bgcolor: T.primary,
                    '&:hover': { bgcolor: '#166354' },
                    transition: 'all 0.2s',
                    boxShadow: T.shadow,
                    mb: 2,
                  }}
                >
                  {loading ? (
                    <CircularProgress size={20} sx={{ color: '#fff' }} />
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>

                <Button
                  fullWidth
                  startIcon={<ArrowBackIcon sx={{ fontSize: 18 }} />}
                  onClick={() => navigate('/login')}
                  disabled={loading}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    borderRadius: T.radiusSm,
                    py: 1,
                    color: T.textMuted,
                    '&:hover': { bgcolor: T.bg },
                  }}
                >
                  Back to Login
                </Button>
              </form>
            </>
          ) : (
            // Success state
            <>
              <Box sx={{ textAlign: 'center' }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    mx: 'auto',
                    mb: 2.5,
                    borderRadius: '50%',
                    bgcolor: '#E8F5E9',
                    border: '2px solid #4CAF50',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckIcon sx={{ fontSize: 32, color: '#4CAF50' }} />
                </Box>
                <Typography
                  sx={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    color: T.textPrimary,
                    mb: 1,
                  }}
                >
                  Check Your Email
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    color: T.textMuted,
                    lineHeight: 1.6,
                    mb: 3,
                  }}
                >
                  We've sent a password reset link to <strong>{email}</strong>.
                  Check your inbox and follow the link to create a new password.
                </Typography>

                <Alert
                  severity="info"
                  sx={{
                    borderRadius: T.radiusSm,
                    mb: 3,
                    bgcolor: '#EFF6FF',
                    borderColor: '#3B82F6',
                    border: '1px solid',
                    fontSize: '0.8rem',
                  }}
                >
                  Didn't receive the email? Check your spam folder or try again.
                </Alert>

                <Button
                  fullWidth
                  onClick={() => navigate('/login')}
                  variant="contained"
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    borderRadius: T.radiusSm,
                    py: 1.2,
                    bgcolor: T.primary,
                    '&:hover': { bgcolor: '#166354' },
                    transition: 'all 0.2s',
                    boxShadow: T.shadow,
                  }}
                >
                  Return to Login
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Card>
    </Box>
  );
};

export default ForgotPasswordPage;
