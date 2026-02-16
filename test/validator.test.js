import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { validateClaudeMd, validateStructure, crossReferenceCheck } from '../src/validator.js';

describe('validateClaudeMd', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'val-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('passes for a valid CLAUDE.md', async () => {
    const content = `# My Project

## Project overview
A test project.

## Commands
- \`npm run dev\` — Start dev server
- \`npm run build\` — Build

## Architecture
- \`src/\` — Source code
`;
    await writeFile(join(tempDir, 'CLAUDE.md'), content);
    const result = await validateClaudeMd(join(tempDir, 'CLAUDE.md'));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when file is missing', async () => {
    const result = await validateClaudeMd(join(tempDir, 'CLAUDE.md'));

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('fails when file is empty', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), '');
    const result = await validateClaudeMd(join(tempDir, 'CLAUDE.md'));

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('empty');
  });

  it('fails when required sections are missing', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), '# My Project\n\nSome content.\n');
    const result = await validateClaudeMd(join(tempDir, 'CLAUDE.md'));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required section: ## Commands');
    expect(result.errors).toContain('Missing required section: ## Architecture');
  });

  it('warns when Commands section has no code', async () => {
    const content = `# My Project

## Commands
No commands yet.

## Architecture
- \`src/\` — Source
`;
    await writeFile(join(tempDir, 'CLAUDE.md'), content);
    const result = await validateClaudeMd(join(tempDir, 'CLAUDE.md'));

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('no inline code'))).toBe(true);
  });

  it('reports broken @import references', async () => {
    const content = `# My Project

## Commands
- \`npm test\`

## Architecture
- \`src/\`

@.claude/rules/nonexistent.md
`;
    await writeFile(join(tempDir, 'CLAUDE.md'), content);
    const result = await validateClaudeMd(join(tempDir, 'CLAUDE.md'));

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent.md'))).toBe(true);
  });
});

describe('validateStructure', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'struct-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('passes when CLAUDE.md exists', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
    const result = await validateStructure(tempDir);

    expect(result.valid).toBe(true);
  });

  it('fails when CLAUDE.md is missing', async () => {
    const result = await validateStructure(tempDir);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('CLAUDE.md not found');
  });

  it('reports invalid settings.json', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), '# Test');
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(join(tempDir, '.claude/settings.json'), 'not json');

    const result = await validateStructure(tempDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not valid JSON'))).toBe(true);
  });
});

describe('crossReferenceCheck', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'xref-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('warns about non-existent architecture directories', async () => {
    const content = `# Test

## Commands
- \`npm test\`

## Architecture
- \`src/app/\` — App router
- \`src/missing/\` — Does not exist
`;
    await writeFile(join(tempDir, 'CLAUDE.md'), content);
    await mkdir(join(tempDir, 'src/app'), { recursive: true });

    const result = await crossReferenceCheck(tempDir);

    expect(result.warnings.some((w) => w.includes('src/missing/'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('src/app/'))).toBe(false);
  });

  it('warns about missing package.json scripts', async () => {
    const content = `# Test

## Commands
- \`npm run dev\` — Dev server
- \`npm run nonexistent\` — Does not exist

## Architecture
- Works
`;
    await writeFile(join(tempDir, 'CLAUDE.md'), content);
    await writeFile(join(tempDir, 'package.json'), JSON.stringify({
      scripts: { dev: 'next dev' },
    }));

    const result = await crossReferenceCheck(tempDir);

    expect(result.warnings.some((w) => w.includes('nonexistent'))).toBe(true);
  });
});
