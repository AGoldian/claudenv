import { describe, it, expect } from 'vitest';
import {
  generateSettingsJson,
  generatePreToolUseHook,
  generateAuditLogHook,
  generateAliases,
  generateCIWorkflow,
} from '../src/hooks-gen.js';
import { getProfile } from '../src/profiles.js';

describe('generateSettingsJson', () => {
  it('produces valid JSON for moderate profile', () => {
    const profile = getProfile('moderate');
    const json = generateSettingsJson(profile);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('permissions');
    expect(parsed).toHaveProperty('hooks');
    expect(parsed.enableAllProjectMcpServers).toBe(false);
  });

  it('includes allow list for safe profile', () => {
    const profile = getProfile('safe');
    const parsed = JSON.parse(generateSettingsJson(profile));
    expect(parsed.permissions.allow).toEqual(profile.allowedTools);
  });

  it('includes deny list for moderate profile', () => {
    const profile = getProfile('moderate');
    const parsed = JSON.parse(generateSettingsJson(profile));
    expect(parsed.permissions.deny).toEqual(expect.arrayContaining(profile.disallowedTools));
  });

  it('full profile has no permissions allow/deny', () => {
    const profile = getProfile('full');
    const parsed = JSON.parse(generateSettingsJson(profile));
    expect(parsed.permissions).toBeUndefined();
  });

  it('adds wrong package manager deny rules', () => {
    const profile = getProfile('moderate');
    const detected = { packageManager: 'pnpm' };
    const parsed = JSON.parse(generateSettingsJson(profile, detected));
    expect(parsed.permissions.deny).toEqual(expect.arrayContaining(['Bash(yarn *)']));
  });

  it('hooks config uses PascalCase keys and command objects', () => {
    const profile = getProfile('moderate');
    const parsed = JSON.parse(generateSettingsJson(profile));
    expect(parsed.hooks.PreToolUse).toBeDefined();
    expect(parsed.hooks.PostToolUse).toBeDefined();

    // PreToolUse hooks should reference pre-tool-use.sh
    const preHooks = parsed.hooks.PreToolUse.flatMap((h) => h.hooks);
    expect(preHooks[0]).toHaveProperty('type', 'command');
    expect(preHooks[0].command).toContain('pre-tool-use.sh');
    expect(preHooks[0]).toHaveProperty('timeout');

    // PostToolUse hooks should reference audit-log.sh
    const postHooks = parsed.hooks.PostToolUse.flatMap((h) => h.hooks);
    expect(postHooks[0]).toHaveProperty('type', 'command');
    expect(postHooks[0].command).toContain('audit-log.sh');
  });
});

describe('generatePreToolUseHook', () => {
  it('produces a valid bash script', () => {
    const profile = getProfile('moderate');
    const script = generatePreToolUseHook(profile);
    expect(script).toMatch(/^#!/);
    expect(script).toContain('set -euo pipefail');
  });

  it('blocks rm -rf for all profiles', () => {
    for (const name of ['safe', 'moderate', 'full', 'ci']) {
      const script = generatePreToolUseHook(getProfile(name));
      expect(script).toContain('rm');
      expect(script).toContain('BLOCKED: Destructive rm command');
    }
  });

  it('blocks force push to main for all profiles', () => {
    for (const name of ['safe', 'moderate', 'full', 'ci']) {
      const script = generatePreToolUseHook(getProfile(name));
      expect(script).toContain('BLOCKED: Force push to main/master');
    }
  });

  it('blocks credentials for safe/moderate profiles', () => {
    const safeScript = generatePreToolUseHook(getProfile('safe'));
    expect(safeScript).toContain('BLOCKED: Access to credential path');
    const moderateScript = generatePreToolUseHook(getProfile('moderate'));
    expect(moderateScript).toContain('BLOCKED: Access to credential path');
  });

  it('warns on credentials for full/ci profiles', () => {
    const fullScript = generatePreToolUseHook(getProfile('full'));
    expect(fullScript).toContain('WARNING: Accessing credential path');
    expect(fullScript).not.toContain('BLOCKED: Access to credential path');
    const ciScript = generatePreToolUseHook(getProfile('ci'));
    expect(ciScript).toContain('WARNING: Accessing credential path');
  });

  it('adds wrong package manager guard when detected', () => {
    const profile = getProfile('moderate');
    const script = generatePreToolUseHook(profile, { packageManager: 'pnpm' });
    expect(script).toContain('Wrong package manager');
    expect(script).toContain('pnpm');
  });

  it('no package manager block when not detected', () => {
    const profile = getProfile('moderate');
    const script = generatePreToolUseHook(profile, {});
    expect(script).not.toContain('Wrong package manager');
  });
});

describe('generateAuditLogHook', () => {
  it('produces a valid bash script', () => {
    const script = generateAuditLogHook();
    expect(script).toMatch(/^#!/);
    expect(script).toContain('audit-log.jsonl');
  });

  it('logs tool name and input', () => {
    const script = generateAuditLogHook();
    expect(script).toContain('CLAUDE_TOOL_NAME');
    expect(script).toContain('CLAUDE_TOOL_INPUT');
  });
});

describe('generateAliases', () => {
  it('includes claude-safe alias', () => {
    const script = generateAliases(getProfile('moderate'));
    expect(script).toContain('claude-safe');
  });

  it('includes claude-yolo alias', () => {
    const script = generateAliases(getProfile('moderate'));
    expect(script).toContain('claude-yolo');
    expect(script).toContain('--dangerously-skip-permissions');
  });

  it('includes claude-ci alias', () => {
    const script = generateAliases(getProfile('moderate'));
    expect(script).toContain('claude-ci');
  });

  it('includes claude-local alias', () => {
    const script = generateAliases(getProfile('moderate'));
    expect(script).toContain('claude-local');
  });

  it('claude-local uses --dangerously-skip-permissions for full profile', () => {
    const script = generateAliases(getProfile('full'));
    // claude-local should have --dangerously-skip-permissions
    const localLine = script.split('\n').find((l) => l.includes('alias claude-local'));
    expect(localLine).toContain('--dangerously-skip-permissions');
  });
});

describe('generateCIWorkflow', () => {
  it('produces valid YAML-like content', () => {
    const yaml = generateCIWorkflow();
    expect(yaml).toContain('name: Claude CI');
    expect(yaml).toContain('runs-on: ubuntu-latest');
    expect(yaml).toContain('anthropics/claude-code-action@v1');
  });
});
