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
import { runLoop, rollback, checkClaudeCli } from '../src/loop.js';
import { generateAutonomyConfig, printSecuritySummary, getFullModeWarning } from '../src/autonomy.js';
import { getProfile, listProfiles } from '../src/profiles.js';

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
  .option('--unsafe', 'Remove default tool restrictions (allows rm -rf)')
  .option('--worktree', 'Run each iteration in an isolated git worktree')
  .option('--profile <name>', 'Autonomy profile: safe, moderate, full, ci')
  .action(async (opts) => {
    // --- Rollback mode ---
    if (opts.rollback) {
      await rollback({ cwd: opts.dir ? resolve(opts.dir) : process.cwd() });
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
    if (opts.model) console.log(`  Model: ${opts.model}`);
    if (opts.budget || profileDefaults.budget) console.log(`  Budget: $${opts.budget || profileDefaults.budget}/iteration`);
    if (opts.maxTurns || profileDefaults.maxTurns) console.log(`  Max turns: ${opts.maxTurns || profileDefaults.maxTurns}`);

    await runLoop({
      iterations: opts.iterations,
      trust,
      goal: opts.goal,
      pause,
      maxTurns: opts.maxTurns || profileDefaults.maxTurns || 30,
      model: opts.model,
      budget: opts.budget || profileDefaults.budget,
      cwd,
      allowDirty: opts.allowDirty || false,
      unsafe: opts.unsafe || false,
      worktree: opts.worktree || false,
      disallowedTools: profileDefaults.disallowedTools,
    });
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

    /claudenv

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
