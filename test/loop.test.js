import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  checkClaudeCli,
  detectConvergence,
  detectStuck,
  createGitTag,
  getLatestLoopTag,
  readLoopLog,
  writeLoopLog,
} from '../src/loop.js';

describe('checkClaudeCli', () => {
  it('returns installed status', () => {
    const result = checkClaudeCli();
    // Result depends on environment — just check shape
    expect(result).toHaveProperty('installed');
    expect(result).toHaveProperty('version');
    expect(typeof result.installed).toBe('boolean');
  });
});

describe('detectConvergence', () => {
  it('detects NO_MORE_IMPROVEMENTS signal', () => {
    expect(detectConvergence('NO_MORE_IMPROVEMENTS')).toBe(true);
    expect(detectConvergence('The result is: NO_MORE_IMPROVEMENTS')).toBe(true);
    expect(detectConvergence('no more improvements')).toBe(true);
    expect(detectConvergence('NO MORE IMPROVEMENTS found')).toBe(true);
  });

  it('returns false for normal output', () => {
    expect(detectConvergence('Added unit tests for auth middleware')).toBe(false);
    expect(detectConvergence('Fixed bug in login handler')).toBe(false);
    expect(detectConvergence('')).toBe(false);
    expect(detectConvergence(null)).toBe(false);
  });
});

describe('detectStuck', () => {
  it('detects identical summaries', () => {
    const iterations = [
      { number: 1, summary: 'Added unit tests for auth middleware' },
      { number: 2, summary: 'Added unit tests for auth middleware' },
    ];
    expect(detectStuck(iterations)).toBe(true);
  });

  it('detects very similar summaries', () => {
    const iterations = [
      { number: 1, summary: 'Added unit tests for the auth middleware module' },
      { number: 2, summary: 'Added unit tests for the auth middleware module again' },
    ];
    expect(detectStuck(iterations)).toBe(true);
  });

  it('returns false for different summaries', () => {
    const iterations = [
      { number: 1, summary: 'Added unit tests for auth middleware' },
      { number: 2, summary: 'Fixed performance issue in database queries' },
    ];
    expect(detectStuck(iterations)).toBe(false);
  });

  it('returns false for fewer than 2 iterations', () => {
    expect(detectStuck([])).toBe(false);
    expect(detectStuck([{ number: 1, summary: 'test' }])).toBe(false);
  });

  it('returns false for empty summaries', () => {
    const iterations = [
      { number: 1, summary: '' },
      { number: 2, summary: '' },
    ];
    expect(detectStuck(iterations)).toBe(false);
  });
});

describe('git tag helpers', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claudenv-loop-test-'));
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    execSync('git add . && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('creates a git tag with correct prefix', () => {
    const tag = createGitTag(tempDir);
    expect(tag).toMatch(/^claudenv-loop-\d{4}-\d{2}-\d{2}-\d{4}$/);

    // Verify tag exists in git
    const tags = execSync('git tag', { cwd: tempDir, encoding: 'utf-8' }).trim();
    expect(tags).toBe(tag);
  });

  it('finds the latest loop tag', () => {
    const tag = createGitTag(tempDir);
    const found = getLatestLoopTag(tempDir);
    expect(found).toBe(tag);
  });

  it('returns null when no loop tags exist', () => {
    const found = getLatestLoopTag(tempDir);
    expect(found).toBeNull();
  });
});

describe('loop log I/O', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claudenv-loop-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('writes and reads loop log', async () => {
    const data = {
      started: '2026-02-18T14:32:00Z',
      goal: 'Add test coverage',
      model: 'sonnet',
      gitTag: 'claudenv-loop-2026-02-18-1432',
      preLoopCommit: 'abc1234',
      iterations: [],
      completedAt: null,
      stopReason: null,
      totalIterations: 0,
    };

    await writeLoopLog(tempDir, data);
    const read = await readLoopLog(tempDir);
    expect(read).toEqual(data);
  });

  it('creates .claude directory if needed', async () => {
    await writeLoopLog(tempDir, { test: true });
    const content = await readFile(join(tempDir, '.claude', 'loop-log.json'), 'utf-8');
    expect(JSON.parse(content)).toEqual({ test: true });
  });

  it('returns null when log does not exist', async () => {
    const result = await readLoopLog(tempDir);
    expect(result).toBeNull();
  });
});
