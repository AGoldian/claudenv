import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSystemPromptWithMemory } from '../src/memory-context.js';

describe('buildSystemPromptWithMemory', () => {
  let tempHome;
  let prevHome;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'claudenv-home-'));
    prevHome = process.env.CLAUDENV_HOME;
    process.env.CLAUDENV_HOME = tempHome;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  it('includes vibe-decisions loop fragment even without goal', async () => {
    const prompt = await buildSystemPromptWithMemory(null);
    expect(prompt).toContain('Vibe-decisions mode (loop)');
    expect(prompt).toContain('Do NOT pause');
  });

  it('includes dynamic-workflows loop fragment so the loop may fan out', async () => {
    const prompt = await buildSystemPromptWithMemory(null);
    expect(prompt).toContain('Dynamic-workflows mode (loop)');
    expect(prompt).toContain('Workflow tool');
  });

  it('includes harness loop fragment so the loop may self-equip (curated only)', async () => {
    const prompt = await buildSystemPromptWithMemory(null);
    expect(prompt).toContain('Harness mode (loop)');
    expect(prompt).toContain('claudenv skills');
    expect(prompt).toContain('CURATED');
  });

  it('combines autonomy directive when goal is set', async () => {
    const prompt = await buildSystemPromptWithMemory('make money', {
      autonomyBuilder: (g) => `AUTONOMY: ${g}`,
    });
    expect(prompt).toContain('AUTONOMY: make money');
    expect(prompt).toContain('Vibe-decisions mode (loop)');
  });

  it('appends INDEX.md briefing when present', async () => {
    await mkdir(join(tempHome, 'memories'), { recursive: true });
    await writeFile(
      join(tempHome, 'memories', 'INDEX.md'),
      '# INDEX\n\nKey decision: use postgres\n'
    );
    const prompt = await buildSystemPromptWithMemory(null);
    expect(prompt).toContain('Memory briefing');
    expect(prompt).toContain('Key decision: use postgres');
  });

  it('skips briefing gracefully when INDEX.md absent', async () => {
    const prompt = await buildSystemPromptWithMemory(null);
    expect(prompt).not.toContain('Memory briefing');
    expect(prompt).toContain('Vibe-decisions mode (loop)');
  });

  it('caps long INDEX.md to keep prompt stable', async () => {
    await mkdir(join(tempHome, 'memories'), { recursive: true });
    const huge = 'X'.repeat(10000);
    await writeFile(join(tempHome, 'memories', 'INDEX.md'), huge);
    const prompt = await buildSystemPromptWithMemory(null);
    expect(prompt).toContain('truncated');
    expect(prompt.length).toBeLessThan(huge.length + 500);
  });

  it('respects includeMemoryBriefing=false (for tests / cache-sensitive contexts)', async () => {
    await mkdir(join(tempHome, 'memories'), { recursive: true });
    await writeFile(join(tempHome, 'memories', 'INDEX.md'), 'briefing content');

    const prompt = await buildSystemPromptWithMemory(null, { includeMemoryBriefing: false });
    expect(prompt).not.toContain('briefing content');
  });
});
