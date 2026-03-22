// =============================================
// Autonomy profiles — permission presets for Claude Code
// =============================================

export const CREDENTIAL_PATHS = [
  '~/.ssh',
  '~/.aws',
  '~/.gnupg',
  '~/.npmrc',
  '~/.pypirc',
  '~/.git-credentials',
  '~/.docker/config.json',
  '~/.kube',
  '~/Library/Keychains',
];

export const AUTONOMY_PROFILES = {
  safe: {
    name: 'safe',
    description: 'Read-only + limited bash — safe for exploration',
    model: 'sonnet',
    allowedTools: [
      'Read',
      'Glob',
      'Grep',
      'Bash(ls *)',
      'Bash(cat *)',
      'Bash(git status)',
      'Bash(git log *)',
      'Bash(git diff *)',
    ],
    disallowedTools: [
      'Bash(rm *)',
      'Bash(sudo *)',
      'Edit',
      'Write',
    ],
    skipPermissions: false,
    credentialPolicy: 'block',
  },

  moderate: {
    name: 'moderate',
    description: 'Full development with deny-list — safe for most development work',
    model: 'sonnet',
    allowedTools: [
      'Read',
      'Edit',
      'Write',
      'Glob',
      'Grep',
      'Bash(npm *)',
      'Bash(npx *)',
      'Bash(git *)',
      'Bash(node *)',
      'Bash(python3 *)',
      'Bash(pip *)',
    ],
    disallowedTools: [
      'Bash(rm -rf *)',
      'Bash(rm -fr *)',
      'Bash(sudo *)',
      'Bash(git push --force *)',
      'Bash(git push -f *)',
      'Bash(git reset --hard *)',
      'Bash(chmod 777 *)',
      'Bash(dd *)',
      'Bash(mkfs *)',
    ],
    skipPermissions: false,
    credentialPolicy: 'block',
  },

  full: {
    name: 'full',
    description: 'Full autonomy — unrestricted access with audit logging',
    model: 'opus',
    allowedTools: [],
    disallowedTools: [],
    skipPermissions: true,
    credentialPolicy: 'warn',
  },

  ci: {
    name: 'ci',
    description: 'Headless CI/CD mode — full autonomy with turn/budget limits',
    model: 'haiku',
    allowedTools: [],
    disallowedTools: [],
    skipPermissions: true,
    credentialPolicy: 'warn',
    maxTurns: 50,
    maxBudget: 5.0,
  },
};

/**
 * Get a profile by name. Throws if not found.
 * @param {string} name
 * @returns {object}
 */
export function getProfile(name) {
  const profile = AUTONOMY_PROFILES[name];
  if (!profile) {
    const valid = Object.keys(AUTONOMY_PROFILES).join(', ');
    throw new Error(`Unknown autonomy profile: "${name}". Valid profiles: ${valid}`);
  }
  return profile;
}

/**
 * List all profiles with name and description.
 * @returns {Array<{name: string, description: string}>}
 */
export function listProfiles() {
  return Object.values(AUTONOMY_PROFILES).map(({ name, description }) => ({ name, description }));
}
