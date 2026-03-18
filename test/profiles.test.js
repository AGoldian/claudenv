import { describe, it, expect } from 'vitest';
import {
  AUTONOMY_PROFILES,
  getProfile,
  listProfiles,
  CREDENTIAL_PATHS,
} from '../src/profiles.js';

describe('AUTONOMY_PROFILES', () => {
  const profileNames = ['safe', 'moderate', 'full', 'ci'];

  it('has all four profiles', () => {
    expect(Object.keys(AUTONOMY_PROFILES).sort()).toEqual(profileNames.sort());
  });

  for (const name of profileNames) {
    it(`${name} profile has required fields`, () => {
      const p = AUTONOMY_PROFILES[name];
      expect(p.name).toBe(name);
      expect(typeof p.description).toBe('string');
      expect(Array.isArray(p.allowedTools)).toBe(true);
      expect(Array.isArray(p.disallowedTools)).toBe(true);
      expect(typeof p.skipPermissions).toBe('boolean');
      expect(['block', 'warn']).toContain(p.credentialPolicy);
    });
  }

  it('safe and moderate block credentials', () => {
    expect(AUTONOMY_PROFILES.safe.credentialPolicy).toBe('block');
    expect(AUTONOMY_PROFILES.moderate.credentialPolicy).toBe('block');
  });

  it('full and ci warn on credentials', () => {
    expect(AUTONOMY_PROFILES.full.credentialPolicy).toBe('warn');
    expect(AUTONOMY_PROFILES.ci.credentialPolicy).toBe('warn');
  });

  it('full and ci skip permissions', () => {
    expect(AUTONOMY_PROFILES.full.skipPermissions).toBe(true);
    expect(AUTONOMY_PROFILES.ci.skipPermissions).toBe(true);
  });

  it('safe and moderate do not skip permissions', () => {
    expect(AUTONOMY_PROFILES.safe.skipPermissions).toBe(false);
    expect(AUTONOMY_PROFILES.moderate.skipPermissions).toBe(false);
  });

  it('ci has maxTurns and maxBudget', () => {
    expect(AUTONOMY_PROFILES.ci.maxTurns).toBe(50);
    expect(AUTONOMY_PROFILES.ci.maxBudget).toBe(5.0);
  });
});

describe('getProfile', () => {
  it('returns profile by name', () => {
    const p = getProfile('moderate');
    expect(p.name).toBe('moderate');
  });

  it('throws for unknown profile', () => {
    expect(() => getProfile('nonexistent')).toThrow(/Unknown autonomy profile/);
    expect(() => getProfile('nonexistent')).toThrow(/nonexistent/);
  });
});

describe('listProfiles', () => {
  it('returns array of {name, description}', () => {
    const list = listProfiles();
    expect(list.length).toBe(4);
    for (const item of list) {
      expect(typeof item.name).toBe('string');
      expect(typeof item.description).toBe('string');
    }
  });
});

describe('CREDENTIAL_PATHS', () => {
  it('includes common credential paths', () => {
    expect(CREDENTIAL_PATHS).toContain('~/.ssh');
    expect(CREDENTIAL_PATHS).toContain('~/.aws');
    expect(CREDENTIAL_PATHS).toContain('~/.gnupg');
    expect(CREDENTIAL_PATHS).toContain('~/.kube');
  });
});

