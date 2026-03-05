import { StrictMode, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';

const AppShell = (): ReactElement => (
  <>
    <AppRouter />
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
