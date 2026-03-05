import { StrictMode, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Route, Routes } from 'react-router-dom';
import { CssBaseline, Typography } from '@mui/material';

import { AppProviders } from './app/providers';

const AppShell = (): ReactElement => (
  <>
    <CssBaseline />
    <Routes>
      <Route path="/" element={<Typography component="h1">Workflow Web</Typography>} />
    </Routes>
  </>
);

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Missing root element #root');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppShell />
    </AppProviders>
  </StrictMode>,
);
