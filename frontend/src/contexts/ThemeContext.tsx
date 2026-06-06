import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { createAppTheme } from '../theme';
import { installThemeVariables } from '../config/themeTokens';

type ThemeMode = 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Dark industrial mode — TierPower configurator aesthetic
  const mode: ThemeMode = 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.setAttribute('data-theme', 'dark');
    installThemeVariables('dark');
    try { localStorage.removeItem('app-theme'); } catch {}
  }, []);

  const theme = useMemo(() => createAppTheme('dark'), []);

  const value = useMemo(
    () => ({
      mode,
      toggleTheme: () => {},
      isDark: true,
    }),
    [mode]
  );

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useThemeMode = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeContextProvider');
  }
  return context;
};

export default ThemeContext;
