import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type EndpointMatrixEntry = {
  methodPath: string;
  contracts: string;
};

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');

const webSpecPath = resolve(workspaceRoot, 'apps/workflow-web/docs/workflow-web-spec.md');
const serverSpecPath = resolve(
  workspaceRoot,
  'packages/workflow-server/docs/typescript-server-workflow-spec.md',
);

const extractTableRows = (content: string, sectionTitle: string): string[] => {
  const lines = content.split('\n');
  const sectionIndex = lines.findIndex((line) => line.trim() === sectionTitle);

  if (sectionIndex < 0) {
    throw new Error(`Section not found: ${sectionTitle}`);
  }

  const tableRows: string[] = [];
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (line.startsWith('## ') && tableRows.length > 0) {
      break;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      tableRows.push(line);
    }
  }

  return tableRows;
};

const parseEndpointMatrix = (rows: string[]): EndpointMatrixEntry[] =>
  rows
    .filter((row) => !row.includes('---') && !row.includes('Capability'))
    .map((row) => {
      const cells = row
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);

      const methodPath = cells[1].replaceAll('`', '');
      const contracts = cells[2].replaceAll('`', '');

      return { methodPath, contracts };
    })
    .sort((left, right) => left.methodPath.localeCompare(right.methodPath));

describe('integration.spec-lock.ITX-WEB-023', () => {
  it('keeps web Section 6.2 endpoint matrix aligned with server Section 6.9.1', () => {
    const webSpec = readFileSync(webSpecPath, 'utf8');
    const serverSpec = readFileSync(serverSpecPath, 'utf8');

    const webRows = extractTableRows(webSpec, '### 6.2 Endpoint Usage Matrix (Normative)');
    const serverRows = extractTableRows(serverSpec, '## 6.9.1 Web SPA Endpoint Contract Lock');

    const webMatrix = parseEndpointMatrix(webRows);
    const serverMatrix = parseEndpointMatrix(serverRows);

    expect(webMatrix).toEqual(serverMatrix);
    expect(webMatrix.every((entry) => entry.methodPath.includes('/api/v1'))).toBe(true);
  });
});
