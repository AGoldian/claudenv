import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { installGlobal, uninstallGlobal } from '../src/installer.js';

describe('installGlobal', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claudenv-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('installs command and skill files', async () => {
    const { written, skipped } = await installGlobal({ claudeHome: tempDir });

    expect(written.length).toBeGreaterThan(0);
    expect(skipped).toEqual([]);

    // Check that the main command was installed
    const commandPath = join(tempDir, 'commands', 'claudenv.md');
    const content = await readFile(commandPath, 'utf-8');
    expect(content).toContain('claudenv');
    expect(content).toContain('description:');
  });

  it('installs skill directory', async () => {
    await installGlobal({ claudeHome: tempDir });

    const skillPath = join(tempDir, 'skills', 'claudenv', 'SKILL.md');
    const content = await readFile(skillPath, 'utf-8');
    expect(content).toContain('name: claudenv');
  });

  it('installs project scaffold within skill', async () => {
    await installGlobal({ claudeHome: tempDir });

    const scaffoldPath = join(tempDir, 'skills', 'claudenv', 'scaffold', '.claude', 'commands', 'init-docs.md');
    const content = await readFile(scaffoldPath, 'utf-8');
    expect(content).toContain('description:');
    expect(content).toContain('allowed-tools:');
  });

  it('skips existing files without --force', async () => {
    // First install
    const first = await installGlobal({ claudeHome: tempDir });
    expect(first.written.length).toBeGreaterThan(0);

    // Second install — should skip all
    const second = await installGlobal({ claudeHome: tempDir });
    expect(second.written).toEqual([]);
    expect(second.skipped.length).toBe(first.written.length);
  });

  it('overwrites with --force', async () => {
    // First install
    await installGlobal({ claudeHome: tempDir });

    // Second install with force
    const { written, skipped } = await installGlobal({ claudeHome: tempDir, force: true });
    expect(written.length).toBeGreaterThan(0);
    expect(skipped).toEqual([]);
  });
});

describe('uninstallGlobal', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claudenv-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('removes installed files', async () => {
    // Install first
    await installGlobal({ claudeHome: tempDir });

    // Uninstall
    const { removed } = await uninstallGlobal({ claudeHome: tempDir });
    expect(removed.length).toBeGreaterThan(0);

    // Verify command is gone
    await expect(stat(join(tempDir, 'commands', 'claudenv.md'))).rejects.toThrow();

    // Verify skill directory is gone
    await expect(stat(join(tempDir, 'skills', 'claudenv'))).rejects.toThrow();
  });

  it('handles nothing to remove gracefully', async () => {
    const { removed } = await uninstallGlobal({ claudeHome: tempDir });
    expect(removed).toEqual([]);
  });
});
