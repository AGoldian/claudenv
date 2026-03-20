import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  createWorktree,
  removeWorktree,
  mergeWorktree,
  listHypotheses,
  getWorktreePath,
  getBranchName,
  getCurrentBranch,
  ensureGitignore,
} from '../src/worktree.js';

describe('worktree helpers', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claudenv-worktree-test-'));
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    execSync('git add . && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' });
  });

  afterEach(async () => {
    // Prune worktrees before cleanup
    try {
      execSync('git worktree prune', { cwd: tempDir, stdio: 'pipe' });
    } catch { /* ignore */ }
    await rm(tempDir, { recursive: true, force: true });
  });

  // --- Path helpers ---

  it('getWorktreePath returns correct path', () => {
    const p = getWorktreePath('/repo', 'my-test');
    expect(p).toBe('/repo/.worktrees/my-test');
  });

  it('getBranchName returns correct branch', () => {
    expect(getBranchName('my-test')).toBe('claudenv/my-test');
    expect(getBranchName('hypothesis-2026-03-19-1430')).toBe('claudenv/hypothesis-2026-03-19-1430');
  });

  it('getCurrentBranch returns current branch name', () => {
    const branch = getCurrentBranch(tempDir);
    // Default branch could be main or master depending on git config
    expect(['main', 'master']).toContain(branch);
  });

  // --- ensureGitignore ---

  it('ensureGitignore adds .worktrees/ to .gitignore', async () => {
    await ensureGitignore(tempDir);
    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.worktrees/');
  });

  it('ensureGitignore is idempotent', async () => {
    await ensureGitignore(tempDir);
    await ensureGitignore(tempDir);
    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    const matches = content.match(/\.worktrees\//g);
    expect(matches).toHaveLength(1);
  });

  it('ensureGitignore appends to existing .gitignore', async () => {
    await writeFile(join(tempDir, '.gitignore'), 'node_modules/\n');
    await ensureGitignore(tempDir);
    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.worktrees/');
  });

  // --- createWorktree ---

  it('createWorktree creates directory and branch', async () => {
    const result = await createWorktree(tempDir, 'test-hyp');
    expect(result.name).toBe('test-hyp');
    expect(result.branch).toBe('claudenv/test-hyp');
    expect(result.path).toBe(join(tempDir, '.worktrees', 'test-hyp'));
    expect(existsSync(result.path)).toBe(true);

    // Branch should exist
    const branches = execSync('git branch', { cwd: tempDir, encoding: 'utf-8' });
    expect(branches).toContain('claudenv/test-hyp');
  });

  it('createWorktree auto-generates name when omitted', async () => {
    const result = await createWorktree(tempDir);
    expect(result.name).toMatch(/^hypothesis-\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(result.branch).toMatch(/^claudenv\/hypothesis-/);
    expect(existsSync(result.path)).toBe(true);
  });

  it('createWorktree adds .worktrees/ to .gitignore', async () => {
    await createWorktree(tempDir, 'gitignore-test');
    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.worktrees/');
  });

  // --- removeWorktree ---

  it('removeWorktree removes worktree but keeps branch', async () => {
    await createWorktree(tempDir, 'to-remove');
    const worktreePath = getWorktreePath(tempDir, 'to-remove');
    expect(existsSync(worktreePath)).toBe(true);

    removeWorktree(tempDir, 'to-remove');
    expect(existsSync(worktreePath)).toBe(false);

    // Branch should still exist
    const branches = execSync('git branch', { cwd: tempDir, encoding: 'utf-8' });
    expect(branches).toContain('claudenv/to-remove');
  });

  // --- mergeWorktree ---

  it('mergeWorktree creates merge commit with --no-ff', async () => {
    const result = await createWorktree(tempDir, 'to-merge');

    // Make a change in the worktree
    await writeFile(join(result.path, 'new-file.txt'), 'worktree change');
    execSync('git add . && git commit -m "worktree commit"', { cwd: result.path, stdio: 'pipe' });

    const mergeResult = mergeWorktree(tempDir, 'to-merge');
    expect(mergeResult.merged).toBe(true);
    expect(mergeResult.branch).toBe('claudenv/to-merge');

    // Check merge commit exists
    const log = execSync('git log --oneline -1', { cwd: tempDir, encoding: 'utf-8' });
    expect(log).toContain('Merge hypothesis: to-merge');

    // Worktree directory should be gone
    expect(existsSync(getWorktreePath(tempDir, 'to-merge'))).toBe(false);
  });

  it('mergeWorktree throws on conflict', async () => {
    const result = await createWorktree(tempDir, 'conflict-test');

    // Make conflicting changes in both branches
    await writeFile(join(tempDir, 'test.txt'), 'main change');
    execSync('git add . && git commit -m "main change"', { cwd: tempDir, stdio: 'pipe' });

    await writeFile(join(result.path, 'test.txt'), 'worktree change');
    execSync('git add . && git commit -m "worktree change"', { cwd: result.path, stdio: 'pipe' });

    expect(() => mergeWorktree(tempDir, 'conflict-test')).toThrow(/Merge conflict/);
  });

  // --- listHypotheses ---

  it('listHypotheses returns claudenv/* branches', async () => {
    expect(listHypotheses(tempDir)).toEqual([]);

    await createWorktree(tempDir, 'hyp-one');
    await createWorktree(tempDir, 'hyp-two');

    const branches = listHypotheses(tempDir);
    expect(branches).toContain('claudenv/hyp-one');
    expect(branches).toContain('claudenv/hyp-two');
    expect(branches).toHaveLength(2);
  });
});
