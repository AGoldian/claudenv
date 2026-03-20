import { execSync } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

// =============================================
// Constants
// =============================================

const WORKTREE_DIR = '.worktrees';
const BRANCH_PREFIX = 'claudenv';

// =============================================
// Path helpers
// =============================================

/**
 * Get the worktree directory path for a given name.
 * @param {string} cwd - Working directory
 * @param {string} name - Worktree name
 * @returns {string} Absolute path to .worktrees/<name>
 */
export function getWorktreePath(cwd, name) {
  return join(cwd, WORKTREE_DIR, name);
}

/**
 * Get the branch name for a worktree.
 * @param {string} name - Worktree name
 * @returns {string} Branch name claudenv/<name>
 */
export function getBranchName(name) {
  return `${BRANCH_PREFIX}/${name}`;
}

/**
 * Generate an auto-name based on current timestamp.
 * @returns {string} hypothesis-YYYY-MM-DD-HHMM
 */
export function generateWorktreeName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `hypothesis-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/**
 * Get the current branch name.
 * @param {string} cwd - Working directory
 * @returns {string} Current branch name
 */
export function getCurrentBranch(cwd) {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
}

// =============================================
// Gitignore management
// =============================================

/**
 * Ensure .worktrees/ is in .gitignore. Idempotent.
 * @param {string} cwd - Working directory
 */
export async function ensureGitignore(cwd) {
  const gitignorePath = join(cwd, '.gitignore');
  const entry = `${WORKTREE_DIR}/`;

  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf-8');
  } catch {
    // .gitignore doesn't exist yet
  }

  // Check if already present (exact line match)
  const lines = content.split('\n');
  if (lines.some((line) => line.trim() === entry)) {
    return;
  }

  // Append entry
  const separator = content && !content.endsWith('\n') ? '\n' : '';
  await writeFile(gitignorePath, content + separator + entry + '\n');
}

// =============================================
// Worktree operations
// =============================================

/**
 * Create a new git worktree with a dedicated branch.
 *
 * @param {string} cwd - Working directory (main repo)
 * @param {string} [name] - Worktree name (auto-generated if omitted)
 * @param {object} [options]
 * @param {string} [options.goal] - Goal description (used in branch commit message)
 * @returns {{ name: string, path: string, branch: string }}
 */
export async function createWorktree(cwd, name, options = {}) {
  if (!name) {
    name = generateWorktreeName();
  }

  const worktreePath = getWorktreePath(cwd, name);
  const branch = getBranchName(name);

  // Ensure .worktrees/ is gitignored
  await ensureGitignore(cwd);

  // Create worktree with new branch
  execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
    cwd,
    stdio: 'pipe',
  });

  return { name, path: worktreePath, branch };
}

/**
 * Remove a worktree but keep the branch for reference.
 *
 * @param {string} cwd - Working directory (main repo)
 * @param {string} name - Worktree name
 */
export function removeWorktree(cwd, name) {
  const worktreePath = getWorktreePath(cwd, name);

  execSync(`git worktree remove "${worktreePath}" --force`, {
    cwd,
    stdio: 'pipe',
  });
}

/**
 * Merge a worktree branch back into the current branch with --no-ff.
 *
 * @param {string} cwd - Working directory (main repo)
 * @param {string} name - Worktree name
 * @param {object} [options]
 * @param {string} [options.message] - Custom merge commit message
 * @returns {{ merged: boolean, branch: string }}
 * @throws {Error} On merge conflict
 */
export function mergeWorktree(cwd, name, options = {}) {
  const branch = getBranchName(name);
  const message = options.message || `Merge hypothesis: ${name}`;

  // Remove worktree first (must be done before merge)
  removeWorktree(cwd, name);

  try {
    execSync(`git merge --no-ff "${branch}" -m "${message}"`, {
      cwd,
      stdio: 'pipe',
    });
  } catch (err) {
    // Abort the merge on conflict
    try {
      execSync('git merge --abort', { cwd, stdio: 'pipe' });
    } catch {
      // merge --abort may fail if there's nothing to abort
    }
    throw new Error(`Merge conflict when merging ${branch}. Branch preserved for manual resolution.`);
  }

  return { merged: true, branch };
}

/**
 * List all hypothesis branches (claudenv/*).
 *
 * @param {string} cwd - Working directory
 * @returns {string[]} Branch names
 */
export function listHypotheses(cwd) {
  try {
    const output = execSync(`git branch -l "${BRANCH_PREFIX}/*"`, {
      cwd,
      encoding: 'utf-8',
    }).trim();

    if (!output) return [];

    return output
      .split('\n')
      .map((line) => line.trim().replace(/^[*+]\s*/, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}
