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

// V2 Preview flag capture — must run at boot, BEFORE the router strips
// query params on navigation. ?v2=1 enables, ?v2=0 disables (sticky).
try {
  const v2 = new URLSearchParams(window.location.search).get('v2');
  if (v2 === '1') window.localStorage.setItem('cfg_v2', '1');
  if (v2 === '0') window.localStorage.removeItem('cfg_v2');
} catch { /* no-op */ }


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
