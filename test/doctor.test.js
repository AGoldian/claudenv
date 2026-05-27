import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDoctor } from '../src/doctor.js';

describe('doctor', () => {
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

  it('reports node version check', async () => {
    const { lines } = await runDoctor();
    const nodeLine = lines.find((l) => l.includes('Node.js'));
    expect(nodeLine).toBeDefined();
    expect(nodeLine).toMatch(/^\[OK\]/);
  });

  it('reports missing memories layout as WARN, not FAIL', async () => {
    const { lines, hasFail } = await runDoctor();
    const memLine = lines.find((l) => l.includes('memories'));
    expect(memLine).toBeDefined();
    // memories not yet initialised → WARN expected, not FAIL
    expect(hasFail).toBe(false);
  });

  it('passes layout check after memory init', async () => {
    const { memoryInit } = await import('../src/memory.js');
    await memoryInit();
    const { lines } = await runDoctor();
    const memLine = lines.find((l) => l.startsWith('[OK]') && l.includes('memories'));
    expect(memLine).toBeDefined();
  });
});
