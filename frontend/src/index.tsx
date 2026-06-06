import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyLogoProvider } from './contexts/CompanyLogoContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ThemeContextProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeContextProvider>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <AuthProvider>
              <CompanyLogoProvider>
                <NotificationProvider>
                  <App />
                </NotificationProvider>
              </CompanyLogoProvider>
            </AuthProvider>
          </LocalizationProvider>
        </ThemeContextProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
