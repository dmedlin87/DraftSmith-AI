#!/usr/bin/env node

/**
 * Quill AI Test Health Suite - Gap Auditor
 * 
 * Analyzes the codebase for test coverage gaps:
 * - Source files without corresponding test files
 * - Test files without corresponding source files (stale tests)
 * - Large files (>200 lines) with low coverage (<60%)
 * - Exported functions/components with 0% coverage
 * 
 * Outputs to docs/TEST_AUDIT.md and terminal
 */

import fs from 'node:fs';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// Directories to scan for source files
const SOURCE_DIRS = ['features', 'services', 'config', 'types'];
// Extensions to consider as source files
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
// Files/patterns to ignore
const IGNORE_PATTERNS = [
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /index\.ts$/,      // barrel files often don't need direct tests
  /\.d\.ts$/,
  /setup\.ts$/,
];

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

async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'coverage') {
          files.push(...await getAllFiles(fullPath, baseDir));
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return files;
}

async function getFileLineCount(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

async function main() {
  const projectRoot = process.cwd();
  const coverageDir = path.join(projectRoot, 'coverage');
  const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');
  const testsDir = path.join(projectRoot, 'tests');
  const outputPath = path.join(projectRoot, 'docs', 'TEST_AUDIT.md');

  console.log(`${colors.cyan}[test-audit] Scanning codebase for test gaps...${colors.reset}\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Gather all source files
  // ─────────────────────────────────────────────────────────────────────────────
  const sourceFiles = [];
  for (const dir of SOURCE_DIRS) {
    const dirPath = path.join(projectRoot, dir);
    const files = await getAllFiles(dirPath);
    for (const file of files) {
      const ext = path.extname(file);
      if (SOURCE_EXTENSIONS.includes(ext)) {
        const relativePath = path.relative(projectRoot, file).replace(/\\/g, '/');
        const shouldIgnore = IGNORE_PATTERNS.some(pattern => pattern.test(relativePath));
        if (!shouldIgnore) {
          sourceFiles.push({
            path: relativePath,
            lines: await getFileLineCount(file),
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Gather all test files
  // ─────────────────────────────────────────────────────────────────────────────
  const testFiles = [];
  const allTestFiles = await getAllFiles(testsDir);
  for (const file of allTestFiles) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
      testFiles.push(path.relative(projectRoot, file).replace(/\\/g, '/'));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Load coverage data if available
  // ─────────────────────────────────────────────────────────────────────────────
  let coverageData = {};
  if (fs.existsSync(coverageSummaryPath)) {
    try {
      const raw = await readFile(coverageSummaryPath, 'utf-8');
      coverageData = JSON.parse(raw);
      delete coverageData.total;
    } catch {
      console.warn(`${colors.yellow}[test-audit] Could not load coverage data${colors.reset}`);
    }
  }

  // Normalize coverage paths
  const coverageByFile = {};
  for (const [filePath, data] of Object.entries(coverageData)) {
    // Extract relative path from coverage key
    const normalized = filePath.replace(/^.*?(?=features|services|config|types)/, '');
    coverageByFile[normalized] = data;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Find source files without test files
  // ─────────────────────────────────────────────────────────────────────────────
  const missingTests = [];
  for (const source of sourceFiles) {
    // Generate expected test file path
    // features/editor/hooks/useMagicEditor.ts -> tests/hooks/useMagicEditor.test.ts
    const basename = path.basename(source.path, path.extname(source.path));
    const hasMatchingTest = testFiles.some(t => 
      t.includes(`${basename}.test.ts`) || t.includes(`${basename}.test.tsx`)
    );
    
    if (!hasMatchingTest) {
      const coverage = coverageByFile[source.path];
      missingTests.push({
        file: source.path,
        lines: source.lines,
        coverage: coverage?.statements?.pct ?? null,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Find test files without source files (potential stale tests)
  // ─────────────────────────────────────────────────────────────────────────────
  const staleTests = [];
  for (const testFile of testFiles) {
    const basename = path.basename(testFile)
      .replace('.test.tsx', '')
      .replace('.test.ts', '');
    
    // Look for a source file with this name
    const hasMatchingSource = sourceFiles.some(s => 
      path.basename(s.path, path.extname(s.path)) === basename
    );
    
    if (!hasMatchingSource && !testFile.includes('setup') && !testFile.includes('integration')) {
      staleTests.push({
        testFile,
        expectedSource: `*/${basename}.ts(x)`,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Find large files with low coverage
  // ─────────────────────────────────────────────────────────────────────────────
  const largeLowCoverage = [];
  for (const source of sourceFiles) {
    if (source.lines > 200) {
      const coverage = coverageByFile[source.path];
      const stmtPct = coverage?.statements?.pct ?? 100;
      if (stmtPct < 60) {
        largeLowCoverage.push({
          file: source.path,
          lines: source.lines,
          coverage: stmtPct,
        });
      }
    }
  }
  largeLowCoverage.sort((a, b) => a.coverage - b.coverage);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Generate report
  // ─────────────────────────────────────────────────────────────────────────────
  const now = getReferenceDate();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].replace('Z', ' UTC');

  // Summary stats
  const totalSource = sourceFiles.length;
  const testedCount = totalSource - missingTests.length;
  const testCoverageRatio = ((testedCount / totalSource) * 100).toFixed(1);

  let content = `# Test Gap Audit

> ⚠️ DO NOT EDIT BY HAND - auto-generated by \`scripts/audit-test-gaps.mjs\`  
> Last updated: ${dateStr} ${timeStr}

## Summary

| Metric | Count |
|--------|-------|
| Source files scanned | ${totalSource} |
| Source files with tests | ${testedCount} (${testCoverageRatio}%) |
| Source files missing tests | ${missingTests.length} |
| Potentially stale test files | ${staleTests.length} |
| Large files with low coverage | ${largeLowCoverage.length} |

`;

  if (missingTests.length > 0) {
    const highPriority = missingTests.filter(m => m.lines > 100);
    content += `
## Source Files Missing Tests

${highPriority.length > 0 ? `### High Priority (>100 lines)

| File | Lines | Coverage |
|------|-------|----------|
${highPriority.slice(0, 20).map(m => `| \`${m.file}\` | ${m.lines} | ${m.coverage !== null ? m.coverage.toFixed(1) + '%' : 'n/a'} |`).join('\n')}
${highPriority.length > 20 ? `\n*...and ${highPriority.length - 20} more*\n` : ''}
` : ''}
### All Missing (${missingTests.length} files)

<details>
<summary>Click to expand full list</summary>

| File | Lines | Coverage |
|------|-------|----------|
${missingTests.map(m => `| \`${m.file}\` | ${m.lines} | ${m.coverage !== null ? m.coverage.toFixed(1) + '%' : 'n/a'} |`).join('\n')}

</details>
`;
  }

  if (staleTests.length > 0) {
    content += `
## Potentially Stale Test Files

These test files don't have an obvious matching source file. They may be:
- Integration tests (expected)
- Tests for deleted code (should be removed)
- Tests with non-matching names (should be renamed)

| Test File | Expected Source |
|-----------|-----------------|
${staleTests.slice(0, 20).map(s => `| \`${s.testFile}\` | \`${s.expectedSource}\` |`).join('\n')}
${staleTests.length > 20 ? `\n*...and ${staleTests.length - 20} more*\n` : ''}
`;
  }

  if (largeLowCoverage.length > 0) {
    content += `
## Large Files with Low Coverage

Files with >200 lines and <60% statement coverage. These are high-value targets for test improvement.

| File | Lines | Coverage |
|------|-------|----------|
${largeLowCoverage.map(l => `| \`${l.file}\` | ${l.lines} | ${l.coverage.toFixed(1)}% |`).join('\n')}
`;
  }

  content += `
## How to Use This Report

1. **High Priority Missing Tests**: Focus on files >100 lines first
2. **Stale Tests**: Review and remove tests for deleted code
3. **Large Low-Coverage Files**: These are your biggest risk areas

### Running the Audit

\`\`\`bash
npm run test:audit
\`\`\`

---

*Generated by [Quill AI Test Health Suite](./scripts/audit-test-gaps.mjs)*
`;

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Write report
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  } catch (err) {
    console.error(`${colors.red}[test-audit] Failed to write TEST_AUDIT.md:${colors.reset}`, err);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Print terminal summary
  // ─────────────────────────────────────────────────────────────────────────────

  const rawLines = [
    `  ${colors.bold}QUILL AI TEST GAP AUDIT${colors.reset}`,
    `  📁 Source files:     ${colors.bold}${totalSource}${colors.reset} scanned`,
    `  ✅ With tests:       ${colors.green}${testedCount}${colors.reset} (${testCoverageRatio}%)`,
    `  ❌ Missing tests:    ${colors.yellow}${missingTests.length}${colors.reset} files`,
    `  🗑️  Stale tests:      ${colors.dim}${staleTests.length}${colors.reset} potential`,
    `  ⚠️  Large+low cov:    ${colors.red}${largeLowCoverage.length}${colors.reset} files`,
  ];

  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

  // Approximate display width: treat emoji / non-BMP chars as wide, skip variation selectors
  const getDisplayWidth = (s) => {
    const plain = stripAnsi(s);
    let width = 0;
    for (const ch of plain) {
      const code = ch.codePointAt(0);
      if (code === 0xfe0f) continue; // variation selector (no width)
      // Some emojis render as single-width in Windows terminals
      if (code === 0x1f5d1 || code === 0x26a0) {
        width += 1;
      } else {
        width += code > 0x1fff ? 2 : 1;
      }
    }
    return width;
  };

  const innerWidth = rawLines.reduce((max, line) => {
    const len = getDisplayWidth(line);
    return len > max ? len : max;
  }, 0);

  const line = '─'.repeat(innerWidth);

  // Helper to pad a row to the box width, using display-width calculation
  const makeRow = (inner) => {
    const plainLength = getDisplayWidth(inner);
    const padding = Math.max(0, innerWidth - plainLength);
    return `${colors.cyan}│${colors.reset}${inner}${' '.repeat(padding)}${colors.cyan}│${colors.reset}`;
  };

  const box = [
    `${colors.cyan}┌${line}┐${colors.reset}`,
    makeRow(rawLines[0]),
    `${colors.cyan}├${line}┤${colors.reset}`,
    makeRow(rawLines[1]),
    makeRow(rawLines[2]),
    makeRow(rawLines[3]),
    makeRow(rawLines[4]),
    makeRow(rawLines[5]),
    `${colors.cyan}└${line}┘${colors.reset}`,
    '',
    `${colors.green}✓${colors.reset} Wrote ${colors.bold}docs/TEST_AUDIT.md${colors.reset}`,
  ].join('\n');

  console.log(`\n${box}\n`);
}

main().catch((err) => {
  console.error(`${colors.red}[test-audit] Unexpected error:${colors.reset}`, err);
  process.exit(1);
});
