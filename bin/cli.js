#!/usr/bin/env node

import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { detectTechStack } from '../src/detector.js';
import { generateDocs, writeDocs, installScaffold } from '../src/generator.js';
import { validateClaudeMd, validateStructure, crossReferenceCheck } from '../src/validator.js';
import { runExistingProjectFlow, runColdStartFlow, buildDefaultConfig } from '../src/prompts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgJson = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('claudenv')
  .description('One command to set up Claude Code documentation for any project')
  .version(pkgJson.version);

// --- Default action: running without subcommand triggers init ---
program
  .argument('[dir]', 'Project directory', '.')
  .option('-y, --yes', 'Skip prompts, use auto-detected defaults')
  .option('--overwrite', 'Overwrite existing files')
  .action(runInit);

// --- init (explicit subcommand, same logic) ---
program
  .command('init')
  .description('Interactive setup — detect stack, ask questions, generate docs')
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

// =============================================
// Main init logic
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

program.parse();
