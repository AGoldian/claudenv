/**
 * CLI: `claudenv doctor` — health-check the claudenv setup.
 *
 * Prints a compact OK / WARN / FAIL line per check; exits 0 if no FAILs.
 */

import { stat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  claudenvHome,
  memoriesDir,
  globalDecisionsDir,
  indexMdPath,
  activeWorkspaceId,
  workspaceConnectorsDir,
} from './memory-paths.js';
import { scanForSecretLeaks } from './sources.js';
import { kimiStatus } from './kimi.js';

const OK = '[OK]  ';
const WARN = '[WARN]';
const FAIL = '[FAIL]';

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function nodeVersionCheck() {
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  if (major >= 20) return { status: OK, msg: `Node.js ${process.version}` };
  return { status: FAIL, msg: `Node.js ${process.version} — require >= 20` };
}

async function claudeCliCheck() {
  try {
    const out = execSync('claude --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { status: OK, msg: `claude CLI: ${out}` };
  } catch {
    // WARN, not FAIL — claude CLI is only required for `claudenv loop`.
    // memory / decisions / canon CLI work fine without it. FAIL'ing here
    // would also break `claudenv doctor` in CI environments where claude
    // isn't installed.
    return {
      status: WARN,
      msg: 'claude CLI not found — required for `claudenv loop`. Install from https://docs.anthropic.com/en/docs/claude-code',
    };
  }
}

async function claudenvHomeCheck() {
  if (await pathExists(claudenvHome())) {
    return { status: OK, msg: `~/.claudenv/ at ${claudenvHome()}` };
  }
  return {
    status: WARN,
    msg: `~/.claudenv/ not initialised — run \`claudenv memory init\``,
  };
}

async function memoriesLayoutCheck() {
  const required = [
    memoriesDir(),
    globalDecisionsDir(),
    join(memoriesDir(), 'canon'),
  ];
  const missing = [];
  for (const p of required) {
    if (!(await pathExists(p))) missing.push(p);
  }
  if (missing.length === 0) {
    return { status: OK, msg: 'memories/{decisions,canon}/ present' };
  }
  return {
    status: WARN,
    msg: `Missing: ${missing.map((p) => p.replace(claudenvHome(), '~/.claudenv')).join(', ')}`,
  };
}

async function indexSizeCheck() {
  if (!(await pathExists(indexMdPath()))) {
    return { status: WARN, msg: 'INDEX.md absent — run `claudenv memory index`' };
  }
  const text = await readFile(indexMdPath(), 'utf-8');
  const lines = text.split('\n').length;
  if (lines <= 100) return { status: OK, msg: `INDEX.md ${lines} lines (cap 100)` };
  return { status: WARN, msg: `INDEX.md ${lines} lines — consider rotation` };
}

async function vibeDecisionsCheck() {
  const skill = join(homedir(), '.claude', 'skills', 'vibe-decisions', 'SKILL.md');
  if (await pathExists(skill)) {
    return { status: OK, msg: 'vibe-decisions skill installed globally' };
  }
  return {
    status: WARN,
    msg: 'vibe-decisions skill not installed — run `claudenv install --force`',
  };
}

async function harnessSkillCheck() {
  const skill = join(homedir(), '.claude', 'skills', 'harness', 'SKILL.md');
  if (await pathExists(skill)) {
    return { status: OK, msg: 'harness skill installed globally (self-extension)' };
  }
  return {
    status: WARN,
    msg: 'harness skill not installed — run `claudenv install --force`',
  };
}

async function kimiBridgeCheck() {
  const k = kimiStatus();
  if (!k.installed) {
    return {
      status: WARN,
      msg: 'kimi-webbridge not installed — optional browser automation (`claudenv skills add kimi-webbridge`)',
    };
  }
  if (k.running && k.extensionConnected) {
    return { status: OK, msg: 'kimi-webbridge healthy (daemon + extension connected)' };
  }
  if (k.running) {
    return { status: WARN, msg: 'kimi-webbridge daemon up, browser extension not connected' };
  }
  return { status: WARN, msg: 'kimi-webbridge installed, daemon stopped (`kimi-webbridge start`)' };
}

async function projectHooksCheck() {
  const settingsPath = join(process.cwd(), '.claude', 'settings.json');
  if (!(await pathExists(settingsPath))) {
    return {
      status: WARN,
      msg: 'no .claude/settings.json in current project (run `/claudenv` in Claude Code)',
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(settingsPath, 'utf-8'));
  } catch {
    return { status: FAIL, msg: `.claude/settings.json is not valid JSON` };
  }
  const post = parsed?.hooks?.PostToolUse || [];
  const hasLogger = post.some((b) =>
    (b.hooks || []).some((h) => h.command && h.command.includes('decisions-logger'))
  );
  if (hasLogger) return { status: OK, msg: 'decisions-logger hook registered' };
  return {
    status: WARN,
    msg: 'decisions-logger hook NOT registered in this project',
  };
}

async function pythonModuleCheck() {
  try {
    execSync('python3 -c "import claudenv_memory"', { stdio: ['pipe', 'pipe', 'pipe'] });
    return { status: OK, msg: 'claudenv-memory (Python) importable' };
  } catch {
    return {
      status: WARN,
      msg: 'claudenv-memory (Python) not installed — optional, `pip install claudenv-memory`',
    };
  }
}

async function countDecisionsCheck() {
  let count = 0;
  try {
    const names = await readdir(globalDecisionsDir());
    count = names.filter((n) => n.endsWith('.md')).length;
  } catch {
    /* no dir */
  }
  return { status: OK, msg: `${count} global decisions logged` };
}

async function workspaceLeakCheck() {
  const id = activeWorkspaceId();
  if (!id) return { status: OK, msg: 'no active workspace — secret-leak scan skipped' };
  let files;
  try {
    files = (await readdir(workspaceConnectorsDir(id))).filter((f) => f.endsWith('.md'));
  } catch {
    return { status: OK, msg: `workspace "${id}": no connectors to scan` };
  }
  const leaks = [];
  for (const f of files) {
    try {
      const found = scanForSecretLeaks(await readFile(join(workspaceConnectorsDir(id), f), 'utf-8'));
      if (found.length) leaks.push(`${f}:${found[0].line}`);
    } catch { /* skip */ }
  }
  if (leaks.length) {
    return { status: FAIL, msg: `secret values in workspace memory: ${leaks.join(', ')} — move to .env.local` };
  }
  return { status: OK, msg: `workspace "${id}": connector memory clean (no secret values)` };
}

export async function runDoctor() {
  const checks = [
    await nodeVersionCheck(),
    await claudeCliCheck(),
    await claudenvHomeCheck(),
    await memoriesLayoutCheck(),
    await indexSizeCheck(),
    await vibeDecisionsCheck(),
    await harnessSkillCheck(),
    await kimiBridgeCheck(),
    await projectHooksCheck(),
    await pythonModuleCheck(),
    await countDecisionsCheck(),
    await workspaceLeakCheck(),
  ];

  let hasFail = false;
  const lines = [];
  for (const c of checks) {
    lines.push(`${c.status} ${c.msg}`);
    if (c.status === FAIL) hasFail = true;
  }

  return { lines, hasFail };
}
