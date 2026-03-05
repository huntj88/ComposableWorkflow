import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type EndpointContractRow = {
  method: string;
  path: string;
  contracts: string[];
};

const HTTP_METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/u;

const repoRoot = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const serverSpecPath = resolve(
  repoRoot,
  'packages/workflow-server/docs/typescript-server-workflow-spec.md',
);
const webSpecPath = resolve(repoRoot, 'apps/workflow-web/docs/workflow-web-spec.md');

const parseContractLockRows = (options: {
  markdownPath: string;
  sectionHeadingPrefix: string;
}): EndpointContractRow[] => {
  const markdown = readFileSync(options.markdownPath, 'utf8');
  const lines = markdown.split(/\r?\n/u);

  const sectionStart = lines.findIndex((line) => line.startsWith(options.sectionHeadingPrefix));
  expect(sectionStart).toBeGreaterThanOrEqual(0);

  const nextSectionIndex = lines.findIndex(
    (line, index) => index > sectionStart && line.startsWith('## '),
  );
  const sectionEndExclusive = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
  const sectionLines = lines.slice(sectionStart, sectionEndExclusive);

  const tableHeaderIndex = sectionLines.findIndex(
    (line) => line.trim() === '| Capability | Method + Path | Shared Contract(s) |',
  );
  expect(tableHeaderIndex).toBeGreaterThanOrEqual(0);

  const tableRows = sectionLines
    .slice(tableHeaderIndex + 1)
    .filter((line) => line.trim().startsWith('|'));

  const parsedRows: EndpointContractRow[] = [];
  for (const line of tableRows) {
    if (/^\|(?:\s*:?[-]+:?\s*\|)+$/u.test(line.trim())) {
      continue;
    }

    const cells = line
      .trim()
      .replace(/^\|/u, '')
      .replace(/\|$/u, '')
      .split('|')
      .map((cell) => cell.trim());

    if (cells.length < 3) {
      continue;
    }

    const methodAndPathCell = cells[1];
    const contractsCell = cells[2];

    const methodAndPathMatch = /`([^`]+)`/u.exec(methodAndPathCell);
    const methodAndPath = methodAndPathMatch?.[1]?.trim() ?? methodAndPathCell;
    const routeParts = HTTP_METHOD_PATTERN.exec(methodAndPath);
    expect(routeParts).not.toBeNull();

    const contractNames = Array.from(contractsCell.matchAll(/`([^`]+)`/gu)).map((match) =>
      match[1].trim(),
    );
    const normalizedContracts =
      contractNames.length > 0
        ? contractNames
        : contractsCell
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0);

    parsedRows.push({
      method: (routeParts as RegExpExecArray)[1],
      path: (routeParts as RegExpExecArray)[2],
      contracts: normalizedContracts,
    });
  }

  return parsedRows;
};

const toStableKey = (row: EndpointContractRow): string =>
  `${row.method} ${row.path} -> ${row.contracts.join(', ')}`;

const normalizeRows = (rows: EndpointContractRow[]): string[] =>
  rows.map(toStableKey).sort((left, right) => left.localeCompare(right));

describe('integration.contract.contract-lock-drift', () => {
  it('ITX-032 / B-CONTRACT-004 keeps spec section 6.9.1 and web spec section 6.2 synchronized', () => {
    const serverRows = parseContractLockRows({
      markdownPath: serverSpecPath,
      sectionHeadingPrefix: '## 6.9.1 Web SPA Endpoint Contract Lock',
    });
    const webRows = parseContractLockRows({
      markdownPath: webSpecPath,
      sectionHeadingPrefix: '### 6.2 Endpoint Usage Matrix (Normative)',
    });

    const normalizedServerRows = normalizeRows(serverRows);
    const normalizedWebRows = normalizeRows(webRows);

    if (JSON.stringify(normalizedServerRows) !== JSON.stringify(normalizedWebRows)) {
      const webSet = new Set(normalizedWebRows);
      const serverSet = new Set(normalizedServerRows);
      const onlyInServer = normalizedServerRows.filter((row) => !webSet.has(row));
      const onlyInWeb = normalizedWebRows.filter((row) => !serverSet.has(row));

      throw new Error(
        [
          'Contract lock drift detected between docs/typescript-server-workflow-spec.md (6.9.1) and apps/workflow-web/docs/workflow-web-spec.md (6.2).',
          `Only in server spec: ${onlyInServer.length === 0 ? '(none)' : onlyInServer.join('; ')}`,
          `Only in web spec: ${onlyInWeb.length === 0 ? '(none)' : onlyInWeb.join('; ')}`,
        ].join('\n'),
      );
    }

    expect(normalizedServerRows).toEqual(normalizedWebRows);
  });
});
