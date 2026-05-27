import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readDecisionsLoggerInput, handleDecisionsLogger } from '../../src/hooks/decisions-logger.js';

describe('decisions-logger hook', () => {
  let tempHome;
  let workDir;
  let prevHome;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'claudenv-home-'));
    workDir = await mkdtemp(join(tmpdir(), 'claudenv-work-'));
    prevHome = process.env.CLAUDENV_HOME;
    process.env.CLAUDENV_HOME = tempHome;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  describe('readDecisionsLoggerInput', () => {
    it('handles canonical Claude Code event shape', () => {
      const event = {
        tool_name: 'Write',
        tool_input: { file_path: '/foo/bar.md', content: 'hello' },
      };
      expect(readDecisionsLoggerInput(event)).toEqual({
        filePath: '/foo/bar.md',
        content: 'hello',
      });
    });

    it('handles camelCase variant', () => {
      const event = { toolInput: { filePath: '/x.md', text: 'y' } };
      expect(readDecisionsLoggerInput(event)).toEqual({
        filePath: '/x.md',
        content: 'y',
      });
    });

    it('handles null/missing event', () => {
      expect(readDecisionsLoggerInput(null)).toEqual({ filePath: null, content: null });
      expect(readDecisionsLoggerInput({})).toEqual({ filePath: null, content: null });
    });
  });

  describe('handleDecisionsLogger', () => {
    it('short-circuits non-decision writes', async () => {
      const result = await handleDecisionsLogger({
        filePath: '/some/random/file.txt',
        content: 'just code, no marker',
      });
      expect(result.exitCode).toBe(0);

      // No dirty flag set
      await expect(stat(join(tempHome, '.index-dirty'))).rejects.toThrow();
    });

    it('catches decision write by global path', async () => {
      const decisionFile = join(tempHome, 'memories', 'decisions', '2026-05-27-x.md');
      await mkdir(join(decisionFile, '..'), { recursive: true });
      await writeFile(
        decisionFile,
        `---
date: 2026-05-27T10:00:00Z
topic: test
chose: option-a
reason: because
scope: global
---

body

__VIBE_DECISION__
`
      );

      const result = await handleDecisionsLogger({
        filePath: decisionFile,
        content: null,
      });
      expect(result.exitCode).toBe(0);

      // Dirty flag set
      const flagStat = await stat(join(tempHome, '.index-dirty'));
      expect(flagStat.isFile()).toBe(true);
    });

    it('catches decision write by project path', async () => {
      const decisionFile = join(workDir, '.claude', 'memories', 'decisions', '2026-05-27-y.md');
      await mkdir(join(decisionFile, '..'), { recursive: true });
      await writeFile(
        decisionFile,
        `---
date: 2026-05-27T10:00:00Z
topic: project-thing
chose: jwt
reason: stateless
scope: project
---
`
      );

      const result = await handleDecisionsLogger({
        filePath: decisionFile,
        content: null,
      });
      expect(result.exitCode).toBe(0);

      const flagStat = await stat(join(tempHome, '.index-dirty'));
      expect(flagStat.isFile()).toBe(true);
    });

    it('catches decision write by marker even on non-decision path', async () => {
      const file = join(workDir, 'random-place.md');
      await writeFile(
        file,
        `---
date: 2026-05-27T10:00:00Z
topic: x
chose: y
reason: z
---

body __VIBE_DECISION__
`
      );

      const result = await handleDecisionsLogger({
        filePath: file,
        content: await readFile(file, 'utf-8'),
      });
      expect(result.exitCode).toBe(0);

      const flagStat = await stat(join(tempHome, '.index-dirty'));
      expect(flagStat.isFile()).toBe(true);
    });

    it('logs warning when required fields missing', async () => {
      const decisionFile = join(tempHome, 'memories', 'decisions', 'bad.md');
      await mkdir(join(decisionFile, '..'), { recursive: true });
      await writeFile(
        decisionFile,
        `---
date: 2026-05-27
topic: incomplete
---

missing chose, reason
`
      );

      await handleDecisionsLogger({ filePath: decisionFile, content: null });

      const logPath = join(tempHome, '.log', 'decisions-logger.log');
      const log = await readFile(logPath, 'utf-8');
      expect(log).toContain('missing required fields');
      expect(log).toMatch(/chose.*reason|reason.*chose/);
    });

    it('logs warning on scope/path mismatch (does NOT rewrite)', async () => {
      const wrongPath = join(tempHome, 'memories', 'decisions', 'mismatch.md');
      await mkdir(join(wrongPath, '..'), { recursive: true });
      await writeFile(
        wrongPath,
        `---
date: 2026-05-27
topic: t
chose: x
reason: y
scope: project
---
`
      );

      await handleDecisionsLogger({ filePath: wrongPath, content: null });

      const logPath = join(tempHome, '.log', 'decisions-logger.log');
      const log = await readFile(logPath, 'utf-8');
      expect(log).toContain('declares scope=project');
      expect(log).toContain('claudenv decisions fix --rescope');

      // File NOT rewritten — still on the wrong path
      const stillThere = await readFile(wrongPath, 'utf-8');
      expect(stillThere).toContain('scope: project');
    });
  });
});
