import { input, select, confirm, checkbox } from '@inquirer/prompts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FRAMEWORKS_BY_LANGUAGE } from './constants.js';

/**
 * Interactive flow for an existing project with detected tech stack.
 * @param {object} detected - Output from detectTechStack()
 * @returns {Promise<object>} Config object for the generator
 */
export async function runExistingProjectFlow(detected) {
  console.log('\nDetected tech stack:');
  console.log(`  Language:        ${detected.language || 'unknown'}`);
  if (detected.framework) console.log(`  Framework:       ${detected.framework}`);
  if (detected.packageManager) console.log(`  Package manager: ${detected.packageManager}`);
  if (detected.testFramework) console.log(`  Test framework:  ${detected.testFramework}`);
  if (detected.linter) console.log(`  Linter:          ${detected.linter}`);
  if (detected.formatter) console.log(`  Formatter:       ${detected.formatter}`);
  if (detected.ci) console.log(`  CI/CD:           ${detected.ci}`);
  if (detected.monorepo) console.log(`  Monorepo:        ${detected.monorepo}`);
  console.log();

  const projectDescription = await input({
    message: 'Brief project description:',
    default: `${detected.framework || detected.language} project`,
  });

  const projectType = await select({
    message: 'What type of project is this?',
    choices: [
      { value: 'web-app', name: 'Web application' },
      { value: 'api', name: 'API service' },
      { value: 'cli', name: 'CLI tool' },
      { value: 'library', name: 'Library / package' },
      { value: 'monorepo', name: 'Monorepo' },
      { value: 'other', name: 'Other' },
    ],
  });

  const deployment = await select({
    message: 'Deployment target?',
    choices: [
      { value: 'vercel', name: 'Vercel' },
      { value: 'aws', name: 'AWS' },
      { value: 'docker', name: 'Docker / Kubernetes' },
      { value: 'fly-io', name: 'Fly.io' },
      { value: 'railway', name: 'Railway' },
      { value: 'bare-metal', name: 'Bare metal / VPS' },
      { value: 'none', name: 'Not yet decided' },
    ],
  });

  const conventions = await input({
    message: 'Any team conventions not captured in config files? (leave empty to skip)',
    default: '',
  });

  const focusAreas = await input({
    message: 'Areas of the codebase Claude should pay special attention to? (leave empty to skip)',
    default: '',
  });

  const generateRules = await confirm({
    message: 'Generate .claude/rules/ files for code style and testing?',
    default: true,
  });

  const generateHooks = await confirm({
    message: 'Generate validation hooks in .claude/settings.json?',
    default: true,
  });

  return {
    ...detected,
    projectDescription,
    projectType,
    deployment: deployment === 'none' ? null : deployment,
    conventions: conventions || null,
    focusAreas: focusAreas || null,
    generateRules,
    generateHooks,
    rules: buildRules(detected, focusAreas),
  };
}

/**
 * Interactive flow for a new/empty project (cold start).
 * @returns {Promise<object>} Config object for the generator
 */
