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
const apiTypesSpecPath = resolve(
  repoRoot,
  'packages/workflow-api-types/docs/workflow-api-types-spec.md',
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
  it('ITX-032 / B-CONTRACT-004 keeps api-types spec section 2 and web spec section 6.2 synchronized', () => {
    const apiTypesRows = parseContractLockRows({
      markdownPath: apiTypesSpecPath,
      sectionHeadingPrefix: '## 2) Web SPA Endpoint Contract Lock',
    });
    const webRows = parseContractLockRows({
      markdownPath: webSpecPath,
      sectionHeadingPrefix: '### 6.2 Endpoint Usage Matrix (Normative)',
    });

    const normalizedApiTypesRows = normalizeRows(apiTypesRows);
    const normalizedWebRows = normalizeRows(webRows);

    if (JSON.stringify(normalizedApiTypesRows) !== JSON.stringify(normalizedWebRows)) {
      const webSet = new Set(normalizedWebRows);
      const apiTypesSet = new Set(normalizedApiTypesRows);
      const onlyInApiTypes = normalizedApiTypesRows.filter((row) => !webSet.has(row));
      const onlyInWeb = normalizedWebRows.filter((row) => !apiTypesSet.has(row));

      throw new Error(
        [
          'Contract lock drift detected between packages/workflow-api-types/docs/workflow-api-types-spec.md (Section 2) and apps/workflow-web/docs/workflow-web-spec.md (6.2).',
          `Only in api-types spec: ${onlyInApiTypes.length === 0 ? '(none)' : onlyInApiTypes.join('; ')}`,
          `Only in web spec: ${onlyInWeb.length === 0 ? '(none)' : onlyInWeb.join('; ')}`,
        ].join('\n'),
      );
    }

    expect(normalizedApiTypesRows).toEqual(normalizedWebRows);
  });
});
