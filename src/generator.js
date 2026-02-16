import { readFile, writeFile, mkdir, readdir, chmod, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');
const SCAFFOLD_DIR = join(__dirname, '..', 'scaffold');

/**
 * Generate documentation files from detection results and user config.
 * @param {string} projectDir - Project root directory
 * @param {object} config - Combined detection + user answers
 * @returns {Promise<{files: Array<{path: string, content: string}>}>}
 */
export async function generateDocs(projectDir, config) {
  const files = [];

  // Prepare template data with defaults
  const data = buildTemplateData(config);

  // Generate CLAUDE.md
  const claudeMd = await renderTemplate('claude-md.ejs', data);
  files.push({ path: 'CLAUDE.md', content: claudeMd });

  // Generate rules files if requested
  if (config.generateRules !== false) {
    const codeStyle = await renderTemplate('rules-code-style.ejs', data);
    files.push({ path: '.claude/rules/code-style.md', content: codeStyle });

    const testing = await renderTemplate('rules-testing.ejs', data);
    files.push({ path: '.claude/rules/testing.md', content: testing });

    const workflow = await renderTemplate('rules-workflow.ejs', data);
    files.push({ path: '.claude/rules/workflow.md', content: workflow });
  }

  // Generate _state.md for project state tracking
  const stateMd = await renderTemplate('state-md.ejs', data);
  files.push({ path: '_state.md', content: stateMd });

  // Generate settings.json if hooks requested
  if (config.generateHooks) {
    const settingsData = {
      validationScriptPath: '.claude/skills/doc-generator/scripts/validate.sh',
      enableStopHook: config.enableStopHook !== false,
    };
    const settings = await renderTemplate('settings-json.ejs', settingsData);
    files.push({ path: '.claude/settings.json', content: settings });
  }

  return { files };
}

/**
 * Write generated files to disk.
 * @param {string} projectDir - Project root directory
 * @param {Array<{path: string, content: string}>} files - Files to write
 * @param {object} [options] - Write options
 * @param {boolean} [options.overwrite=false] - Overwrite existing files
 * @param {boolean} [options.dryRun=false] - Only return what would be written
 */
export async function writeDocs(projectDir, files, options = {}) {
  const { overwrite = false, dryRun = false } = options;
  const written = [];
  const skipped = [];

  for (const file of files) {
    const fullPath = join(projectDir, file.path);

    if (!overwrite) {
      try {
        await readFile(fullPath);
        skipped.push(file.path);
        continue;
      } catch {
        // File doesn't exist — proceed to write
      }
    }

    if (!dryRun) {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
    }
    written.push(file.path);
  }

  return { written, skipped };
}

/**
 * Install Claude Code infrastructure (commands, skills, agents) into the target project.
 * Copies files from the scaffold/ directory.
 * @param {string} projectDir - Target project root
 * @param {object} [options] - Install options
 * @param {boolean} [options.overwrite=false] - Overwrite existing files
 * @returns {Promise<{written: string[], skipped: string[]}>}
 */
export async function installScaffold(projectDir, options = {}) {
  const { overwrite = false } = options;
  const written = [];
  const skipped = [];

  async function copyRecursive(srcDir, destDir) {
    let entries;
    try {
      entries = await readdir(srcDir, { withFileTypes: true });
    } catch {
      return; // scaffold dir may not exist in test environments
    }

    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);
      const relPath = relative(projectDir, destPath);

      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true });
        await copyRecursive(srcPath, destPath);
      } else {
        // Check if file already exists
        if (!overwrite) {
          try {
            await stat(destPath);
            skipped.push(relPath);
            continue;
          } catch {
            // File doesn't exist — proceed
          }
        }

        await mkdir(dirname(destPath), { recursive: true });
        const content = await readFile(srcPath);
        await writeFile(destPath, content);

        // Make .sh files executable
        if (entry.name.endsWith('.sh')) {
          await chmod(destPath, 0o755);
        }

        written.push(relPath);
      }
    }
  }

  await copyRecursive(SCAFFOLD_DIR, projectDir);
  return { written, skipped };
}

