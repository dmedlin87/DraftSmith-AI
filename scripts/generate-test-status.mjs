#!/usr/bin/env node

/**
 * Quill AI Test Health Suite - Status Generator
 * 
 * Generates docs/TEST_COVERAGE.md with:
 * - Hero badge line (quick-glance summary)
 * - Coverage summary table
 * - Test counts table
 * - Threshold health check
 * - Coverage gaps (0% and <50% files)
 * - Lowest 10 coverage files
 * - Historical trend (from coverage/history.json)
 * 
 * Also prints a colored terminal summary.
 */

import fs from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// Coverage thresholds (must match vite.config.ts)
const THRESHOLDS = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80,
};

// Determine the reference date for this report.
// Priority:
// 1. QUILL_COVERAGE_DATE env var (ISO string or YYYY-MM-DD)
// 2. If QUILL_COVERAGE_USE_GIT_DATE=1, use git HEAD commit date
// 3. Fallback to current system time
function getReferenceDate() {
  const envDate = process.env.QUILL_COVERAGE_DATE;
  if (envDate) {
    const d = new Date(envDate);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (process.env.QUILL_COVERAGE_USE_GIT_DATE === '1') {
    try {
      const iso = execSync('git log -1 --format=%cI', { encoding: 'utf-8' }).trim();
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return d;
    } catch {
      // fall through to system time
    }
  }

  return new Date();
}

async function main() {
  const projectRoot = process.cwd();
  const coverageDir = path.join(projectRoot, 'coverage');
  const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');
  const vitestReportPath = path.join(coverageDir, 'vitest-report.json');
  const historyPath = path.join(coverageDir, 'history.json');
  const outputPath = path.join(projectRoot, 'docs', 'TEST_COVERAGE.md');

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Load coverage summary (required)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!fs.existsSync(coverageSummaryPath)) {
    console.error(`${colors.red}[test-status] coverage/coverage-summary.json not found.${colors.reset}`);
    console.error('Run `npm run test:coverage` first, then re-run this script.');
    process.exit(1);
  }

  let summaryJson;
  try {
    const summaryRaw = await readFile(coverageSummaryPath, 'utf-8');
    summaryJson = JSON.parse(summaryRaw);
  } catch (err) {
    console.error(`${colors.red}[test-status] Failed to read/parse coverage summary:${colors.reset}`, err);
    process.exit(1);
  }

  const total = summaryJson.total;
  if (!total?.statements || !total?.branches || !total?.functions || !total?.lines) {
    console.error(`${colors.red}[test-status] Unexpected coverage summary format.${colors.reset}`);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Load test counts (optional)
  // ─────────────────────────────────────────────────────────────────────────────
  let testCounts = null;
  if (fs.existsSync(vitestReportPath)) {
    try {
      const vitestRaw = await readFile(vitestReportPath, 'utf-8');
      const vitestJson = JSON.parse(vitestRaw);
      testCounts = {
        totalTests: vitestJson.numTotalTests ?? 0,
        passedTests: vitestJson.numPassedTests ?? 0,
        failedTests: vitestJson.numFailedTests ?? 0,
        pendingTests: vitestJson.numPendingTests ?? 0,
        todoTests: vitestJson.numTodoTests ?? 0,
        totalSuites: vitestJson.numTotalTestSuites ?? 0,
        passedSuites: vitestJson.numPassedTestSuites ?? 0,
        failedSuites: vitestJson.numFailedTestSuites ?? 0,
        pendingSuites: vitestJson.numPendingTestSuites ?? 0,
      };
    } catch (err) {
      console.warn(`${colors.yellow}[test-status] Could not read vitest-report.json, skipping test counts.${colors.reset}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Load history (optional) and append current run
  // ─────────────────────────────────────────────────────────────────────────────
  let history = [];
  if (fs.existsSync(historyPath)) {
    try {
      const historyRaw = await readFile(historyPath, 'utf-8');
      history = JSON.parse(historyRaw);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  }

  const now = getReferenceDate();
  const currentSnapshot = {
    date: now.toISOString(),
    statements: total.statements.pct,
    branches: total.branches.pct,
    functions: total.functions.pct,
    lines: total.lines.pct,
    totalTests: testCounts?.totalTests ?? null,
    passedTests: testCounts?.passedTests ?? null,
    failedTests: testCounts?.failedTests ?? null,
  };

  // Avoid duplicate entries if run multiple times same minute
  const lastEntry = history[history.length - 1];
  const shouldAppend = !lastEntry || 
    Math.abs(new Date(lastEntry.date).getTime() - now.getTime()) > 60000;
  
  if (shouldAppend) {
    history.push(currentSnapshot);
    // Keep last 100 entries
    if (history.length > 100) {
      history = history.slice(-100);
    }
    try {
      await mkdir(coverageDir, { recursive: true });
      await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`${colors.yellow}[test-status] Could not write history.json${colors.reset}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Analyze per-file coverage for gaps and lowest files
  // ─────────────────────────────────────────────────────────────────────────────
  const fileEntries = Object.entries(summaryJson)
    .filter(([key]) => key !== 'total')
    .map(([filePath, data]) => ({
      file: filePath.replace(/^.*?(?=features|services|config|types|App|index)/, ''),
      statements: data.statements?.pct ?? 0,
      branches: data.branches?.pct ?? 0,
      functions: data.functions?.pct ?? 0,
      lines: data.lines?.pct ?? 0,
      linesTotal: data.lines?.total ?? 0,
    }));

  const uncoveredFiles = fileEntries.filter(f => f.statements === 0);
  const lowCoverageFiles = fileEntries.filter(f => f.statements > 0 && f.statements < 50);
  const lowestFiles = [...fileEntries]
    .sort((a, b) => a.statements - b.statements)
    .slice(0, 10);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Calculate threshold health
  // ─────────────────────────────────────────────────────────────────────────────
  const thresholdChecks = [
    { metric: 'Statements', current: total.statements.pct, target: THRESHOLDS.statements },
    { metric: 'Branches', current: total.branches.pct, target: THRESHOLDS.branches },
    { metric: 'Functions', current: total.functions.pct, target: THRESHOLDS.functions },
    { metric: 'Lines', current: total.lines.pct, target: THRESHOLDS.lines },
  ].map(t => ({
    ...t,
    pass: t.current >= t.target,
    status: t.current >= t.target ? '✅ Pass' : '❌ **Below threshold**',
  }));

  const allThresholdsPassing = thresholdChecks.every(t => t.pass);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Calculate trend
  // ─────────────────────────────────────────────────────────────────────────────
  let trendSection = '';
  if (history.length >= 2) {
    const recent = history.slice(-10);
    const prev = history[history.length - 2];
    const delta = (total.statements.pct - prev.statements).toFixed(2);
    const deltaSign = parseFloat(delta) >= 0 ? '+' : '';
    const trendEmoji = parseFloat(delta) > 0 ? '📈' : parseFloat(delta) < 0 ? '📉' : '➡️';

    trendSection = `
## Coverage Trend

${trendEmoji} **Statements:** ${deltaSign}${delta}% since last run

| Date | Statements | Branches | Functions | Tests |
|------|------------|----------|-----------|-------|
${recent.slice().reverse().map(h => {
  const d = h.date.split('T')[0];
  return `| ${d} | ${h.statements?.toFixed(2) ?? 'n/a'}% | ${h.branches?.toFixed(2) ?? 'n/a'}% | ${h.functions?.toFixed(2) ?? 'n/a'}% | ${h.totalTests ?? 'n/a'} |`;
}).join('\n')}
`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Build markdown content
  // ─────────────────────────────────────────────────────────────────────────────
  const fmt = (pct) => typeof pct === 'number' ? `${pct.toFixed(2)}%` : 'n/a';
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].replace('Z', ' UTC');

  // Hero line
  const testEmoji = testCounts?.failedTests > 0 ? '❌' : '✅';
  const heroTests = testCounts ? `**🧪 ${testCounts.totalTests} tests** • **${testEmoji} ${testCounts.passedTests} passed**${testCounts.failedTests > 0 ? ` • **❌ ${testCounts.failedTests} failed**` : ''}` : '';
  const heroLine = `${heroTests}${heroTests ? ' • ' : ''}**📊 ${fmt(total.statements.pct)} statements** • **🕐 ${dateStr}**`;

  // Test counts section
  let countsSection = '';
  if (testCounts) {
    countsSection = `
## Test Counts

| Metric | Count |
|--------|-------|
| Test suites | ${testCounts.totalSuites} (${testCounts.passedSuites} passed, ${testCounts.failedSuites} failed) |
| Tests | ${testCounts.totalTests} (${testCounts.passedTests} passed, ${testCounts.failedTests} failed) |
| Pending | ${testCounts.pendingTests} |
| Todo | ${testCounts.todoTests} |
`;
  }

  // Threshold health section
  const thresholdSection = `
## Threshold Health

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
${thresholdChecks.map(t => `| ${t.metric} | ${fmt(t.current)} | ${t.target}% | ${t.status} |`).join('\n')}
`;

  // Coverage gaps section
  let gapsSection = '';
  if (uncoveredFiles.length > 0 || lowCoverageFiles.length > 0) {
    gapsSection = `
## Coverage Gaps
`;
    if (uncoveredFiles.length > 0) {
      gapsSection += `
### Uncovered Files (0%)

| File | Lines |
|------|-------|
${uncoveredFiles.slice(0, 20).map(f => `| \`${f.file}\` | ${f.linesTotal} |`).join('\n')}
${uncoveredFiles.length > 20 ? `\n*...and ${uncoveredFiles.length - 20} more*\n` : ''}`;
    }
    if (lowCoverageFiles.length > 0) {
      gapsSection += `
### Low Coverage (<50%)

| File | Statements | Branches | Functions |
|------|------------|----------|-----------|
${lowCoverageFiles.slice(0, 15).map(f => `| \`${f.file}\` | ${fmt(f.statements)} | ${fmt(f.branches)} | ${fmt(f.functions)} |`).join('\n')}
${lowCoverageFiles.length > 15 ? `\n*...and ${lowCoverageFiles.length - 15} more*\n` : ''}`;
    }
  }

  // Lowest 10 files section
  const lowestSection = `
## Lowest Coverage Files

| Rank | File | Stmts | Branches | Functions |
|------|------|-------|----------|-----------|
${lowestFiles.map((f, i) => `| ${i + 1} | \`${f.file}\` | ${fmt(f.statements)} | ${fmt(f.branches)} | ${fmt(f.functions)} |`).join('\n')}
`;

  const content = `# Test Coverage Report

${heroLine}

> ⚠️ DO NOT EDIT BY HAND - auto-generated by \`scripts/generate-test-status.mjs\`  
> Last updated: ${dateStr} ${timeStr}

## Coverage Summary

| Metric | Percentage |
|--------|------------|
| Statements | ${fmt(total.statements.pct)} |
| Branches | ${fmt(total.branches.pct)} |
| Functions | ${fmt(total.functions.pct)} |
| Lines | ${fmt(total.lines.pct)} |
${countsSection}${thresholdSection}${gapsSection}${lowestSection}${trendSection}
## How This Report Is Generated

\`\`\`bash
npm run test:coverage   # Run tests with coverage
npm run test:status     # Generate this report
npm run test:full       # Both in one command
\`\`\`

The full HTML coverage report is available at \`coverage/index.html\` after running coverage.

---

*Generated by [Quill AI Test Health Suite](./scripts/generate-test-status.mjs)*
`;

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Write markdown file
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  } catch (err) {
    console.error(`${colors.red}[test-status] Failed to write TEST_COVERAGE.md:${colors.reset}`, err);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Print terminal summary
  // ─────────────────────────────────────────────────────────────────────────────
  const line = '─'.repeat(62);
  const thresholdIcon = allThresholdsPassing 
    ? `${colors.green}✅ All thresholds passing${colors.reset}`
    : `${colors.red}❌ Some thresholds failing${colors.reset}`;

  // Helper to pad a row to the box width, ignoring ANSI color codes
  const makeRow = (inner) => {
    const plainLength = inner.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = Math.max(0, 62 - plainLength);
    return `${colors.cyan}│${colors.reset}${inner}${' '.repeat(padding)}${colors.cyan}│${colors.reset}`;
  };

  const testsLine = `  🧪 Tests:      ${colors.bold}${testCounts?.totalTests ?? '?'}${colors.reset} total │ ${colors.green}${testCounts?.passedTests ?? '?'} passed${colors.reset} │ ${testCounts?.failedTests > 0 ? colors.red : colors.dim}${testCounts?.failedTests ?? 0} failed${colors.reset}`;
  const coverageLine = `  📊 Coverage:   ${colors.bold}${fmt(total.statements.pct)}${colors.reset} stmts │ ${fmt(total.branches.pct)} branch │ ${fmt(total.functions.pct)} fn`;
  const gapsLine = `  ⚠️  Gaps: ${colors.yellow}${uncoveredFiles.length}${colors.reset} files at 0%, ${colors.yellow}${lowCoverageFiles.length}${colors.reset} files below 50%`;
  const historyLine = `  📈 History: ${colors.dim}${history.length} snapshots tracked${colors.reset}`;

  const box = [
    `${colors.cyan}┌${line}┐${colors.reset}`,
    makeRow(`  ${colors.bold}QUILL AI TEST HEALTH${colors.reset}`),
    `${colors.cyan}├${line}┤${colors.reset}`,
    makeRow(testsLine),
    makeRow(coverageLine),
    makeRow(`  ${thresholdIcon}`),
    `${colors.cyan}├${line}┤${colors.reset}`,
    makeRow(gapsLine),
    makeRow(historyLine),
    `${colors.cyan}└${line}┘${colors.reset}`,
    '',
    `${colors.green}✓${colors.reset} Wrote ${colors.bold}docs/TEST_COVERAGE.md${colors.reset}`,
    `${colors.green}✓${colors.reset} Updated ${colors.bold}coverage/history.json${colors.reset}`,
  ].join('\n');

  console.log(`\n${box}\n`);
}

main().catch((err) => {
  console.error(`${colors.red}[test-status] Unexpected error:${colors.reset}`, err);
  process.exit(1);
});
