import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { glob } from 'glob';
import { parse as parseToml } from 'smol-toml';
import {
  MANIFEST_MAP,
  TYPESCRIPT_INDICATORS,
  FRAMEWORK_MAP,
  PACKAGE_MANAGER_MAP,
  TEST_FRAMEWORK_MAP,
  TEST_DEPENDENCY_MAP,
  CI_PATTERNS,
  LINTER_MAP,
  FORMATTER_MAP,
  MONOREPO_MAP,
  INFRA_MAP,
  SUGGESTED_COMMANDS,
} from './constants.js';

/**
 * Detect the tech stack of a project by scanning its files.
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<object>} Detected tech stack
 */
export async function detectTechStack(projectDir) {
  const files = await glob('**/*', {
    cwd: projectDir,
    maxDepth: 3,
    dot: true,
    nodir: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/vendor/**', '**/__pycache__/**', '**/target/**'],
  });

  const fileSet = new Set(files);
  const fileNames = files.map((f) => basename(f));
  const fileNameSet = new Set(fileNames);

  const result = {
    language: null,
    runtime: null,
    framework: null,
    packageManager: null,
    buildTool: null,
    testFramework: null,
    linter: null,
    formatter: null,
    ci: null,
    containerized: false,
    monorepo: null,
    suggestedTestCmd: null,
    suggestedBuildCmd: null,
    suggestedDevCmd: null,
    detectedFiles: {
      manifests: [],
      configs: [],
      ci: [],
      infra: [],
    },
  };

  // Phase 1: Detect language/runtime from manifest files
  detectLanguage(fileSet, fileNameSet, files, result);

  // Phase 2: Check for TypeScript
  if (result.language === 'javascript') {
    for (const indicator of TYPESCRIPT_INDICATORS) {
      if (fileNameSet.has(indicator) || fileSet.has(indicator)) {
        result.language = 'typescript';
        break;
      }
    }
  }

  // Phase 3: Detect framework from config files
  detectFramework(fileSet, fileNameSet, files, result);

  // Phase 4: Detect package manager from lockfiles
  detectPackageManager(fileNameSet, result);

  // Phase 5: Detect test framework
  await detectTestFramework(projectDir, fileSet, fileNameSet, result);

  // Phase 6: Detect CI/CD
  detectCI(fileSet, files, result);

  // Phase 7: Detect linter and formatter
  detectLinter(fileNameSet, result);
  detectFormatter(fileNameSet, result);

  // Phase 8: Detect monorepo tooling
  detectMonorepo(fileNameSet, result);

  // Phase 9: Detect infrastructure
  detectInfra(fileSet, fileNameSet, files, result);

  // Phase 10: Infer build tool
  inferBuildTool(result);

  // Phase 11: Suggest commands
  suggestCommands(result);

  // Phase 12: Parse manifest for deeper insights
  await parseManifestDetails(projectDir, fileSet, result);

  return result;
}

function detectLanguage(fileSet, fileNameSet, files, result) {
  for (const [filename, info] of Object.entries(MANIFEST_MAP)) {
    if (filename.startsWith('*')) {
      // Glob pattern like *.csproj
      const ext = filename.slice(1);
      if (files.some((f) => f.endsWith(ext))) {
        result.language = info.language;
        result.runtime = info.runtime;
        result.detectedFiles.manifests.push(files.find((f) => f.endsWith(ext)));
        return;
      }
    } else if (fileNameSet.has(filename) || fileSet.has(filename)) {
      result.language = info.language;
      result.runtime = info.runtime;
      const match = files.find((f) => f === filename || basename(f) === filename);
      if (match) result.detectedFiles.manifests.push(match);
      return;
    }
  }
}

function detectFramework(fileSet, fileNameSet, files, result) {
  for (const [filename, framework] of Object.entries(FRAMEWORK_MAP)) {
    if (fileNameSet.has(filename) || fileSet.has(filename)) {
      result.framework = framework;
      const match = files.find((f) => f === filename || basename(f) === filename);
      if (match) result.detectedFiles.configs.push(match);
      return;
    }
  }
}

function detectPackageManager(fileNameSet, result) {
  for (const [lockfile, pm] of Object.entries(PACKAGE_MANAGER_MAP)) {
    if (fileNameSet.has(lockfile)) {
      result.packageManager = pm;
      return;
    }
  }
  // Fallback: if we have a Node project but no lockfile, assume npm
  if (result.runtime === 'node' && !result.packageManager) {
    result.packageManager = 'npm';
  }
}

async function detectTestFramework(projectDir, fileSet, fileNameSet, result) {
  // Check config files first
  for (const [filename, framework] of Object.entries(TEST_FRAMEWORK_MAP)) {
    if (fileNameSet.has(filename) || fileSet.has(filename)) {
      result.testFramework = framework;
      return;
    }
  }

  // Check package.json dependencies
  if (fileSet.has('package.json')) {
    try {
      const pkgRaw = await readFile(join(projectDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      for (const [dep, framework] of Object.entries(TEST_DEPENDENCY_MAP)) {
        if (allDeps[dep]) {
          result.testFramework = framework;
          return;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
}

function detectCI(fileSet, files, result) {
  for (const pattern of CI_PATTERNS) {
    const matching = files.filter((f) => {
      if (pattern.glob.includes('*')) {
        const prefix = pattern.glob.split('*')[0];
        const suffix = pattern.glob.split('*').pop();
        return f.startsWith(prefix) && f.endsWith(suffix);
      }
      return f === pattern.glob;
    });
    if (matching.length > 0) {
      result.ci = pattern.name;
      result.detectedFiles.ci.push(...matching);
      return;
    }
  }
}

function detectLinter(fileNameSet, result) {
  for (const [filename, linter] of Object.entries(LINTER_MAP)) {
    if (fileNameSet.has(filename)) {
      result.linter = linter;
      return;
    }
  }
}

function detectFormatter(fileNameSet, result) {
  for (const [filename, fmt] of Object.entries(FORMATTER_MAP)) {
    if (fmt && fileNameSet.has(filename)) {
      result.formatter = fmt;
      return;
    }
  }
}

function detectMonorepo(fileNameSet, result) {
  for (const [filename, tool] of Object.entries(MONOREPO_MAP)) {
    if (fileNameSet.has(filename)) {
      result.monorepo = tool;
      return;
    }
  }
}

function detectInfra(fileSet, fileNameSet, files, result) {
  for (const [indicator, tool] of Object.entries(INFRA_MAP)) {
    if (indicator.startsWith('*')) {
      const ext = indicator.slice(1);
      if (files.some((f) => f.endsWith(ext))) {
        result.detectedFiles.infra.push(tool);
      }
    } else if (indicator.endsWith('/')) {
      const dir = indicator.slice(0, -1);
      if (files.some((f) => f.startsWith(dir + '/'))) {
        result.detectedFiles.infra.push(tool);
      }
    } else if (fileNameSet.has(indicator) || fileSet.has(indicator)) {
      result.detectedFiles.infra.push(tool);
      if (indicator === 'Dockerfile' || indicator.startsWith('docker-compose')) {
        result.containerized = true;
      }
    }
  }
}

function inferBuildTool(result) {
  if (result.framework) {
    const frameworkBuildTools = {
      'next.js': 'next',
      vite: 'vite',
      angular: 'angular-cli',
      gatsby: 'gatsby',
      astro: 'astro',
      sveltekit: 'vite',
    };
    result.buildTool = frameworkBuildTools[result.framework] || result.framework;
  } else if (result.runtime === 'rust') {
    result.buildTool = 'cargo';
  } else if (result.runtime === 'go') {
    result.buildTool = 'go';
  }
}

function suggestCommands(result) {
  const pm = result.packageManager || 'npm';
  const pmRun = pm === 'npm' ? 'npm run' : pm;

  // Check framework-specific commands
  const fwKey = result.framework || result.runtime;
  if (fwKey && SUGGESTED_COMMANDS[fwKey]) {
    const cmds = SUGGESTED_COMMANDS[fwKey];
    result.suggestedDevCmd = cmds.dev?.replace('{pm}', pmRun) || null;
    result.suggestedBuildCmd = cmds.build?.replace('{pm}', pmRun) || null;
    result.suggestedTestCmd = cmds.test?.replace('{pm}', pmRun) || null;
    return;
  }

  // Generic Node.js fallbacks
  if (result.runtime === 'node') {
    result.suggestedDevCmd = `${pmRun} dev`;
    result.suggestedBuildCmd = `${pmRun} build`;
    if (result.testFramework) {
      result.suggestedTestCmd = `${pmRun} test`;
    }
  }
}

async function parseManifestDetails(projectDir, fileSet, result) {
  // Extract additional info from package.json scripts
  if (fileSet.has('package.json')) {
    try {
      const pkgRaw = await readFile(join(projectDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);

      // Override suggested commands with actual scripts if they exist
      if (pkg.scripts) {
        const pm = result.packageManager || 'npm';
        const pmRun = pm === 'npm' ? 'npm run' : pm;
        if (pkg.scripts.dev) result.suggestedDevCmd = `${pmRun} dev`;
        if (pkg.scripts.build) result.suggestedBuildCmd = `${pmRun} build`;
        if (pkg.scripts.test) result.suggestedTestCmd = `${pmRun} test`;
        if (pkg.scripts.lint) result.suggestedLintCmd = `${pmRun} lint`;
      }

      // Check for workspaces (monorepo)
      if (pkg.workspaces && !result.monorepo) {
        result.monorepo = 'npm-workspaces';
      }
    } catch {
      // Ignore
    }
  }

  // Parse pyproject.toml for Python projects
  if (fileSet.has('pyproject.toml')) {
    try {
      const tomlRaw = await readFile(join(projectDir, 'pyproject.toml'), 'utf-8');
      const toml = parseToml(tomlRaw);

      // Check for test framework in dependencies
      if (toml.project?.dependencies) {
        const deps = toml.project.dependencies;
        if (Array.isArray(deps) && deps.some((d) => d.startsWith('pytest'))) {
          result.testFramework = result.testFramework || 'pytest';
        }
      }
      if (toml.tool?.pytest) {
        result.testFramework = result.testFramework || 'pytest';
      }
      if (toml.tool?.ruff) {
        result.linter = result.linter || 'ruff';
      }
      if (toml.tool?.black) {
        result.formatter = result.formatter || 'black';
      }
      if (toml.tool?.['ruff']?.format) {
        result.formatter = result.formatter || 'ruff';
      }
    } catch {
      // Ignore
    }
  }
}
