import type { ReactElement } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, CssBaseline } from '@mui/material';

import { DefinitionsPage } from '../routes/definitions/DefinitionsPage';
import { RunDetailPage } from '../routes/run-detail/RunDetailPage';
import { RunsPage } from '../routes/runs/RunsPage';

const AppRouteShell = (): ReactElement => (
  <Box sx={{ p: 3 }}>
    <Routes>
      <Route path="/" element={<Navigate to="/runs" replace />} />
      <Route path="/runs" element={<RunsPage />} />
      <Route path="/runs/:runId" element={<RunDetailPage />} />
      <Route path="/definitions/:workflowType" element={<DefinitionsPage />} />
      <Route path="*" element={<Navigate to="/runs" replace />} />
    </Routes>
  </Box>
);

export const AppRouter = (): ReactElement => (
  <HashRouter>
    <CssBaseline />
    <AppRouteShell />
  </HashRouter>
);
