// =============================================
// Autonomy orchestrator — generates all config files for a profile
// =============================================

import { getProfile } from './profiles.js';
import {
  generateSettingsJson,
  generatePreToolUseHook,
  generateAuditLogHook,
  generateAliases,
  generateCIWorkflow,
} from './hooks-gen.js';
import { detectTechStack } from './detector.js';

/**
 * Generate all autonomy config files for a given profile.
 *
 * @param {string} profileName - Profile name (safe, moderate, full, ci)
 * @param {string} projectDir - Project directory path
 * @param {object} [options]
 * @param {object} [options.detected] - Pre-computed tech stack (skips detection)
 * @returns {Promise<{ files: Array<{path: string, content: string}>, profile: object }>}
 */
export async function generateAutonomyConfig(profileName, projectDir, options = {}) {
  const profile = getProfile(profileName);
  const detected = options.detected || (await detectTechStack(projectDir));

  const files = [
    {
      path: '.claude/settings.json',
      content: generateSettingsJson(profile, detected),
    },
    {
      path: '.claude/hooks/pre-tool-use.sh',
      content: generatePreToolUseHook(profile, detected),
    },
    {
      path: '.claude/hooks/audit-log.sh',
      content: generateAuditLogHook(),
    },
    {
      path: '.claude/aliases.sh',
      content: generateAliases(profile),
    },
  ];

  // CI profile: add GitHub Actions workflow
  if (profileName === 'ci' && (!detected.ci || detected.ci === 'github-actions')) {
    files.push({
      path: '.github/workflows/claude-ci.yml',
      content: generateCIWorkflow(),
    });
  }

  return { files, profile };
}

/**
 * Print a security summary table for a profile.
 * @param {object} profile
 */
export function printSecuritySummary(profile) {
  console.log(`\n  Security summary — ${profile.name} profile\n`);
  console.log(`  ${'─'.repeat(50)}`);

  console.log(`  Skip permissions:   ${profile.skipPermissions ? 'YES (--dangerously-skip-permissions)' : 'No'}`);
  console.log(`  Credential policy:  ${profile.credentialPolicy}`);

  if (profile.allowedTools && profile.allowedTools.length > 0) {
    console.log(`  Allowed tools:      ${profile.allowedTools.length} tool(s)`);
    for (const t of profile.allowedTools) {
      console.log(`    + ${t}`);
    }
  }

  if (profile.disallowedTools && profile.disallowedTools.length > 0) {
    console.log(`  Blocked tools:      ${profile.disallowedTools.length} tool(s)`);
    for (const t of profile.disallowedTools) {
      console.log(`    - ${t}`);
    }
  }

  if (profile.maxTurns) {
    console.log(`  Max turns:          ${profile.maxTurns}`);
  }
  if (profile.maxBudget) {
    console.log(`  Max budget:         $${profile.maxBudget}`);
  }

  console.log(`  ${'─'.repeat(50)}`);

  // Hard blocks (all profiles)
  console.log(`\n  Hard blocks (all profiles):`);
  console.log(`    - rm -rf / rm -fr`);
  console.log(`    - Force push to main/master`);
  console.log(`    - sudo commands`);

  console.log();
}

/**
 * Full autonomy mode warning text.
 * @returns {string}
 */
export function getFullModeWarning() {
  return `
  ⚠️  FULL AUTONOMY MODE — UNRESTRICTED ACCESS

  This profile grants Claude Code complete access including:
  • All file system operations (read, write, delete)
  • Credential files (~/.ssh, ~/.aws, ~/.gnupg, ~/.kube, etc.)
  • All git operations including force push
  • No permission prompts (--dangerously-skip-permissions)

  Safety net: audit logging + hard blocks on rm -rf / and force push to main
`;
}
