import type { ReactElement } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Box, CssBaseline, Stack, Typography } from '@mui/material';

import { DefinitionsPage } from '../routes/definitions/DefinitionsPage';
import { RunsPage } from '../routes/runs/RunsPage';

const RunDetailRouteShell = (): ReactElement => {
  const { runId } = useParams<{ runId: string }>();

  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h4">
        Run Details
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Selected run: {runId}
      </Typography>
      <Typography component={Link} to="/runs" variant="body2">
        Back to runs
      </Typography>
      <Box
        role="region"
        aria-label="run-detail-shell"
        sx={{ minHeight: 240, border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
      >
        <Typography variant="body2" color="text.secondary">
          Run dashboard shell
        </Typography>
      </Box>
    </Stack>
  );
};

const AppRouteShell = (): ReactElement => (
  <Box sx={{ p: 3 }}>
    <Routes>
      <Route path="/" element={<Navigate to="/runs" replace />} />
      <Route path="/runs" element={<RunsPage />} />
      <Route path="/runs/:runId" element={<RunDetailRouteShell />} />
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
