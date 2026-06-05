#!/usr/bin/env node

import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { readFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { detectTechStack } from '../src/detector.js';
import { generateDocs, writeDocs, installScaffold } from '../src/generator.js';
import { validateClaudeMd, validateStructure, crossReferenceCheck } from '../src/validator.js';
import { runExistingProjectFlow, runColdStartFlow, buildDefaultConfig } from '../src/prompts.js';
import { installGlobal, uninstallGlobal } from '../src/installer.js';
import { runLoop, rollback, checkClaudeCli, readLoopLog } from '../src/loop.js';
import { generateAutonomyConfig, printSecuritySummary, getFullModeWarning } from '../src/autonomy.js';
import { getProfile, listProfiles } from '../src/profiles.js';
import { readReport, formatReport, formatEventLine, watchReport } from '../src/report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgJson = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('claudenv')
  .description('One command to set up Claude Code documentation for any project')
  .version(pkgJson.version);

// --- Default action: install global Claude Code command ---
program
  .option('-f, --force', 'Overwrite existing files')
  .action(runInstall);

// --- install (explicit subcommand, same logic) ---
program
  .command('install')
  .description('Install /claudenv command globally into ~/.claude/')
  .option('-f, --force', 'Overwrite existing files')
  .action(runInstall);

// --- uninstall ---
program
  .command('uninstall')
  .description('Remove /claudenv command from ~/.claude/')
  .action(runUninstall);

// --- init (legacy static flow for backward compatibility) ---
program
  .command('init')
  .description('Legacy: static analysis + interactive setup (no Claude AI)')
  .argument('[dir]', 'Project directory', '.')
  .option('-y, --yes', 'Skip prompts, use auto-detected defaults')
  .option('--overwrite', 'Overwrite existing files')
  .action(runInit);

// --- generate (templates only, no scaffold, no prompts) ---
program
  .command('generate')
  .description('Non-interactive generation (templates only, no Claude Code commands)')
  .option('-d, --dir <path>', 'Project directory', '.')
  .option('--overwrite', 'Overwrite existing files', false)
  .option('--no-rules', 'Skip generating rules files')
  .option('--no-hooks', 'Skip generating hooks/settings.json')
  .action(async (opts) => {
    const projectDir = resolve(opts.dir);
    const detected = await detectTechStack(projectDir);

    if (!detected.language) {
      console.error('No project files detected. Use `init` for interactive setup.');
      process.exit(1);
    }

    console.log(`Detected: ${detected.language}${detected.framework ? ` + ${detected.framework}` : ''}`);

    const config = {
      ...detected,
      projectDescription: `${detected.framework || detected.language} project`,
      generateRules: opts.rules !== false,
      generateHooks: opts.hooks !== false,
    };

    const { files } = await generateDocs(projectDir, config);
    const { written, skipped } = await writeDocs(projectDir, files, {
      overwrite: opts.overwrite,
    });

    printFileResults(written, skipped);
  });

// --- validate ---
program
  .command('validate')
  .description('Run validation checks on documentation')
  .option('-d, --dir <path>', 'Project directory', '.')
  .action(async (opts) => {
    const projectDir = resolve(opts.dir);
    let hasErrors = false;

    console.log('Validating documentation...\n');

    const claudeResult = await validateClaudeMd(join(projectDir, 'CLAUDE.md'));
    printValidation('CLAUDE.md', claudeResult);
    if (!claudeResult.valid) hasErrors = true;

    const structResult = await validateStructure(projectDir);
    printValidation('Structure', structResult);
    if (!structResult.valid) hasErrors = true;

    const xrefResult = await crossReferenceCheck(projectDir);
    printValidation('Cross-references', xrefResult);
    if (!xrefResult.valid) hasErrors = true;

    if (hasErrors) {
      console.log('\nValidation failed.');
      process.exit(2);
    } else {
      console.log('\nAll checks passed.');
    }
  });

// --- loop ---
program
  .command('loop')
  .description('Iterative improvement loop — spawn Claude to analyze and improve the project')
  .option('-n, --iterations <n>', 'Max iterations (default: unlimited)', parseInt)
  .option('--trust', 'Full trust mode — no pauses, no permission prompts')
  .option('--goal <text>', 'Focus area for improvements')
  .option('--pause', 'Pause between iterations (default: on unless --trust)')
  .option('--no-pause', 'Do not pause between iterations')
  .option('--max-turns <n>', 'Max agentic turns per iteration (default: 30)', parseInt)
  .option('--model <model>', 'Model to use (default: sonnet)')
  .option('--budget <usd>', 'Budget cap per iteration in USD', parseFloat)
  .option('-d, --dir <path>', 'Target project directory')
  .option('--allow-dirty', 'Allow running with uncommitted git changes')
  .option('--rollback', 'Undo all changes from the most recent loop run')
  .option('--resume', 'Resume from last rate-limited iteration')
  .option('--unsafe', 'Remove default tool restrictions (allows rm -rf)')
  .option('--worktree', 'Run each iteration in an isolated git worktree')
  .option('--profile <name>', 'Autonomy profile: safe, moderate, full, ci')
  .action(async (opts) => {
    // --- Rollback mode ---
    if (opts.rollback) {
      await rollback({ cwd: opts.dir ? resolve(opts.dir) : process.cwd() });
      return;
    }

    // --- Resume mode ---
    if (opts.resume) {
      const resumeCwd = opts.dir ? resolve(opts.dir) : process.cwd();
      const prevLog = await readLoopLog(resumeCwd);
      if (!prevLog || !prevLog.pausedAt) {
        console.error('\n  No resumable loop found. Run a loop first or check .claude/loop-log.json.\n');
        process.exit(1);
      }
      const saved = prevLog.options || {};
      console.log(`\n  Resuming loop from iteration ${prevLog.pausedAt.iteration}`);
      console.log(`  Goal: ${saved.goal || 'General improvement'}`);
      console.log(`  Session: ${prevLog.pausedAt.sessionId || 'new'}\n`);

      await runLoop({
        iterations: opts.iterations || Infinity,
        trust: saved.trust || false,
        goal: saved.goal,
        pause: false,
        maxTurns: saved.maxTurns || 30,
        model: opts.model || saved.model,
        budget: saved.budget,
        cwd: resumeCwd,
        allowDirty: true,
        worktree: saved.worktree || false,
        startIteration: prevLog.pausedAt.iteration,
        initialSessionId: prevLog.pausedAt.sessionId,
      });
      return;
    }

    // --- Pre-flight: check Claude CLI ---
    const cli = checkClaudeCli();
    if (!cli.installed) {
      console.error('\n  Error: Claude CLI not found.');
      console.error('  Install it from https://docs.anthropic.com/en/docs/claude-code\n');
      process.exit(1);
    }
    console.log(`\n  claudenv loop v${pkgJson.version}`);
    console.log(`  Claude CLI: ${cli.version}`);

    const cwd = opts.dir ? resolve(opts.dir) : process.cwd();

    // --- Auto-detect project autonomy config ---
    if (!opts.profile && !opts.trust) {
      try {
        const settingsPath = join(cwd, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
        if (!settings.permissions || (!settings.permissions.allow && !settings.permissions.deny)) {
          opts.trust = true;
          console.log('  Auto-detected: full autonomy config (.claude/settings.json)');
        }
      } catch {
        // No settings.json or invalid — proceed normally
      }
    }

    // --- Load profile if specified ---
    let profileDefaults = {};
    if (opts.profile) {
      const profile = getProfile(opts.profile);
      profileDefaults = {
        trust: profile.skipPermissions,
        disallowedTools: profile.disallowedTools,
        maxTurns: profile.maxTurns,
        budget: profile.maxBudget,
        model: profile.model,
      };
      console.log(`  Profile: ${profile.name} — ${profile.description}`);
    }

    // --- Config summary ---
    const trust = opts.trust || profileDefaults.trust || false;
    const pause = opts.pause !== undefined ? opts.pause : !trust;

    console.log(`  Directory: ${cwd}`);
    console.log(`  Mode: ${trust ? 'full trust (--dangerously-skip-permissions)' : 'interactive'}`);
    if (opts.worktree) console.log(`  Worktree: enabled (each iteration in isolated worktree)`);
    if (opts.iterations) console.log(`  Max iterations: ${opts.iterations}`);
    if (opts.goal) console.log(`  Goal: ${opts.goal}`);
    const model = opts.model || profileDefaults.model || undefined;
    if (model) console.log(`  Model: ${model}`);
    if (opts.budget || profileDefaults.budget) console.log(`  Budget: $${opts.budget || profileDefaults.budget}/iteration`);
    if (opts.maxTurns || profileDefaults.maxTurns) console.log(`  Max turns: ${opts.maxTurns || profileDefaults.maxTurns}`);

    await runLoop({
      iterations: opts.iterations,
      trust,
      goal: opts.goal,
      pause,
      maxTurns: opts.maxTurns || profileDefaults.maxTurns || 30,
      model,
      budget: opts.budget || profileDefaults.budget,
      cwd,
      allowDirty: opts.allowDirty || false,
      unsafe: opts.unsafe || false,
      worktree: opts.worktree || false,
      disallowedTools: profileDefaults.disallowedTools,
    });
  });

// --- report ---
program
  .command('report')
  .description('View work report from autonomous loop runs')
  .option('-f, --follow', 'Live stream events (tail -f style)')
  .option('--last <n>', 'Show last N events', parseInt)
  .option('-d, --dir <path>', 'Project directory')
  .action(async (opts) => {
    const cwd = opts.dir ? resolve(opts.dir) : process.cwd();
    const events = await readReport(cwd);

    if (opts.follow) {
      // Print existing events first
      if (events.length > 0) {
        const show = opts.last ? events.slice(-opts.last) : events;
        process.stdout.write(formatReport(show));
      }
      console.log('  Watching for new events... (Ctrl+C to stop)\n');
      await watchReport(cwd, (event) => {
        process.stdout.write(formatEventLine(event));
      });
      return;
    }

    if (events.length === 0) {
      console.log('\n  No work report found. Run `claudenv loop` first.\n');
      return;
    }

    const show = opts.last ? events.slice(-opts.last) : events;
    console.log();
    process.stdout.write(formatReport(show));
  });

// --- autonomy ---
program
  .command('autonomy')
  .description('Configure autonomous agent mode with safety guardrails')
  .option('-p, --profile <name>', 'Profile: safe, moderate, full, ci')
  .option('-d, --dir <path>', 'Project directory', '.')
  .option('--overwrite', 'Overwrite existing files')
  .option('-y, --yes', 'Skip prompts')
  .option('--dry-run', 'Preview without writing')
  .action(runAutonomy);

// --- hook (internal entry point for Claude Code hooks) ---
program
  .command('hook')
  .description('Internal: dispatch a Claude Code hook by name (decisions-logger, regen-index)')
  .argument('<name>', 'Hook name')
  .action(async (name) => {
    const { dispatch } = await import('../src/hooks/dispatcher.js');
    await dispatch(name);
  });

// =============================================
// 1.3.0: memory / decisions / canon / doctor
// =============================================

// --- memory ---
const memoryCmd = program.command('memory').description('Manage the global ~/.claudenv/memories/ layout');

memoryCmd
  .command('init')
  .description('Create the ~/.claudenv/memories/ structure (idempotent)')
  .action(async () => {
    const { memoryInit } = await import('../src/memory.js');
    const { created, skipped } = await memoryInit();
    for (const p of created) console.log(`  + ${p}`);
    for (const p of skipped) console.log(`  ~ ${p}`);
    console.log(`\n  ${created.length} created, ${skipped.length} already present.`);
  });

memoryCmd
  .command('index')
  .description('Regenerate ~/.claudenv/memories/INDEX.md from current decisions and prefs')
  .action(async () => {
    const { memoryIndex } = await import('../src/memory.js');
    const result = await memoryIndex();
    console.log(`  INDEX.md regenerated → ${result.indexPath}`);
    console.log(`  ${result.recentCount} recent of ${result.decisionCount} total decisions`);
  });

memoryCmd
  .command('show')
  .argument('<path>', 'Path relative to ~/.claudenv/memories/')
  .description('Print a memory file to stdout')
  .action(async (path) => {
    const { memoryShow } = await import('../src/memory.js');
    try {
      process.stdout.write(await memoryShow(path));
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
  });

memoryCmd
  .command('edit')
  .argument('<path>', 'Path relative to ~/.claudenv/memories/')
  .description('Open a memory file in $EDITOR (vi by default)')
  .action(async (path) => {
    const { memoryEdit } = await import('../src/memory.js');
    const result = await memoryEdit(path);
    process.exit(result.exitCode);
  });

// --- decisions ---
const decisionsCmd = program.command('decisions').description('List, show, or search logged vibe-decisions');

decisionsCmd
  .command('list')
  .description('List recent decisions (newest first)')
  .option('--scope <s>', 'global | project | all', 'all')
  .option('--limit <n>', 'Max entries', '10')
  .action(async (opts) => {
    const { listDecisions, formatDecisionList } = await import('../src/decisions.js');
    const limit = parseInt(opts.limit, 10) || 10;
    const all = await listDecisions({ scope: opts.scope });
    console.log(formatDecisionList(all.slice(0, limit)));
  });

decisionsCmd
  .command('show')
  .argument('<id>', 'Slug or substring of the decision')
  .description('Show full details of one decision')
  .action(async (id) => {
    const { showDecision, formatDecisionDetail } = await import('../src/decisions.js');
    try {
      const d = await showDecision(id);
      console.log(formatDecisionDetail(d));
      console.log('\n---\n');
      console.log(d.text);
    } catch (err) {
      console.error(err.message);
      process.exit(err.notFound ? 1 : 2);
    }
  });

decisionsCmd
  .command('search')
  .argument('<query>', 'Substring to search topic/reason/chose')
  .description('Search decisions')
  .action(async (query) => {
    const { searchDecisions, formatDecisionList } = await import('../src/decisions.js');
    const hits = await searchDecisions(query);
    console.log(formatDecisionList(hits));
  });

decisionsCmd
  .command('archive')
  .argument('<id>', 'Slug to archive')
  .description('Move a decision into <scope-dir>/archive/')
  .action(async (id) => {
    const { archiveDecision } = await import('../src/decisions.js');
    try {
      const { from, to } = await archiveDecision(id);
      console.log(`  archived: ${from} → ${to}`);
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
  });

// --- canon ---
const canonCmd = program.command('canon').description('Personal canon of references (~/.claudenv/memories/canon/index.yaml)');

canonCmd
  .command('add')
  .argument('<topic>', 'Topic slug')
  .argument('<url>', 'URL to add')
  .option('--why <reason>', 'Why this reference is in the canon')
  .option('--title <title>', 'Title')
  .option('--author <author>', 'Author or venue')
  .action(async (topic, url, opts) => {
    const { canonAdd } = await import('../src/canon.js');
    try {
      const res = await canonAdd({
        topic,
        url,
        why: opts.why,
        title: opts.title,
        author: opts.author,
      });
      if (res.added) console.log(`  + ${topic}: ${res.entry.title || res.entry.url}`);
      else console.log(`  ~ duplicate url in ${topic} — skipped`);
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
  });

canonCmd
  .command('list')
  .argument('[topic]', 'Optional topic filter')
  .action(async (topic) => {
    const { canonList, formatCanon } = await import('../src/canon.js');
    const data = await canonList(topic);
    console.log(formatCanon(data));
  });

canonCmd
  .command('search')
  .argument('<query>', 'Substring search')
  .action(async (query) => {
    const { canonSearch, formatCanon } = await import('../src/canon.js');
    const data = await canonSearch(query);
    console.log(formatCanon(data));
  });

canonCmd
  .command('prune')
  .option('--months <n>', 'Age threshold in months', '6')
  .action(async (opts) => {
    const { canonPrune } = await import('../src/canon.js');
    const stale = await canonPrune(parseInt(opts.months, 10) || 6);
    if (stale.length === 0) {
      console.log('  No stale entries.');
      return;
    }
    for (const { topic, entry, reason } of stale) {
      const why = reason || `added ${entry.added}`;
      console.log(`  ${topic}: ${entry.url} (${why})`);
    }
  });

// =============================================
// Workspaces (isolated per-company/context memory)
// =============================================
const wsCmd = program.command('workspace').description('Isolated memory spaces (~/.claudenv/workspaces/)');

wsCmd
  .command('add')
  .argument('<id>', 'Workspace id (slug: a-z0-9-_)')
  .option('--name <name>', 'Human-readable name')
  .option('--desc <description>', 'Description')
  .option('--path <path...>', 'Project path(s) bound to this workspace')
  .action(async (id, opts) => {
    const { createWorkspace } = await import('../src/workspaces.js');
    try {
      await createWorkspace(id, { name: opts.name, description: opts.desc, paths: opts.path });
      console.log(`  + workspace "${id}" created`);
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
  });

wsCmd
  .command('list')
  .action(async () => {
    const { listWorkspaces } = await import('../src/workspaces.js');
    const list = await listWorkspaces();
    if (list.length === 0) {
      console.log('  No workspaces yet — create one with `claudenv workspace add <id>`');
      return;
    }
    for (const w of list) {
      console.log(`  ${w.active ? '*' : ' '} ${w.id}${w.name && w.name !== w.id ? ` — ${w.name}` : ''}`);
    }
  });

wsCmd
  .command('use')
  .argument('<id>', 'Workspace id to activate')
  .action(async (id) => {
    const { useWorkspace } = await import('../src/workspaces.js');
    try {
      await useWorkspace(id);
      console.log(`  active workspace → ${id}`);
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
  });

wsCmd
  .command('show')
  .action(async () => {
    const { showActive } = await import('../src/workspaces.js');
    const w = await showActive();
    if (!w) {
      console.log('  No active workspace (set CLAUDENV_WORKSPACE or run `claudenv workspace use <id>`)');
      return;
    }
    console.log(`  active: ${w.id} (${w.source})`);
    if (w.name && w.name !== w.id) console.log(`  name:   ${w.name}`);
    if (w.description) console.log(`  desc:   ${w.description}`);
    if (w.paths && w.paths.length) console.log(`  paths:  ${w.paths.join(', ')}`);
  });

// =============================================
// Sources (connectors in the active workspace)
// =============================================
const srcCmd = program.command('source').description('Data-source connectors in the active workspace');

srcCmd
  .command('list')
  .action(async () => {
    const { listConnectors } = await import('../src/sources.js');
    const { workspace, connectors } = await listConnectors();
    if (!workspace) {
      console.log('  No active workspace — set one first (`claudenv workspace use <id>`)');
      return;
    }
    if (connectors.length === 0) {
      console.log(`  [${workspace}] no connectors yet — add one via /add-source in Claude Code`);
      return;
    }
    console.log(`  [${workspace}]`);
    for (const c of connectors) {
      console.log(`    ${c.name}  (${c.type}, ${c.status})${c.host ? `  ${c.host}` : ''}`);
    }
  });

srcCmd
  .command('show')
  .argument('<name>', 'Connector name')
  .action(async (name) => {
    const { showConnector } = await import('../src/sources.js');
    const text = await showConnector(name);
    if (!text) {
      console.error(`  Connector "${name}" not found in active workspace`);
      process.exit(2);
    }
    console.log(text);
  });

// --- doctor ---
program
  .command('doctor')
  .description('Health-check the claudenv setup')
  .action(async () => {
    const { runDoctor } = await import('../src/doctor.js');
    const { lines, hasFail } = await runDoctor();
    for (const l of lines) console.log(l);
    process.exit(hasFail ? 1 : 0);
  });

// =============================================
// Install / Uninstall
// =============================================
async function runInstall(opts) {
  console.log(`\n  claudenv v${pkgJson.version}\n`);
  console.log('  Installing Claude Code integration...\n');

  const force = opts.force || false;
  const { written, skipped } = await installGlobal({ force });

  if (written.length > 0) {
    console.log(`  Installed ${written.length} file(s) to ~/.claude/:\n`);
    for (const f of written) console.log(`    + ${f}`);
  }

  if (skipped.length > 0) {
    console.log(`\n  Skipped ${skipped.length} existing file(s) (use --force to overwrite):\n`);
    for (const f of skipped) console.log(`    ~ ${f}`);
  }

  if (written.length === 0 && skipped.length > 0) {
    console.log('\n  Already installed. Use --force to reinstall.');
  }

  console.log(`
  Done! Now open Claude Code in any project and type:

    /claudenv    — Set up project documentation
    /autonomy   — Manage autonomy profiles

  Claude will analyze your project and generate documentation.
`);
}

async function runUninstall() {
  console.log(`\n  claudenv v${pkgJson.version}\n`);
  console.log('  Removing Claude Code integration...\n');

  const { removed } = await uninstallGlobal();

  if (removed.length > 0) {
    console.log(`  Removed ${removed.length} item(s) from ~/.claude/:\n`);
    for (const f of removed) console.log(`    - ${f}`);
  } else {
    console.log('  Nothing to remove — not installed.');
  }

  console.log();
}

// =============================================
// Legacy init logic
// =============================================
async function runInit(dirArg, opts) {
  // Commander passes (dir, opts) for arguments, or (opts) for options-only
  if (typeof dirArg === 'object') {
    opts = dirArg;
    dirArg = '.';
  }
  const projectDir = resolve(dirArg || '.');
  const yes = opts.yes || false;
  const overwrite = opts.overwrite || false;

  console.log(`\n  claudenv v${pkgJson.version}\n`);
  console.log(`  Scanning ${projectDir}...\n`);

  // 1. Detect tech stack
  const detected = await detectTechStack(projectDir);
  const hasProject = detected.language !== null;

  if (hasProject) {
    const parts = [detected.language];
    if (detected.framework) parts.push(detected.framework);
    const extras = [
      detected.packageManager,
      detected.testFramework,
      detected.linter,
      detected.formatter,
    ].filter(Boolean);
    console.log(`  Detected: ${parts.join(' + ')}${extras.length ? ` (${extras.join(', ')})` : ''}\n`);
  }

  // 2. Build config
  let config;
  if (yes) {
    config = hasProject
      ? await buildDefaultConfig(detected, projectDir)
      : {
          language: null,
          generateRules: true,
          generateHooks: true,
          projectDescription: 'New project',
        };
  } else {
    config = hasProject
      ? await runExistingProjectFlow(detected)
      : await runColdStartFlow();
  }

  // 3. Generate template-based files (CLAUDE.md, rules, settings.json)
  const { files } = await generateDocs(projectDir, config);
  const docResult = await writeDocs(projectDir, files, { overwrite });

  // 4. Install scaffold (Claude Code commands, skills, agents)
  const scaffoldResult = await installScaffold(projectDir, { overwrite });

  // 5. Print results
  const allWritten = [...docResult.written, ...scaffoldResult.written];
  const allSkipped = [...docResult.skipped, ...scaffoldResult.skipped];

  if (allWritten.length > 0) {
    console.log(`\n  Created ${allWritten.length} file(s):\n`);
    for (const f of allWritten) console.log(`    + ${f}`);
  }

  if (allSkipped.length > 0) {
    console.log(`\n  Skipped ${allSkipped.length} existing file(s) (use --overwrite to replace):\n`);
    for (const f of allSkipped) console.log(`    ~ ${f}`);
  }

  // 6. Next steps
  console.log(`
  Next steps:
    1. Review and edit CLAUDE.md
    2. In Claude Code, try: /init-docs  /update-docs  /validate-docs
    3. git add .claude/ CLAUDE.md && git commit -m "Add Claude Code docs"
`);
}

function printFileResults(written, skipped) {
  if (written.length > 0) {
    console.log(`Written ${written.length} file(s):`);
    for (const f of written) console.log(`  + ${f}`);
  }
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} existing file(s) (use --overwrite):`);
    for (const f of skipped) console.log(`  ~ ${f}`);
  }
}

function printValidation(label, result) {
  const status = result.valid ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label}`);
  for (const err of result.errors) {
    console.log(`  ERROR: ${err}`);
  }
  for (const warn of result.warnings) {
    console.log(`  WARN:  ${warn}`);
  }
}

// =============================================
// Autonomy
// =============================================
async function runAutonomy(opts) {
  const { select, input } = await import('@inquirer/prompts');
  const projectDir = resolve(opts.dir);

  console.log(`\n  claudenv autonomy v${pkgJson.version}\n`);

  // --- Profile selection ---
  let profileName = opts.profile;
  if (!profileName && !opts.yes) {
    const profiles = listProfiles();
    profileName = await select({
      message: 'Select autonomy profile:',
      choices: profiles.map((p) => ({
        name: `${p.name} — ${p.description}`,
        value: p.name,
      })),
    });
  } else if (!profileName) {
    profileName = 'moderate';
  }

  // --- Full mode confirmation ---
  if (profileName === 'full') {
    console.log(getFullModeWarning());
    if (!opts.yes) {
      const confirm = await input({ message: 'Type "full" to confirm:' });
      if (confirm.trim() !== 'full') {
        console.log('  Cancelled.\n');
        return;
      }
    } else {
      console.log('  --yes flag set, proceeding without confirmation.\n');
    }
  }

  // --- Generate files ---
  const { files, profile } = await generateAutonomyConfig(profileName, projectDir);

  printSecuritySummary(profile);

  if (opts.dryRun) {
    console.log('  Dry run — files that would be generated:\n');
    for (const f of files) {
      console.log(`  ── ${f.path} ──`);
      console.log(f.content);
    }
    return;
  }

  // --- Write files ---
  const { written, skipped } = await writeDocs(projectDir, files, {
    overwrite: opts.overwrite || false,
  });

  // Make hook scripts executable
  for (const f of files) {
    if (f.path.endsWith('.sh')) {
      try {
        await chmod(join(projectDir, f.path), 0o755);
      } catch { /* ignore */ }
    }
  }

  printFileResults(written, skipped);

  console.log(`
  Next steps:
    1. Review .claude/settings.json
    2. Source aliases: source .claude/aliases.sh
    3. ${profile.skipPermissions ? 'Run: claude --dangerously-skip-permissions' : 'Run: claude'}
    4. git add .claude/ && git commit -m "Add autonomy config (${profileName})"
`);
}

program.parse();
