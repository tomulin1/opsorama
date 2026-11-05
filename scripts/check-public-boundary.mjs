#!/usr/bin/env node
/**
 * Keeps references to non-public material out of this repository.
 *
 * Rules: generic patterns below, plus optional extra patterns from a local file named by
 * `git config opsorama.privatePatterns <path>` (one JavaScript regular expression per line, `#` starts a comment).
 * Files ignored by git (local agent settings, CLAUDE.local.md) are never checked.
 *
 * Modes:
 *   --staged  Check the lines added by the staged diff. Used by .githooks/pre-commit. Exit 1 on a violation.
 *   --hook    Claude Code PreToolUse hook: read the tool call JSON from stdin and check the text about to be written
 *             into this repository. Exit 2 (blocks the call and shows the reason to the agent) on a violation.
 *   --all     Check every tracked text file. Exit 1 on a violation. Intended for CI once existing references are removed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const self = 'scripts/check-public-boundary.mjs';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** Generic rules: each names what it found and how to fix it. */
const rules = [
  { pattern: /\bADR[ -]?\d{4}\b/, problem: 'a decision record reference', fix: 'state the outcome itself in the public text instead of citing the record' },
  { pattern: /\bdocs\/decisions\/|\]\((?:\.\.\/)*decisions\//, problem: 'a link into the decision records', fix: 'describe the decision in the public documentation' },
];
const extra = (() => {
  let file = '';
  try { file = git('config', '--get', 'opsorama.privatePatterns').trim(); } catch { return []; }
  const resolved = path.resolve(root, file);
  if (!fs.existsSync(resolved)) { console.error(`check-public-boundary: opsorama.privatePatterns points to a missing file (${resolved}). Fix the path with git config.`); return []; }
  return fs.readFileSync(resolved, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
    .map(source => ({ pattern: new RegExp(source), problem: 'a reference to non-public material', fix: 'remove it or replace it with public information' }));
})();
const allRules = [...rules, ...extra];

const ignored = file => { try { git('check-ignore', '-q', '--', file); return true; } catch { return false; } };
const check = (file, lines) => {
  const found = [];
  for (const { line, text } of lines) for (const rule of allRules) if (rule.pattern.test(text)) found.push(`${file}:${line}: ${rule.problem} (${text.trim().slice(0, 100)}). Fix: ${rule.fix}.`);
  return found;
};
const report = (found, exitCode) => {
  if (!found.length) return;
  console.error(`Public boundary check failed:\n${found.join('\n')}`);
  process.exit(exitCode);
};

const mode = process.argv[2];
if (mode === '--staged') {
  const diff = git('diff', '--cached', '--no-color', '--unified=0', '--diff-filter=ACMR');
  const found = []; let file = null, line = 0;
  for (const text of diff.split('\n')) {
    if (text.startsWith('+++ ')) { file = text.startsWith('+++ b/') ? text.slice(6) : null; continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(text); if (hunk) { line = Number(hunk[1]); continue; }
    if (!file || file === self) continue;
    if (text.startsWith('+')) { found.push(...check(file, [{ line, text: text.slice(1) }])); line++; }
  }
  report(found, 1);
} else if (mode === '--hook') {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const tool = input.tool_input ?? {}, target = tool.file_path ?? tool.notebook_path;
  if (!target) process.exit(0);
  const relative = path.relative(root, path.resolve(target)).split(path.sep).join('/');
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative === self || ignored(relative)) process.exit(0);
  const texts = [tool.content, tool.new_string, tool.new_source, ...(tool.edits ?? []).map(edit => edit.new_string)].filter(text => typeof text === 'string');
  const found = texts.flatMap(text => check(relative, text.split(/\r?\n/).map((value, index) => ({ line: index + 1, text: value }))));
  report(found, 2);
} else if (mode === '--all') {
  const found = [];
  for (const file of git('ls-files').split('\n').filter(Boolean)) {
    if (file === self || !/\.(md|ts|tsx|js|mjs|vue|css|json|ya?ml|txt)$/.test(file)) continue;
    found.push(...check(file, fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).map((text, index) => ({ line: index + 1, text }))));
  }
  if (found.length) console.error(`${found.length} violations.`);
  report(found, 1);
  console.log('Public boundary check passed.');
} else {
  console.error('Usage: node scripts/check-public-boundary.mjs --staged | --hook | --all');
  process.exit(64);
}
