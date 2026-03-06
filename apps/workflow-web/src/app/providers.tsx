import {
  createContext,
  useContext,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Line, LineChart } from 'recharts';
import { create } from 'zustand';

import type { ErrorEnvelope, WorkflowStreamFrame } from '@composable-workflow/workflow-api-types';

import { darkTheme } from '../theme/theme';

type RuntimeStore = {
  connected: boolean;
  setConnected: (connected: boolean) => void;
};

const useRuntimeStore = create<RuntimeStore>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));

const queryClient = new QueryClient();
const RuntimeStoreContext = createContext<typeof useRuntimeStore | null>(null);

const runtimeChartData: Array<{ x: number; y: number }> = [];

export type TransportStreamFrame = WorkflowStreamFrame;
export type TransportErrorEnvelope = ErrorEnvelope;

export const isTransportErrorEnvelope = (value: unknown): value is TransportErrorEnvelope => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<TransportErrorEnvelope>;

  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
};

const RuntimeAnchors = (): ReactNode => {
  const connected = useRuntimeStore((state) => state.connected);

  return (
    <Box
      aria-hidden="true"
      sx={{ width: 0, height: 0, overflow: 'hidden' }}
      data-runtime-connected={connected}
    >
      <LineChart width={1} height={1} data={runtimeChartData}>
        <Line dataKey="y" />
      </LineChart>
    </Box>
  );
};

export const useAppRuntimeStore = (): typeof useRuntimeStore => {
  const store = useContext(RuntimeStoreContext);

  if (store === null) {
    throw new Error('useAppRuntimeStore must be used inside AppProviders');
  }

  return store;
};

export const AppProviders = ({ children }: PropsWithChildren): ReactElement => (
  <ThemeProvider theme={darkTheme}>
    <CssBaseline />
    <QueryClientProvider client={queryClient}>
      <RuntimeStoreContext.Provider value={useRuntimeStore}>
        <RuntimeAnchors />
        {children}
      </RuntimeStoreContext.Provider>
    </QueryClientProvider>
  </ThemeProvider>
);
