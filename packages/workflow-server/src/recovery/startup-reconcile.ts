import type { ReconcileResult, ReconcileService } from './reconcile-service.js';

export interface StartupReconcileController {
  runInitialReconcile: () => Promise<ReconcileResult>;
  waitUntilReady: () => Promise<void>;
  isReady: () => boolean;
}

export const createStartupReconcileController = (
  reconcileService: ReconcileService,
): StartupReconcileController => {
  let ready = false;
  let runPromise: Promise<ReconcileResult> | null = null;

  const runInitialReconcile = async (): Promise<ReconcileResult> => {
    if (!runPromise) {
      runPromise = reconcileService
        .reconcile({
          limit: 100,
          dryRun: false,
        })
        .then((result) => {
          ready = true;
          return result;
        });
    }

    return runPromise;
  };

  return {
    runInitialReconcile,
    waitUntilReady: async () => {
      await runInitialReconcile();
    },
    isReady: () => ready,
  };
};
