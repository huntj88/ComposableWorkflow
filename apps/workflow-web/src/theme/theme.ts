/**
 * MUI theme configuration — dark-default observability theme with light parity.
 *
 * B-WEB-046: Dark observability theme default with light-theme parity.
 *            Centralized tokens for spacing/typography/status.
 */

import { createTheme, type Theme } from '@mui/material';

// ---------------------------------------------------------------------------
// Shared palette overrides used in both dark and light modes
// ---------------------------------------------------------------------------

const sharedComponents: Theme['components'] = {
  MuiPaper: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      root: {
        backgroundImage: 'none',
      },
    },
  },
  MuiButton: {
    defaultProps: {
      disableElevation: true,
    },
    styleOverrides: {
      root: {
        textTransform: 'none' as const,
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        fontWeight: 500,
      },
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: 8,
      },
    },
  },
};

const sharedTypography = {
  fontFamily: [
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
  ].join(','),
  h4: { fontWeight: 600 },
  h5: { fontWeight: 600 },
  h6: { fontWeight: 600 },
  subtitle1: { fontWeight: 600 },
  subtitle2: { fontWeight: 600 },
};

// ---------------------------------------------------------------------------
// Focus visibility — visible focus indicators (B-WEB-029)
// ---------------------------------------------------------------------------

const focusVisibleStyle = {
  outline: '2px solid',
  outlineOffset: 2,
};

// ---------------------------------------------------------------------------
// Dark theme (default)
// ---------------------------------------------------------------------------

export const darkTheme: Theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#90caf9' },
    secondary: { main: '#ce93d8' },
    success: { main: '#66bb6a' },
    warning: { main: '#ffa726' },
    error: { main: '#f44336' },
    info: { main: '#29b6f6' },
    background: {
      default: '#0a0e14',
      paper: '#111820',
    },
    text: {
      primary: '#e6edf3',
      secondary: '#8b949e',
    },
    divider: 'rgba(240, 246, 252, 0.1)',
  },
  typography: sharedTypography,
  components: {
    ...sharedComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#0a0e14',
        },
        '*:focus-visible': {
          ...focusVisibleStyle,
          outlineColor: '#90caf9',
        },
      },
    },
  },
  shape: { borderRadius: 8 },
});

// ---------------------------------------------------------------------------
// Light theme (parity)
// ---------------------------------------------------------------------------

export const lightTheme: Theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#9c27b0' },
    success: { main: '#2e7d32' },
    warning: { main: '#ed6c02' },
    error: { main: '#d32f2f' },
    info: { main: '#0288d1' },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
    text: {
      primary: '#1b1f23',
      secondary: '#57606a',
    },
    divider: 'rgba(27, 31, 36, 0.15)',
  },
  typography: sharedTypography,
  components: {
    ...sharedComponents,
    MuiCssBaseline: {
      styleOverrides: {
        '*:focus-visible': {
          ...focusVisibleStyle,
          outlineColor: '#1976d2',
        },
      },
    },
  },
  shape: { borderRadius: 8 },
});

// ---------------------------------------------------------------------------
// Theme accessor — default is dark
// ---------------------------------------------------------------------------

export type ThemeMode = 'dark' | 'light';

export const getTheme = (mode: ThemeMode = 'dark'): Theme =>
  mode === 'light' ? lightTheme : darkTheme;