/**
 * Render an EJS template file with the given data.
 */
async function renderTemplate(templateName, data) {
  const templatePath = join(TEMPLATES_DIR, templateName);
  const template = await readFile(templatePath, 'utf-8');
  return ejs.render(template, data, { filename: templatePath });
}

/**
 * Build template data from config with sensible defaults.
 */
function buildTemplateData(config) {
  const pm = config.packageManager || 'npm';
  const pmRun = pm === 'npm' ? 'npm run' : pm;

  // Build commands object
  const commands = {
    dev: config.suggestedDevCmd || null,
    build: config.suggestedBuildCmd || null,
    test: config.suggestedTestCmd || null,
    lint: config.suggestedLintCmd || null,
    migrate: null,
    format: null,
    testSingle: null,
    testWatch: null,
    testCoverage: null,
  };

  // Add framework-specific commands
  if (config.framework === 'django') {
    commands.migrate = 'python manage.py migrate';
  } else if (config.framework === 'rails') {
    commands.migrate = 'bin/rails db:migrate';
  } else if (config.framework === 'laravel') {
    commands.migrate = 'php artisan migrate';
  }

  // Add test variations
  if (config.testFramework === 'vitest') {
    commands.testSingle = `${pmRun} vitest run path/to/file`;
    commands.testWatch = `${pmRun} vitest`;
    commands.testCoverage = `${pmRun} vitest run --coverage`;
  } else if (config.testFramework === 'jest') {
    commands.testSingle = `${pmRun} jest -- path/to/file`;
    commands.testWatch = `${pmRun} jest --watch`;
    commands.testCoverage = `${pmRun} jest --coverage`;
  } else if (config.testFramework === 'pytest') {
    commands.testSingle = 'pytest path/to/test_file.py';
    commands.testWatch = 'ptw';
    commands.testCoverage = 'pytest --cov';
  }

  // Format command — use npx for Node tools since they may not be in scripts
  if (config.formatter === 'prettier') {
    commands.format = 'npx prettier --write .';
  } else if (config.formatter === 'black') {
    commands.format = 'black .';
  } else if (config.formatter === 'ruff') {
    commands.format = 'ruff format .';
  } else if (config.formatter === 'rustfmt') {
    commands.format = 'cargo fmt';
  }

  // Path globs for conditional rule loading
  const pathGlobs = [];
  const testPathGlobs = [];
  if (config.language === 'typescript' || config.language === 'javascript') {
    pathGlobs.push('src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx');
    testPathGlobs.push('**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/__tests__/**');
  } else if (config.language === 'python') {
    pathGlobs.push('**/*.py');
    testPathGlobs.push('tests/**/*.py', '**/test_*.py');
  } else if (config.language === 'go') {
    pathGlobs.push('**/*.go');
    testPathGlobs.push('**/*_test.go');
  } else if (config.language === 'rust') {
    pathGlobs.push('src/**/*.rs');
    testPathGlobs.push('tests/**/*.rs');
  }

  return {
    // Ensure all template variables have defaults to avoid EJS ReferenceErrors
    language: null,
    runtime: null,
    framework: null,
    packageManager: null,
    testFramework: null,
    linter: null,
    formatter: null,
    ci: null,
    monorepo: null,
    containerized: false,
    projectDescription: null,
    projectType: null,
    deployment: null,
    focusAreas: null,
    // Spread config values over defaults
    ...config,
    commands,
    pathGlobs,
    testPathGlobs,
    directories: config.directories || [],
    additionalCommands: config.additionalCommands || [],
    rules: config.rules || [],
    conventions: config.conventions || '',
    testConventions: config.testConventions || '',
    generateRules: config.generateRules !== false,
  };
}
