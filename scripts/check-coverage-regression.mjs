#!/usr/bin/env node

/**
 * Quill AI Test Health Suite - Regression Checker
 * 
 * Compares current coverage against the last recorded snapshot in history.json.
 * Exits with code 1 if coverage drops by more than the allowed threshold.
 * 
 * Used in CI to prevent coverage regressions in PRs.
 */

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// Maximum allowed drop in coverage percentage points
const MAX_DROP = {
  statements: 2.0,
  branches: 2.0,
  functions: 2.0,
  lines: 2.0,
};

async function main() {
  const projectRoot = process.cwd();
  const coverageDir = path.join(projectRoot, 'coverage');
  const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');
  const historyPath = path.join(coverageDir, 'history.json');

  console.log(`${colors.cyan}[regression-check] Checking for coverage regression...${colors.reset}\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Load current coverage
  // ─────────────────────────────────────────────────────────────────────────────
  if (!fs.existsSync(coverageSummaryPath)) {
    console.error(`${colors.red}[regression-check] coverage-summary.json not found.${colors.reset}`);
    console.error('Run `npm run test:coverage` first.');
    process.exit(1);
  }

  let current;
  try {
    const raw = await readFile(coverageSummaryPath, 'utf-8');
    const json = JSON.parse(raw);
    current = {
      statements: json.total.statements.pct,
      branches: json.total.branches.pct,
      functions: json.total.functions.pct,
      lines: json.total.lines.pct,
    };
  } catch (err) {
    console.error(`${colors.red}[regression-check] Failed to read coverage:${colors.reset}`, err);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Load baseline from history
  // ─────────────────────────────────────────────────────────────────────────────
  let baseline = null;
  if (fs.existsSync(historyPath)) {
    try {
      const raw = await readFile(historyPath, 'utf-8');
      const history = JSON.parse(raw);
      if (Array.isArray(history) && history.length > 0) {
        // Use second-to-last entry as baseline (last is current run)
        baseline = history.length > 1 ? history[history.length - 2] : history[history.length - 1];
      }
    } catch {
      console.warn(`${colors.yellow}[regression-check] Could not read history.json${colors.reset}`);
    }
  }

  if (!baseline) {
    console.log(`${colors.yellow}[regression-check] No baseline found in history.json. Skipping regression check.${colors.reset}`);
    console.log('This is normal for the first run or if history was cleared.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Compare and check for regressions
  // ─────────────────────────────────────────────────────────────────────────────
  const metrics = ['statements', 'branches', 'functions', 'lines'];
  const regressions = [];
  const results = [];

  for (const metric of metrics) {
    const currentVal = current[metric];
    const baselineVal = baseline[metric];
    const delta = currentVal - baselineVal;
    const maxDrop = MAX_DROP[metric];
    const passed = delta >= -maxDrop;

    results.push({
      metric,
      baseline: baselineVal,
      current: currentVal,
      delta,
      maxDrop,
      passed,
    });

    if (!passed) {
      regressions.push({
        metric,
        dropped: Math.abs(delta).toFixed(2),
        allowed: maxDrop,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Print results
  // ─────────────────────────────────────────────────────────────────────────────
  const line = '─'.repeat(62);
  const baselineDate = baseline.date ? baseline.date.split('T')[0] : 'unknown';

  console.log(`${colors.cyan}┌${line}┐${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset}  ${colors.bold}COVERAGE REGRESSION CHECK${colors.reset}${' '.repeat(35)}${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset}  Baseline: ${colors.dim}${baselineDate}${colors.reset}${' '.repeat(Math.max(0, 48 - baselineDate.length))}${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}├${line}┤${colors.reset}`);

  for (const r of results) {
    const deltaStr = r.delta >= 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2);
    const statusIcon = r.passed ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
    const deltaColor = r.delta >= 0 ? colors.green : r.passed ? colors.yellow : colors.red;
    
    const metricPadded = r.metric.charAt(0).toUpperCase() + r.metric.slice(1);
    console.log(
      `${colors.cyan}│${colors.reset}  ${statusIcon} ${metricPadded}: ${r.baseline.toFixed(2)}% → ${r.current.toFixed(2)}% (${deltaColor}${deltaStr}%${colors.reset})${' '.repeat(Math.max(0, 20 - metricPadded.length))}${colors.cyan}│${colors.reset}`
    );
  }

  console.log(`${colors.cyan}└${line}┘${colors.reset}`);
  console.log();

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Exit with appropriate code
  // ─────────────────────────────────────────────────────────────────────────────
  if (regressions.length > 0) {
    console.log(`${colors.red}${colors.bold}REGRESSION DETECTED${colors.reset}`);
    console.log();
    for (const r of regressions) {
      console.log(`  ${colors.red}✗${colors.reset} ${r.metric}: dropped ${r.dropped}% (max allowed: ${r.allowed}%)`);
    }
    console.log();
    console.log(`${colors.yellow}To fix: Add tests to improve coverage, or update the baseline if the drop is intentional.${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}NO REGRESSION${colors.reset} - Coverage is stable or improving!`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`${colors.red}[regression-check] Unexpected error:${colors.reset}`, err);
  process.exit(1);
});
