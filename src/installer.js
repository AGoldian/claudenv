import { mkdir, cp, rm, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLD_GLOBAL = join(__dirname, '..', 'scaffold', 'global');
const SCAFFOLD_GLOBAL_CLAUDENV = join(__dirname, '..', 'scaffold', 'global-claudenv');

/**
 * Get the path to ~/.claude/
 */
function getClaudeHome() {
  return join(homedir(), '.claude');
}

/**
 * Get the path to ~/.claudenv/ (separate from ~/.claude/ — holds cross-project
 * memory, canon, user preferences, and the doctor config).
 */
function getClaudenvHome() {
  return join(homedir(), '.claudenv');
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
 * Copy every file under `sourceBase` into `targetBase`, skipping existing files
 * unless `force` is set. Returns relative paths of what was written/skipped.
 */
async function copyTree(sourceBase, targetBase, { force }) {
  let files;
  try {
    files = await listFiles(sourceBase);
  } catch (err) {
    if (err.code === 'ENOENT') return { written: [], skipped: [] };
    throw err;
  }

  const written = [];
  const skipped = [];

  for (const relPath of files) {
    const src = join(sourceBase, relPath);
    const dest = join(targetBase, relPath);

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

    if (relPath.endsWith('.sh')) {
      const { chmod } = await import('node:fs/promises');
      await chmod(dest, 0o755);
    }

    written.push(relPath);
  }

  return { written, skipped };
}

/**
 * Install global Claude Code artifacts to ~/.claude/ AND ~/.claudenv/.
 * Copies scaffold/global/.claude/ → ~/.claude/ and scaffold/global-claudenv/ → ~/.claudenv/.
 *
 * @param {object} [options]
 * @param {boolean} [options.force] - Overwrite existing files
 * @param {string} [options.claudeHome] - Override ~/.claude/ path (for testing)
 * @param {string} [options.claudenvHome] - Override ~/.claudenv/ path (for testing)
 * @returns {Promise<{written: string[], skipped: string[], claudenvWritten: string[], claudenvSkipped: string[]}>}
 */
export async function installGlobal(options = {}) {
  const { force = false, claudeHome, claudenvHome } = options;
  const claudeTarget = claudeHome || getClaudeHome();
  const claudenvTarget = claudenvHome || getClaudenvHome();

  const claude = await copyTree(join(SCAFFOLD_GLOBAL, '.claude'), claudeTarget, { force });
  const claudenv = await copyTree(SCAFFOLD_GLOBAL_CLAUDENV, claudenvTarget, { force });

  // Ensure baseline subdirectories exist even when scaffold doesn't carry .gitkeep
  // (decisions/ is empty by design until vibe-decisions fills it).
  await mkdir(join(claudenvTarget, 'memories', 'decisions'), { recursive: true });

  return {
    written: claude.written,
    skipped: claude.skipped,
    claudenvWritten: claudenv.written,
    claudenvSkipped: claudenv.skipped,
  };
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
    join(targetBase, 'commands', 'autonomy.md'),
    join(targetBase, 'commands', 'setup-mcp.md'),
    join(targetBase, 'commands', 'improve.md'),
    join(targetBase, 'commands', 'deeper.md'),
    join(targetBase, 'commands', 'why.md'),
    join(targetBase, 'commands', 'decisions.md'),
    join(targetBase, 'commands', 'canon.md'),
    join(targetBase, 'commands', 'just-code.md'),
    join(targetBase, 'commands', 'add-source.md'),
    join(targetBase, 'commands', 'harness.md'),
    join(targetBase, 'skills', 'claudenv'),
    join(targetBase, 'skills', 'vibe-decisions'),
    join(targetBase, 'skills', 'source-connector'),
    join(targetBase, 'skills', 'harness'),
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
