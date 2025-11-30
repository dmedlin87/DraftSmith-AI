#!/usr/bin/env node

/**
 * Quill AI Test Health Suite - Coverage Docs Strict Consistency Check
 *
 * Ensures that coverage-related docs in the working tree match the
 * committed versions after generators have run.
 *
 * Intended usage (CI and local):
 *   1. Run coverage + doc generators (e.g. `npm run test:full`)
 *   2. Run this script (via `npm run test:docs:strict`)
 *
 * If any of the target docs differ from the committed versions (including
 * being untracked), this script exits with code 1.
 */

import { execSync } from 'node:child_process';

const DOC_PATHS = ['docs/TEST_COVERAGE.md', 'docs/TEST_AUDIT.md'];

function isGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getStatusForDocs() {
  try {
    const output = execSync(
      `git status --porcelain -- ${DOC_PATHS.map((p) => `'${p}'`).join(' ')}`,
      { encoding: 'utf-8' },
    );
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err) {
    // If git status itself fails, treat as non-fatal in non-git envs.
    return [];
  }
}

function main() {
  if (!isGitRepo()) {
    console.warn(
      '[test-docs:strict] Not in a git repository; skipping strict coverage doc consistency check.',
    );
    process.exit(0);
  }

  const lines = getStatusForDocs();

  if (lines.length === 0) {
    console.log('[test-docs:strict] Coverage docs match committed versions.');
    process.exit(0);
  }

  console.error('\n[test-docs:strict] Coverage documentation differs from the committed versions:');
  for (const line of lines) {
    // Lines are in `XY path` format (e.g. ` M docs/TEST_COVERAGE.md`, `?? docs/TEST_AUDIT.md`)
    console.error(`  - ${line}`);
  }
  console.error(
    '\nTo fix: run `npm run test:full` locally to regenerate coverage docs, then commit the updated files.',
  );
  console.error(
    'This check ensures that `docs/TEST_COVERAGE.md` and `docs/TEST_AUDIT.md` in git always match the latest generator output.',
  );

  process.exit(1);
}

main();
