export { detectTechStack } from './detector.js';
export { generateDocs, writeDocs } from './generator.js';
export { validateClaudeMd, validateStructure, crossReferenceCheck } from './validator.js';
export { runExistingProjectFlow, runColdStartFlow, buildDefaultConfig } from './prompts.js';
export { installScaffold } from './generator.js';
export { runLoop, spawnClaude, checkClaudeCli } from './loop.js';
export { AUTONOMY_PROFILES, getProfile, listProfiles, CREDENTIAL_PATHS } from './profiles.js';
export { generateSettingsJson, generatePreToolUseHook, generateAuditLogHook, generateAliases, generateCIWorkflow } from './hooks-gen.js';
export { generateAutonomyConfig, printSecuritySummary, getFullModeWarning } from './autonomy.js';
