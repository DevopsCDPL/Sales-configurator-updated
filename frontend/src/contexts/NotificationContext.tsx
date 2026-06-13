import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface NotificationState {
  message: string;
  severity: AlertColor;
}

interface NotificationContextType {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  showError: () => {},
  showSuccess: () => {},
  showInfo: () => {},
  showWarning: () => {},
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    severity: 'info',
  });

  const show = useCallback((message: string, severity: AlertColor) => {
    setNotification({ message, severity });
    setOpen(true);
  }, []);

  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  return (
    <NotificationContext.Provider
      value={{
        showError: (msg) => show(msg, 'error'),
        showSuccess: (msg) => show(msg, 'success'),
        showInfo: (msg) => show(msg, 'info'),
        showWarning: (msg) => show(msg, 'warning'),
      }}
    >
      {children}
      <Snackbar
        open={open}
        autoHideDuration={3000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 1 }}
      >
        <Alert
          severity={notification.severity}
          onClose={handleClose}
          variant="filled"
          iconMapping={{
            success: <CheckCircleOutlineIcon fontSize="inherit" />,
            error: <ErrorOutlineIcon fontSize="inherit" />,
            warning: <WarningAmberIcon fontSize="inherit" />,
            info: <InfoOutlinedIcon fontSize="inherit" />,
          }}
          sx={{
            minWidth: 320,
            maxWidth: 480,
            fontWeight: 500,
            fontSize: 14,
            borderRadius: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            // success: bright green, near-black text for max contrast
            ...(notification.severity === 'success' && {
              bgcolor: '#16A34A',
              color: '#04210F',
              '& .MuiAlert-icon': { color: '#04210F' },
              '& .MuiAlert-action svg': { color: '#04210F' },
            }),
            // error: standard red
            ...(notification.severity === 'error' && {
              bgcolor: '#EF4444',
              color: '#FFFFFF',
              '& .MuiAlert-icon': { color: '#FFFFFF' },
              '& .MuiAlert-action svg': { color: '#FFFFFF' },
            }),
            // warning: amber, dark text
            ...(notification.severity === 'warning' && {
              bgcolor: '#D97706',
              color: '#1C0D00',
              '& .MuiAlert-icon': { color: '#1C0D00' },
              '& .MuiAlert-action svg': { color: '#1C0D00' },
            }),
            // info: sky-blue, dark text
            ...(notification.severity === 'info' && {
              bgcolor: '#00c8ff',
              color: '#06151c',
              '& .MuiAlert-icon': { color: '#06151c' },
              '& .MuiAlert-action svg': { color: '#06151c' },
            }),
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
