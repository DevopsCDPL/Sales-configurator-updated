import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  SupportAgent as SupportIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import { LoginCredentials } from '../types';
import api from '../services/api';

const FALLBACK_ADMIN_EMAIL = 'admin@forgedas.com';

const LoginPage: React.FC = () => {
  const { login } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [contactWarning, setContactWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [failedAttempt, setFailedAttempt] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginCredentials>();

  useEffect(() => {
    const subscription = watch((value, { name }) => {
      if ((error || contactWarning) && (name === 'email' || name === 'password')) {
        setError(null);
        setContactWarning(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [watch, error, contactWarning]);

  const onSubmit = async (data: LoginCredentials) => {
    setError(null);
    setContactWarning(null);
    setIsLoading(true);

    try {
      await login(data);
    } catch (err: any) {
      setFailedAttempt({ email: data.email, password: data.password });
      if (!err.response) {
        setError(`Cannot reach login server. ${err?.message || ''}`.trim());
      } else {
        setError(err.response?.data?.message || err?.message || 'Invalid credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactAdmin = async () => {
    if (!failedAttempt) {
      setContactWarning('Please try logging in before contacting Admin.');
      return;
    }

    let adminEmail = FALLBACK_ADMIN_EMAIL;

    try {
      const res = await api.post('/auth/contact-admin', {
        email: failedAttempt.email,
      });

      if (res.data?.data?.contactEmail) {
        adminEmail = res.data.data.contactEmail;
      }
    } catch (_) {}

    const now = new Date();
    const dateStr = now.toLocaleString();

    const subject = encodeURIComponent('Login Issue – Support Required');

    const body = encodeURIComponent(
      `Dear Admin,\n\n` +
        `I am unable to log in to the system.\n\n` +
        `Entered Email ID: ${failedAttempt.email}\n\n` +
        `Kindly verify my credentials and update if required.\n\n` +
        `Date & Time: ${dateStr}\n\n` +
        `Regards,\nUser`
    );

    const mailtoUrl = `mailto:${adminEmail}?subject=${subject}&body=${body}`;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = mailtoUrl;

    document.body.appendChild(iframe);

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 2000);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-canvas)',
        gap: { xs: 0, md: '64px' },
        px: { xs: 0, md: 4 },
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 440, p: 3 }}>
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Box
            component="img"
            src="/cholan-dynamics-full.png"
            alt="Cholan Dynamics"
            sx={{
              maxWidth: 280,
              maxHeight: 80,
              objectFit: 'contain',
              mb: 4,
              mx: 'auto',
              display: 'block',
            }}
          />

          <Typography
            sx={{
              color: 'var(--text-primary)',
              fontSize: '1.4rem',
              fontWeight: 600,
            }}
          >
            Sign In
          </Typography>
        </Box>

        {/* Login Card */}
        <Box
          sx={{
            p: 4,
            borderRadius: '12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            boxShadow: 'none',
          }}
        >
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {contactWarning && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              {contactWarning}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ mb: 1 }}>Email or User ID</Typography>

              <TextField
                fullWidth
                placeholder="Enter your email or User ID"
                type="text"
                {...register('email', {
                  required: 'Email or User ID is required',
                })}
                error={!!errors.email}
                helperText={errors.email?.message}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Box sx={{ mb: 4 }}>
              <Typography sx={{ mb: 1 }}>Password</Typography>

              <TextField
                fullWidth
                placeholder="Enter your password"
                type={showPassword ? 'text' : 'password'}
                {...register('password', {
                  required: 'Password is required',
                })}
                error={!!errors.password}
                helperText={errors.password?.message}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={isLoading}
            >
              {isLoading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
          </form>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Typography
              component="a"
              href="/forgot-password"
              sx={{
                fontSize: '0.85rem',
                color: 'var(--primary)',
                textDecoration: 'none',
              }}
            >
              Forgot Password?
            </Typography>
          </Box>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Button
              variant="text"
              startIcon={<SupportIcon />}
              onClick={handleContactAdmin}
            >
              Contact Admin
            </Button>
          </Box>

          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <Typography
              sx={{
                color: '#94a3b8',
                fontSize: '0.75rem',
              }}
            >
              Developed by J3M Fabrication LLC
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;
