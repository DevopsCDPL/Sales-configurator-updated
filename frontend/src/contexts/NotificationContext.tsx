import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';

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
        autoHideDuration={2500}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 1 }}
      >
        <Alert
          severity={notification.severity}
          onClose={handleClose}
          variant="filled"
          sx={{
            minWidth: 320,
            maxWidth: 480,
            fontWeight: 500,
            fontSize: 14,
            borderRadius: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
