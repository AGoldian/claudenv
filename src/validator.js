import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { REQUIRED_SECTIONS } from './constants.js';

/**
 * Validate a CLAUDE.md file for required structure and content.
 * @param {string} filePath - Absolute path to CLAUDE.md
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateClaudeMd(filePath) {
  const errors = [];
  const warnings = [];

  // Check file exists and is non-empty
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    errors.push(`File not found: ${filePath}`);
    return { valid: false, errors, warnings };
  }

  if (!content.trim()) {
    errors.push('CLAUDE.md is empty');
    return { valid: false, errors, warnings };
  }

  // Check required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      errors.push(`Missing required section: ${section}`);
    }
  }

  // Check for a top-level heading
  if (!content.match(/^#\s+\S/m)) {
    warnings.push('No top-level heading (# Title) found');
  }

  // Check that ## Commands section has at least one command
  const commandsMatch = content.match(/## Commands\n([\s\S]*?)(?=\n## |\n# |$)/);
  if (commandsMatch) {
    const commandsContent = commandsMatch[1].trim();
    if (!commandsContent.includes('`')) {
      warnings.push('## Commands section has no inline code (expected command examples)');
    }
  }

  // Check @imports resolve to real files
  const importErrors = await validateImports(content, dirname(filePath));
  errors.push(...importErrors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate the .claude/ directory structure.
 * @param {string} projectDir - Project root directory
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateStructure(projectDir) {
  const errors = [];
  const warnings = [];

  // Check CLAUDE.md exists
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  try {
    await access(claudeMdPath);
  } catch {
    errors.push('CLAUDE.md not found in project root');
  }

  // Check .claude directory structure
  const optionalPaths = [
    { path: '.claude/commands', label: 'commands directory' },
    { path: '.claude/rules', label: 'rules directory' },
    { path: '.claude/settings.json', label: 'settings.json' },
  ];

  for (const { path, label } of optionalPaths) {
    try {
      await access(join(projectDir, path));
    } catch {
      warnings.push(`Optional ${label} not found at ${path}`);
    }
  }

  // If settings.json exists, validate it's valid JSON
  try {
    const settingsRaw = await readFile(join(projectDir, '.claude/settings.json'), 'utf-8');
    JSON.parse(settingsRaw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      errors.push(`.claude/settings.json is not valid JSON: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Cross-reference documentation with actual project files.
 * @param {string} projectDir - Project root directory
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
export async function crossReferenceCheck(projectDir) {
  const errors = [];
  const warnings = [];

  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  let content;
  try {
    content = await readFile(claudeMdPath, 'utf-8');
  } catch {
    errors.push('CLAUDE.md not found — cannot cross-reference');
    return { valid: false, errors, warnings };
  }

  // Check that directories mentioned in Architecture section exist
  const archMatch = content.match(/## Architecture\n([\s\S]*?)(?=\n## |\n# |$)/);
  if (archMatch) {
    const archContent = archMatch[1];
    const dirRefs = archContent.match(/`([^`]+\/)`/g);
    if (dirRefs) {
      for (const ref of dirRefs) {
        const dirPath = ref.replace(/`/g, '');
        try {
          await access(join(projectDir, dirPath));
        } catch {
          warnings.push(`Architecture references directory "${dirPath}" which does not exist`);
        }
      }
    }
  }

  // Check that referenced scripts in Commands section exist in package.json
  const pkgJsonPath = join(projectDir, 'package.json');
  try {
    const pkgRaw = await readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    const scripts = pkg.scripts || {};

    const cmdMatch = content.match(/## Commands\n([\s\S]*?)(?=\n## |\n# |$)/);
    if (cmdMatch) {
      const cmdContent = cmdMatch[1];
      // Look for `npm run <script>` or `pnpm <script>` or `yarn <script>` patterns
      const scriptRefs = cmdContent.matchAll(/(?:npm run|pnpm|yarn|bun(?:x| run)?)\s+([a-z][\w:-]*)/g);
      for (const match of scriptRefs) {
        const scriptName = match[1];
        if (!scripts[scriptName]) {
          warnings.push(`Commands section references script "${scriptName}" not found in package.json`);
        }
      }
    }
  } catch {
    // No package.json or parse error — skip script checks
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate @import references in CLAUDE.md content.
 */
async function validateImports(content, baseDir) {
  const errors = [];
  const lines = content.split('\n');
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Match bare @path references (not inside code blocks, not email addresses)
    const importMatch = line.match(/^@([^\s@]+)$/);
    if (importMatch) {
      const importPath = importMatch[1];
      const resolvedPath = importPath.startsWith('~/')
        ? join(process.env.HOME || '', importPath.slice(2))
        : join(baseDir, importPath);

      try {
        await access(resolvedPath);
      } catch {
        errors.push(`@import reference "${importPath}" does not resolve to a file`);
      }
    }
  }

  return errors;
}
