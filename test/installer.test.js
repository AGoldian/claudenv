import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { installGlobal, uninstallGlobal } from '../src/installer.js';

describe('installGlobal', () => {
  let tempDir;
  let tempClaudenvDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claudenv-test-'));
    tempClaudenvDir = await mkdtemp(join(tmpdir(), 'claudenv-state-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
    await rm(tempClaudenvDir, { recursive: true });
  });

  it('installs command and skill files', async () => {
    const { written, skipped } = await installGlobal({
      claudeHome: tempDir,
      claudenvHome: tempClaudenvDir,
    });

    expect(written.length).toBeGreaterThan(0);
    expect(skipped).toEqual([]);

    // Check that the main command was installed
    const commandPath = join(tempDir, 'commands', 'claudenv.md');
    const content = await readFile(commandPath, 'utf-8');
    expect(content).toContain('claudenv');
    expect(content).toContain('description:');
  });

  it('installs skill templates', async () => {
    await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });

    const templatePath = join(tempDir, 'skills', 'claudenv', 'templates', 'detection-patterns.md');
    const content = await readFile(templatePath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('installs project scaffold within skill', async () => {
    await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });

    const scaffoldPath = join(tempDir, 'skills', 'claudenv', 'scaffold', '.claude', 'commands', 'init-docs.md');
    const content = await readFile(scaffoldPath, 'utf-8');
    expect(content).toContain('description:');
    expect(content).toContain('allowed-tools:');
  });

  it('skips existing files without --force', async () => {
    // First install
    const first = await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });
    expect(first.written.length).toBeGreaterThan(0);

    // Second install — should skip all
    const second = await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });
    expect(second.written).toEqual([]);
    expect(second.skipped.length).toBe(first.written.length);
    expect(second.claudenvWritten).toEqual([]);
    expect(second.claudenvSkipped.length).toBe(first.claudenvWritten.length);
  });

  it('overwrites with --force', async () => {
    // First install
    await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });

    // Second install with force
    const { written, skipped } = await installGlobal({
      claudeHome: tempDir,
      claudenvHome: tempClaudenvDir,
      force: true,
    });
    expect(written.length).toBeGreaterThan(0);
    expect(skipped).toEqual([]);
  });

  it('installs claudenv home scaffold (vibe-decisions memory layout)', async () => {
    const { claudenvWritten } = await installGlobal({
      claudeHome: tempDir,
      claudenvHome: tempClaudenvDir,
    });

    expect(claudenvWritten.length).toBeGreaterThan(0);

    // INDEX.md briefing
    const indexContent = await readFile(join(tempClaudenvDir, 'memories', 'INDEX.md'), 'utf-8');
    expect(indexContent).toContain('claudenv memory');

    // Canon yaml
    const canonContent = await readFile(join(tempClaudenvDir, 'memories', 'canon', 'index.yaml'), 'utf-8');
    expect(canonContent).toContain('Личный канон');

    // decisions/ directory exists (created even though scaffold is empty)
    const decisionsDir = await stat(join(tempClaudenvDir, 'memories', 'decisions'));
    expect(decisionsDir.isDirectory()).toBe(true);
  });

  it('installs vibe-decisions skill globally', async () => {
    await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });

    const skillPath = join(tempDir, 'skills', 'vibe-decisions', 'SKILL.md');
    const content = await readFile(skillPath, 'utf-8');
    expect(content).toContain('vibe-decisions');
    expect(content).toContain('Vibe-decisions mode (loop)');
  });

  it('installs deeper slash command', async () => {
    await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });

    const cmdPath = join(tempDir, 'commands', 'deeper.md');
    const content = await readFile(cmdPath, 'utf-8');
    expect(content).toContain('deep dive');
  });
});

describe('uninstallGlobal', () => {
  let tempDir;
  let tempClaudenvDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claudenv-test-'));
    tempClaudenvDir = await mkdtemp(join(tmpdir(), 'claudenv-state-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
    await rm(tempClaudenvDir, { recursive: true });
  });

  it('removes installed files', async () => {
    // Install first
    await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });

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

  it('preserves ~/.claudenv/ user data on uninstall', async () => {
    await installGlobal({ claudeHome: tempDir, claudenvHome: tempClaudenvDir });
    await uninstallGlobal({ claudeHome: tempDir });

    // Memory layout must survive — it's user data, not installer artifact.
    const indexStat = await stat(join(tempClaudenvDir, 'memories', 'INDEX.md'));
    expect(indexStat.isFile()).toBe(true);
  });
});
