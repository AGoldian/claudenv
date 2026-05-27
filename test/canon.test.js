import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonAdd, canonList, canonSearch, canonPrune, formatCanon } from '../src/canon.js';

describe('canon CLI', () => {
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

  it('canonAdd writes entry and reads back', async () => {
    const res = await canonAdd({
      topic: 'raft',
      url: 'https://raft.github.io/raft.pdf',
      why: 'original paper',
      title: 'In Search of an Understandable Consensus Algorithm',
    });
    expect(res.added).toBe(true);

    const data = await canonList('raft');
    expect(data.raft).toHaveLength(1);
    expect(data.raft[0].url).toBe('https://raft.github.io/raft.pdf');
    expect(data.raft[0].title).toBe('In Search of an Understandable Consensus Algorithm');
  });

  it('canonAdd is idempotent on duplicate URL within topic', async () => {
    const opts = {
      topic: 'raft',
      url: 'https://raft.github.io/raft.pdf',
      why: 'first time',
    };
    await canonAdd(opts);
    const second = await canonAdd({ ...opts, why: 'second time' });
    expect(second.added).toBe(false);

    const data = await canonList('raft');
    expect(data.raft).toHaveLength(1);
  });

  it('canonAdd validates required fields', async () => {
    await expect(canonAdd({ topic: 'x' })).rejects.toThrow();
    await expect(canonAdd({ topic: 'x', url: 'https://example' })).rejects.toThrow();
  });

  it('canonSearch matches across topics', async () => {
    await canonAdd({ topic: 'raft', url: 'https://r.example', why: 'paper' });
    await canonAdd({ topic: 'paxos', url: 'https://p.example', why: 'consensus algo' });

    const hits = await canonSearch('consensus');
    expect(Object.keys(hits)).toEqual(['paxos']);
  });

  it('canonPrune finds entries older than threshold', async () => {
    await canonAdd({ topic: 'a', url: 'https://a.example', why: 'note' });
    // Tamper with the added date directly via the file (simulating old entry)
    const { readFile, writeFile } = await import('node:fs/promises');
    const { canonIndexPath } = await import('../src/memory-paths.js');
    let yaml = await readFile(canonIndexPath(), 'utf-8');
    yaml = yaml.replace(/added:\s*\d{4}-\d{2}-\d{2}/, 'added: 2020-01-01');
    await writeFile(canonIndexPath(), yaml, 'utf-8');

    const stale = await canonPrune(6);
    expect(stale.length).toBeGreaterThan(0);
    expect(stale[0].topic).toBe('a');
  });

  it('formatCanon prints empty-state when canon is empty', async () => {
    const text = formatCanon({});
    expect(text).toContain('Канон пуст');
  });
});
