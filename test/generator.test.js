import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { generateDocs, writeDocs } from '../src/generator.js';

describe('generateDocs', () => {
  it('generates CLAUDE.md with project overview', async () => {
    const config = {
      language: 'typescript',
      runtime: 'node',
      framework: 'next.js',
      packageManager: 'pnpm',
      testFramework: 'vitest',
      linter: 'eslint',
      formatter: 'prettier',
      projectDescription: 'SaaS web application',
      deployment: 'vercel',
      suggestedDevCmd: 'pnpm next dev',
      suggestedBuildCmd: 'pnpm next build',
      suggestedTestCmd: 'pnpm vitest run',
      suggestedLintCmd: 'pnpm next lint',
      generateRules: true,
      generateHooks: false,
    };

    const { files } = await generateDocs('/tmp/test', config);

    expect(files.length).toBeGreaterThanOrEqual(3);

    const claudeMd = files.find((f) => f.path === 'CLAUDE.md');
    expect(claudeMd).toBeDefined();
    expect(claudeMd.content).toContain('## Commands');
    expect(claudeMd.content).toContain('## Architecture');
    expect(claudeMd.content).toContain('SaaS web application');
    expect(claudeMd.content).toContain('next.js');
  });

  it('generates rules files when requested', async () => {
    const config = {
      language: 'typescript',
      framework: 'next.js',
      testFramework: 'vitest',
      packageManager: 'pnpm',
      generateRules: true,
      generateHooks: false,
    };

    const { files } = await generateDocs('/tmp/test', config);

    const codeStyle = files.find((f) => f.path === '.claude/rules/code-style.md');
    expect(codeStyle).toBeDefined();
    expect(codeStyle.content).toContain('TypeScript');

    const testing = files.find((f) => f.path === '.claude/rules/testing.md');
    expect(testing).toBeDefined();
    expect(testing.content).toContain('vitest');
  });

  it('skips rules when generateRules is false', async () => {
    const config = {
      language: 'python',
      generateRules: false,
      generateHooks: false,
    };

    const { files } = await generateDocs('/tmp/test', config);

    expect(files.length).toBe(2);
    expect(files[0].path).toBe('CLAUDE.md');
    expect(files[1].path).toBe('_state.md');
  });

  it('generates settings.json when hooks requested', async () => {
    const config = {
      language: 'go',
      generateRules: false,
      generateHooks: true,
    };

    const { files } = await generateDocs('/tmp/test', config);

    const settings = files.find((f) => f.path === '.claude/settings.json');
    expect(settings).toBeDefined();
    const parsed = JSON.parse(settings.content);
    expect(parsed.hooks).toBeDefined();
    expect(parsed.hooks.PostToolUse).toBeDefined();
  });

  it('includes Python-specific content for Python projects', async () => {
    const config = {
      language: 'python',
      framework: 'django',
      testFramework: 'pytest',
      linter: 'ruff',
      formatter: 'black',
      generateRules: true,
      generateHooks: false,
    };

    const { files } = await generateDocs('/tmp/test', config);

    const codeStyle = files.find((f) => f.path === '.claude/rules/code-style.md');
    expect(codeStyle.content).toContain('Python');
    expect(codeStyle.content).toContain('Django');

    const testing = files.find((f) => f.path === '.claude/rules/testing.md');
    expect(testing.content).toContain('pytest');
  });
});

describe('writeDocs', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gen-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes files to disk', async () => {
    const files = [
      { path: 'CLAUDE.md', content: '# Test\n\n## Commands\n\n## Architecture\n' },
    ];

    const { written, skipped } = await writeDocs(tempDir, files);

    expect(written).toEqual(['CLAUDE.md']);
    expect(skipped).toEqual([]);

    const content = await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Test');
  });

  it('creates nested directories', async () => {
    const files = [
      { path: '.claude/rules/code-style.md', content: '# Code Style' },
    ];

    const { written } = await writeDocs(tempDir, files);

    expect(written).toEqual(['.claude/rules/code-style.md']);
    const content = await readFile(join(tempDir, '.claude/rules/code-style.md'), 'utf-8');
    expect(content).toBe('# Code Style');
  });

  it('skips existing files without overwrite', async () => {
    const files = [
      { path: 'CLAUDE.md', content: '# New content' },
    ];

    // Write once
    await writeDocs(tempDir, files);
    // Try writing again
    const { written, skipped } = await writeDocs(tempDir, files);

    expect(written).toEqual([]);
    expect(skipped).toEqual(['CLAUDE.md']);
  });

  it('overwrites when option is set', async () => {
    const files = [
      { path: 'CLAUDE.md', content: '# Updated' },
    ];

    await writeDocs(tempDir, [{ path: 'CLAUDE.md', content: '# Original' }]);
    const { written } = await writeDocs(tempDir, files, { overwrite: true });

    expect(written).toEqual(['CLAUDE.md']);
    const content = await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe('# Updated');
  });
});