export async function runColdStartFlow() {
  console.log('\nNo project files detected. Starting from scratch.\n');

  const projectDescription = await input({
    message: 'What is this project?',
  });

  const language = await select({
    message: 'Primary language?',
    choices: [
      { value: 'typescript', name: 'TypeScript' },
      { value: 'javascript', name: 'JavaScript' },
      { value: 'python', name: 'Python' },
      { value: 'go', name: 'Go' },
      { value: 'rust', name: 'Rust' },
      { value: 'ruby', name: 'Ruby' },
      { value: 'php', name: 'PHP' },
      { value: 'java', name: 'Java' },
      { value: 'kotlin', name: 'Kotlin' },
      { value: 'csharp', name: 'C#' },
    ],
  });

  const frameworks = FRAMEWORKS_BY_LANGUAGE[language] || ['None'];
  const framework = await select({
    message: 'Framework?',
    choices: frameworks.map((f) => ({ value: f.toLowerCase().replace(/\s+/g, '-'), name: f })),
  });

  const projectType = await select({
    message: 'Project type?',
    choices: [
      { value: 'web-app', name: 'Web application' },
      { value: 'api', name: 'API service' },
      { value: 'cli', name: 'CLI tool' },
      { value: 'library', name: 'Library / package' },
      { value: 'other', name: 'Other' },
    ],
  });

  const deployment = await select({
    message: 'Deployment target?',
    choices: [
      { value: 'vercel', name: 'Vercel' },
      { value: 'aws', name: 'AWS' },
      { value: 'docker', name: 'Docker / Kubernetes' },
      { value: 'fly-io', name: 'Fly.io' },
      { value: 'railway', name: 'Railway' },
      { value: 'bare-metal', name: 'Bare metal / VPS' },
      { value: 'none', name: 'Not yet decided' },
    ],
  });

  const conventions = await input({
    message: 'Any coding conventions to enforce? (leave empty to skip)',
    default: '',
  });

  const generateRules = await confirm({
    message: 'Generate .claude/rules/ files?',
    default: true,
  });

  const generateHooks = await confirm({
    message: 'Generate validation hooks?',
    default: true,
  });

  return {
    language,
    runtime: inferRuntime(language),
    framework: framework === 'none' ? null : framework,
    packageManager: inferPackageManager(language),
    testFramework: null,
    linter: null,
    formatter: null,
    ci: null,
    containerized: false,
    monorepo: null,
    projectDescription,
    projectType,
    deployment: deployment === 'none' ? null : deployment,
    conventions: conventions || null,
    generateRules,
    generateHooks,
    suggestedDevCmd: null,
    suggestedBuildCmd: null,
    suggestedTestCmd: null,
    rules: [],
  };
}

function inferRuntime(language) {
  const runtimeMap = {
    typescript: 'node',
    javascript: 'node',
    python: 'python',
    go: 'go',
    rust: 'rust',
    ruby: 'ruby',
    php: 'php',
    java: 'jvm',
    kotlin: 'jvm',
    csharp: 'dotnet',
  };
  return runtimeMap[language] || language;
}

function inferPackageManager(language) {
  const pmMap = {
    typescript: 'npm',
    javascript: 'npm',
    python: 'pip',
    ruby: 'bundler',
    php: 'composer',
    rust: 'cargo',
    go: 'go-modules',
  };
  return pmMap[language] || null;
}

/**
 * Build config from auto-detected values without prompting (--yes mode).
 * @param {object} detected - Output from detectTechStack()
 * @param {string} projectDir - Project root directory
 * @returns {Promise<object>} Config object for the generator
 */
export async function buildDefaultConfig(detected, projectDir) {
  let projectDescription = `${detected.framework || detected.language || 'Unknown'} project`;

  // Try to get a better name from package.json
  try {
    const pkgRaw = await readFile(join(projectDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg.description) {
      projectDescription = pkg.description;
    } else if (pkg.name) {
      projectDescription = `${pkg.name} — ${detected.framework || detected.language} project`;
    }
  } catch {
    // No package.json or parse error
  }

  return {
    ...detected,
    projectDescription,
    projectType: null,
    deployment: null,
    conventions: null,
    focusAreas: null,
    generateRules: true,
    generateHooks: true,
    rules: buildRules(detected, null),
  };
}

function buildRules(detected, focusAreas) {
  const rules = [];

  if (detected.framework === 'next.js') {
    rules.push('Use server components by default; add \'use client\' only when needed');
    rules.push('Prefer server actions for mutations over API routes');
  }

  if (detected.framework === 'django') {
    rules.push('NEVER modify migration files after they have been committed');
  }

  if (detected.linter) {
    rules.push(`Run \`${detected.suggestedLintCmd || detected.linter}\` before committing`);
  }

  if (focusAreas) {
    rules.push(`Pay special attention to: ${focusAreas}`);
  }

  return rules;
}
