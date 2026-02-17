import { mkdir, cp, rm, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLD_GLOBAL = join(__dirname, '..', 'scaffold', 'global');

/**
 * Get the path to ~/.claude/
 */
function getClaudeHome() {
  return join(homedir(), '.claude');
}

/**
 * Recursively list all files in a directory (relative paths).
 */
async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(full, base));
    } else {
      files.push(relative(base, full));
    }
  }
  return files;
}

/**
 * Install global Claude Code artifacts to ~/.claude/.
 * Copies scaffold/global/.claude/ contents into ~/.claude/.
 *
 * @param {object} [options]
 * @param {boolean} [options.force] - Overwrite existing files
 * @param {string} [options.claudeHome] - Override ~/.claude/ path (for testing)
 * @returns {Promise<{written: string[], skipped: string[]}>}
 */
export async function installGlobal(options = {}) {
  const { force = false, claudeHome } = options;
  const targetBase = claudeHome || getClaudeHome();
  const sourceBase = join(SCAFFOLD_GLOBAL, '.claude');

  const files = await listFiles(sourceBase);
  const written = [];
  const skipped = [];

  for (const relPath of files) {
    const src = join(sourceBase, relPath);
    const dest = join(targetBase, relPath);

    // Check if file exists and skip unless force
    if (!force) {
      try {
        await stat(dest);
        skipped.push(relPath);
        continue;
      } catch {
        // File doesn't exist — proceed
      }
    }

    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest);

    // Make .sh files executable
    if (relPath.endsWith('.sh')) {
      const { chmod } = await import('node:fs/promises');
      await chmod(dest, 0o755);
    }

    written.push(relPath);
  }

  return { written, skipped };
}

/**
 * Remove global Claude Code artifacts from ~/.claude/.
 *
 * @param {object} [options]
 * @param {string} [options.claudeHome] - Override ~/.claude/ path (for testing)
 * @returns {Promise<{removed: string[]}>}
 */
export async function uninstallGlobal(options = {}) {
  const { claudeHome } = options;
  const targetBase = claudeHome || getClaudeHome();
  const removed = [];

  const targets = [
    join(targetBase, 'commands', 'claudenv.md'),
    join(targetBase, 'commands', 'setup-mcp.md'),
    join(targetBase, 'commands', 'improve.md'),
    join(targetBase, 'skills', 'claudenv'),
  ];

  for (const target of targets) {
    try {
      await stat(target);
      await rm(target, { recursive: true });
      removed.push(relative(targetBase, target));
    } catch {
      // Doesn't exist — skip
    }
  }

  return { removed };
}
