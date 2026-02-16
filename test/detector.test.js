import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { detectTechStack } from '../src/detector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures');

describe('detectTechStack', () => {
  describe('Node.js / Next.js project', () => {
    it('detects TypeScript + Next.js stack', async () => {
      const result = await detectTechStack(join(fixtures, 'node-project'));

      expect(result.language).toBe('typescript');
      expect(result.runtime).toBe('node');
      expect(result.framework).toBe('next.js');
      expect(result.packageManager).toBe('npm');
      expect(result.testFramework).toBe('vitest');
      expect(result.linter).toBe('eslint');
      expect(result.formatter).toBe('prettier');
      expect(result.ci).toBe('github-actions');
    });

    it('suggests correct commands', async () => {
      const result = await detectTechStack(join(fixtures, 'node-project'));

      expect(result.suggestedDevCmd).toBe('npm run dev');
      expect(result.suggestedBuildCmd).toBe('npm run build');
      expect(result.suggestedTestCmd).toBe('npm run test');
    });

    it('detects manifest files', async () => {
      const result = await detectTechStack(join(fixtures, 'node-project'));

      expect(result.detectedFiles.manifests).toContain('package.json');
    });
  });

  describe('Python project', () => {
    it('detects Python + FastAPI stack', async () => {
      const result = await detectTechStack(join(fixtures, 'python-project'));

      expect(result.language).toBe('python');
      expect(result.runtime).toBe('python');
      expect(result.packageManager).toBe('uv');
      expect(result.testFramework).toBe('pytest');
      expect(result.linter).toBe('ruff');
    });

    it('detects ruff formatter from pyproject.toml', async () => {
      const result = await detectTechStack(join(fixtures, 'python-project'));

      expect(result.formatter).toBe('ruff');
    });
  });

  describe('Go project', () => {
    it('detects Go stack', async () => {
      const result = await detectTechStack(join(fixtures, 'go-project'));

      expect(result.language).toBe('go');
      expect(result.runtime).toBe('go');
      expect(result.packageManager).toBe('go-modules');
      expect(result.containerized).toBe(true);
      expect(result.linter).toBe('golangci-lint');
    });

    it('detects Docker infrastructure', async () => {
      const result = await detectTechStack(join(fixtures, 'go-project'));

      expect(result.detectedFiles.infra).toContain('docker');
    });

    it('suggests go commands', async () => {
      const result = await detectTechStack(join(fixtures, 'go-project'));

      expect(result.suggestedBuildCmd).toBe('go build ./...');
      expect(result.suggestedTestCmd).toBe('go test ./...');
    });
  });

  describe('empty directory', () => {
    it('returns null for all fields', async () => {
      const { mkdtemp } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const emptyDir = await mkdtemp(join(tmpdir(), 'empty-'));

      const result = await detectTechStack(emptyDir);

      expect(result.language).toBeNull();
      expect(result.runtime).toBeNull();
      expect(result.framework).toBeNull();
      expect(result.testFramework).toBeNull();
    });
  });
});
