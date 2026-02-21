import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import type { WorkflowPackageSource } from '../config.js';

export interface ResolvedWorkflowPackageSource extends WorkflowPackageSource {
  resolvedSpecifier: string;
}

const sourcePriority: Record<WorkflowPackageSource['source'], number> = {
  path: 0,
  pnpm: 1,
  bundle: 2,
};

const moduleRequire = createRequire(import.meta.url);

const isLikelyPath = (value: string): boolean =>
  value.startsWith('.') || value.startsWith('/') || value.includes(path.sep);

const resolvePathSource = async (value: string, cwd: string): Promise<string> => {
  const resolvedPath = path.isAbsolute(value) ? value : path.resolve(cwd, value);
  await access(resolvedPath);

  if (
    resolvedPath.endsWith('.js') ||
    resolvedPath.endsWith('.mjs') ||
    resolvedPath.endsWith('.cjs')
  ) {
    return pathToFileURL(resolvedPath).href;
  }

  const packageJsonPath = path.join(resolvedPath, 'package.json');

  try {
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent) as {
      exports?: string | { '.': string };
      module?: string;
      main?: string;
    };

    const exportEntry =
      typeof packageJson.exports === 'string'
        ? packageJson.exports
        : typeof packageJson.exports?.['.'] === 'string'
          ? packageJson.exports['.']
          : undefined;

    const entry = exportEntry ?? packageJson.module ?? packageJson.main ?? 'index.js';
    return pathToFileURL(path.join(resolvedPath, entry)).href;
  } catch {
    return pathToFileURL(path.join(resolvedPath, 'index.js')).href;
  }
};

const resolvePnpmSource = (value: string): string => {
  const resolvedPath = moduleRequire.resolve(value);
  return pathToFileURL(resolvedPath).href;
};

const resolveBundleSource = async (value: string, cwd: string): Promise<string> => {
  if (isLikelyPath(value)) {
    return resolvePathSource(value, cwd);
  }

  return value;
};

export const resolveWorkflowPackageSource = async (
  source: WorkflowPackageSource,
  cwd = process.cwd(),
): Promise<ResolvedWorkflowPackageSource> => {
  switch (source.source) {
    case 'path':
      return {
        ...source,
        resolvedSpecifier: await resolvePathSource(source.value, cwd),
      };
    case 'pnpm':
      return {
        ...source,
        resolvedSpecifier: resolvePnpmSource(source.value),
      };
    case 'bundle':
      return {
        ...source,
        resolvedSpecifier: await resolveBundleSource(source.value, cwd),
      };
  }
};

export const resolveWorkflowPackageSources = async (
  sources: WorkflowPackageSource[],
  cwd = process.cwd(),
): Promise<ResolvedWorkflowPackageSource[]> => {
  const sortedSources = [...sources].sort(
    (left, right) => sourcePriority[left.source] - sourcePriority[right.source],
  );

  return Promise.all(sortedSources.map((source) => resolveWorkflowPackageSource(source, cwd)));
};
