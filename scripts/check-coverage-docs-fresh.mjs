#!/usr/bin/env node

/**
 * Quill AI Test Health Suite - Coverage Docs Freshness Check
 *
 * Verifies that coverage-related docs are present and have a recent
 * `Last updated:` date compared to the current HEAD commit.
 *
 * Checked files:
 * - docs/TEST_COVERAGE.md
 * - docs/TEST_AUDIT.md
 *
 * If any doc is missing, lacks a `Last updated:` line, or is older than
 * the allowed age window, this script exits with code 1.
 */

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DOC_PATHS = ['docs/TEST_COVERAGE.md', 'docs/TEST_AUDIT.md'];
// Maximum allowed age (in days) between doc's Last updated date and HEAD commit date
const MAX_AGE_DAYS = 2;

function parseLastUpdatedDate(markdown) {
  // Expect lines like: `> Last updated: 2025-11-29 18:22:31 UTC`
  const match = markdown.match(/^>\s*Last updated:\s*(\d{4}-\d{2}-\d{2})/m);
  if (!match) return null;
  // Interpret as UTC midnight for date-only comparison
  return new Date(match[1] + 'T00:00:00Z');
}

function getHeadCommitDate() {
  try {
    const iso = execSync('git log -1 --format=%cI', { encoding: 'utf-8' }).trim();
    return new Date(iso);
  } catch (err) {
    console.warn('[test-docs] Could not determine HEAD commit date from git; skipping freshness check.');
    return null;
  }
}

async function main() {
  const projectRoot = process.cwd();
  const headDate = getHeadCommitDate();

  if (!headDate) {
    // If we can't get a commit date (e.g. non-git environment), don't fail the build.
    process.exit(0);
  }

  const staleIssues = [];

  for (const relPath of DOC_PATHS) {
    const fullPath = path.join(projectRoot, relPath);

    if (!fs.existsSync(fullPath)) {
      staleIssues.push(`${relPath}: missing (run \`npm run test:full\` and commit generated docs)`);
      continue;
    }

    let content;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch (err) {
      staleIssues.push(`${relPath}: could not be read (${err.message})`);
      continue;
    }

    const lastUpdated = parseLastUpdatedDate(content);
    if (!lastUpdated) {
      staleIssues.push(`${relPath}: missing or malformed \`Last updated:\` line (expected "> Last updated: YYYY-MM-DD ...")`);
      continue;
    }

    const ageMs = headDate.getTime() - lastUpdated.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays > MAX_AGE_DAYS) {
      const headStr = headDate.toISOString().split('T')[0];
      const docStr = lastUpdated.toISOString().split('T')[0];
      staleIssues.push(
        `${relPath}: Last updated ${docStr}, HEAD commit ${headStr} (age ~${ageDays.toFixed(
          1,
        )} days > ${MAX_AGE_DAYS})`,
      );
    }
  }

  if (staleIssues.length > 0) {
    console.error('\n[test-docs] Coverage documentation is stale compared to the current HEAD commit:');
    for (const issue of staleIssues) {
      console.error(`  - ${issue}`);
    }
    console.error('\nRun `npm run test:full` locally to regenerate coverage docs, then commit the updated files.');
    process.exit(1);
  }

  console.log('[test-docs] Coverage docs look fresh relative to HEAD commit.');
}

main().catch((err) => {
  console.error('[test-docs] Unexpected error while checking coverage docs:', err);
  process.exit(1);
});
