import { describe, it, expect } from 'vitest';
import { generateAutonomyConfig, printSecuritySummary, getFullModeWarning } from '../src/autonomy.js';
import { getProfile } from '../src/profiles.js';

describe('generateAutonomyConfig', () => {
  const detected = {
    language: 'JavaScript',
    framework: 'Next.js',
    packageManager: 'npm',
    ci: 'github-actions',
  };

  it('generates correct file set for safe profile', async () => {
    const { files, profile } = await generateAutonomyConfig('safe', '.', { detected });
    expect(profile.name).toBe('safe');

    const paths = files.map((f) => f.path);
    expect(paths).toContain('.claude/settings.json');
    expect(paths).toContain('.claude/hooks/pre-tool-use.sh');
    expect(paths).toContain('.claude/hooks/audit-log.sh');
    expect(paths).toContain('.claude/aliases.sh');
    expect(paths).not.toContain('.github/workflows/claude-ci.yml');
  });

  it('generates correct file set for moderate profile', async () => {
    const { files } = await generateAutonomyConfig('moderate', '.', { detected });

    const paths = files.map((f) => f.path);
    expect(paths).toContain('.claude/settings.json');
    expect(paths).toContain('.claude/hooks/pre-tool-use.sh');
    expect(paths).toContain('.claude/hooks/audit-log.sh');
    expect(paths).toContain('.claude/aliases.sh');
    expect(paths).not.toContain('.github/workflows/claude-ci.yml');
  });

  it('generates correct file set for full profile', async () => {
    const { files, profile } = await generateAutonomyConfig('full', '.', { detected });
    expect(profile.skipPermissions).toBe(true);

    const paths = files.map((f) => f.path);
    expect(paths).toContain('.claude/settings.json');
    expect(paths).toContain('.claude/hooks/pre-tool-use.sh');
  });

  it('generates CI workflow for ci profile with github-actions', async () => {
    const { files } = await generateAutonomyConfig('ci', '.', { detected });

    const paths = files.map((f) => f.path);
    expect(paths).toContain('.github/workflows/claude-ci.yml');
  });

  it('generates CI workflow when no CI detected', async () => {
    const { files } = await generateAutonomyConfig('ci', '.', {
      detected: { ...detected, ci: null },
    });

    const paths = files.map((f) => f.path);
    expect(paths).toContain('.github/workflows/claude-ci.yml');
  });

  it('skips CI workflow for non-github CI', async () => {
    const { files } = await generateAutonomyConfig('ci', '.', {
      detected: { ...detected, ci: 'gitlab-ci' },
    });

    const paths = files.map((f) => f.path);
    expect(paths).not.toContain('.github/workflows/claude-ci.yml');
  });

  it('settings.json is valid JSON for all profiles', async () => {
    for (const name of ['safe', 'moderate', 'full', 'ci']) {
      const { files } = await generateAutonomyConfig(name, '.', { detected });
      const settingsFile = files.find((f) => f.path === '.claude/settings.json');
      expect(() => JSON.parse(settingsFile.content)).not.toThrow();
    }
  });

  it('throws for unknown profile', async () => {
    await expect(generateAutonomyConfig('nonexistent', '.')).rejects.toThrow(/Unknown autonomy profile/);
  });
});

describe('getFullModeWarning', () => {
  it('contains warning text', () => {
    const warning = getFullModeWarning();
    expect(warning).toContain('FULL AUTONOMY MODE');
    expect(warning).toContain('UNRESTRICTED ACCESS');
    expect(warning).toContain('~/.ssh');
    expect(warning).toContain('--dangerously-skip-permissions');
  });
});

describe('printSecuritySummary', () => {
  it('does not throw for any profile', () => {
    for (const name of ['safe', 'moderate', 'full', 'ci']) {
      expect(() => printSecuritySummary(getProfile(name))).not.toThrow();
    }
  });
});
