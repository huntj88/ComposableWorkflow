#!/usr/bin/env node

export const run = (): string => 'workflow-cli';

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  console.log(run());
}
