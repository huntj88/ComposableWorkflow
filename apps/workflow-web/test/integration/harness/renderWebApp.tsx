/**
 * TWEB09: Route-level integration renderer.
 *
 * Mounts the full application shell (HashRouter, providers, themes) around
 * a target route so integration tests exercise real routing, query-client
 * lifecycle, and store isolation without manual wiring.
 *
 * @vitest-environment jsdom
 */

import type { ReactElement, PropsWithChildren } from 'react';
import { HashRouter, MemoryRouter, Route, Routes, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, type QueryState } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { ReactFlowProvider } from 'reactflow';
import { createStore, type StoreApi } from 'zustand';
// @ts-expect-error -- @testing-library/react may not be installed as a direct dep;
// integration tests that use this harness should ensure it is available.
import { cleanup, render, type RenderResult } from '@testing-library/react';

import { darkTheme } from '../../../src/theme/theme';
import { RunsPage } from '../../../src/routes/runs/RunsPage';
import { RunDetailPage } from '../../../src/routes/run-detail/RunDetailPage';
import { DefinitionsPage } from '../../../src/routes/definitions/DefinitionsPage';

// ---------------------------------------------------------------------------
// Query-cache observation
// ---------------------------------------------------------------------------

export type QueryCacheSnapshot = {
  queryKey: readonly unknown[];
  state: QueryState;
};

export type QueryCacheProbe = {
  /** Return current cache entries matching an optional key prefix filter. */
  getAll: (keyPrefix?: string) => QueryCacheSnapshot[];
  /** Return number of active queries. */
  activeCount: () => number;
  /** Clear all queries from the cache. */
  clear: () => void;
};

const createQueryCacheProbe = (client: QueryClient): QueryCacheProbe => ({
  getAll: (keyPrefix) => {
    const cache = client.getQueryCache().getAll();
    const entries = keyPrefix
      ? cache.filter((q) =>
          q.queryKey.some(
            (segment) => typeof segment === 'string' && segment.startsWith(keyPrefix),
          ),
        )
      : cache;

    return entries.map((q) => ({
      queryKey: q.queryKey,
      state: q.state,
    }));
  },
  activeCount: () =>
    client
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.status === 'pending').length,
  clear: () => client.clear(),
});

// ---------------------------------------------------------------------------
// Runtime store (isolated per render)
// ---------------------------------------------------------------------------

type RuntimeState = {
  connected: boolean;
  setConnected: (connected: boolean) => void;
};

export type RuntimeStoreProbe = {
  getState: () => RuntimeState;
  setConnected: (connected: boolean) => void;
};

const createIsolatedRuntimeStore = (): {
  store: StoreApi<RuntimeState>;
  probe: RuntimeStoreProbe;
} => {
  const store = createStore<RuntimeState>((set) => ({
    connected: false,
    setConnected: (connected: boolean) => set({ connected }),
  }));

  return {
    store,
    probe: {
      getState: () => store.getState(),
      setConnected: (connected: boolean) => store.getState().setConnected(connected),
    },
  };
};

// ---------------------------------------------------------------------------
// Render options
// ---------------------------------------------------------------------------

export type RenderWebAppOptions = {
  /** Initial route path (e.g. '/runs/wr_abc123'). Defaults to '/runs'. */
  route?: string;
  /**
   * When true, use MemoryRouter with the given initial route
   * instead of HashRouter. Useful for deterministic navigation assertions.
   * Defaults to true.
   */
  useMemoryRouter?: boolean;
  /** Custom QueryClient configuration overrides. */
  queryClientConfig?: ConstructorParameters<typeof QueryClient>[0];
};

export type RenderWebAppResult = {
  renderResult: RenderResult;
  queryProbe: QueryCacheProbe;
  runtimeProbe: RuntimeStoreProbe;
  queryClient: QueryClient;
  /** Unmount the rendered component tree and clean up. */
  unmount: () => void;
};

// ---------------------------------------------------------------------------
// Shell wrapper
// ---------------------------------------------------------------------------

const AppRoutes = (): ReactElement => (
  <Routes>
    <Route path="/" element={<Navigate to="/runs" replace />} />
    <Route path="/runs" element={<RunsPage />} />
    <Route path="/runs/:runId" element={<RunDetailPage />} />
    <Route path="/definitions/:workflowType" element={<DefinitionsPage />} />
    <Route path="*" element={<Navigate to="/runs" replace />} />
  </Routes>
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount the full workflow-web application at a given route for integration
 * testing. Returns probes to observe query-cache and runtime store state.
 */
export function renderWebApp(options: RenderWebAppOptions = {}): RenderWebAppResult {
  const { route = '/runs', useMemoryRouter = true, queryClientConfig } = options;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
    ...queryClientConfig,
  });

  const { probe: runtimeProbe } = createIsolatedRuntimeStore();

  const Router = useMemoryRouter
    ? ({ children }: PropsWithChildren) => (
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      )
    : ({ children }: PropsWithChildren) => <HashRouter>{children}</HashRouter>;

  const tree = (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <ReactFlowProvider>
          <Router>
            <AppRoutes />
          </Router>
        </ReactFlowProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );

  const renderResult = render(tree);

  const unmount = (): void => {
    renderResult.unmount();
    queryClient.clear();
    cleanup();
  };

  return {
    renderResult,
    queryProbe: createQueryCacheProbe(queryClient),
    runtimeProbe,
    queryClient,
    unmount,
  };
}
