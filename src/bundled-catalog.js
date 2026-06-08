/**
 * Curated catalog of high-value Claude skills, shipped with claudenv so that
 * `claudenv skills search` / `add` work OFFLINE and so that the most useful
 * entries carry a HARD, author-vetted install classification.
 *
 * Why a bundled catalog at all? The awesome-claude-skills registry is a plain
 * markdown README with heterogeneous links (in-repo folders, external repos,
 * vendor dashboards, Composio platform connectors). A fetched SKILL.md is
 * auto-loaded, model-facing instruction text — so it is a prompt-injection
 * surface. The trust boundary:
 *
 *   - CURATED (this file)        → vetted SOURCE url + install class (the bytes
 *                                  are still fetched live at add-time, not
 *                                  content-pinned) → the only entries allowed to
 *                                  auto-equip, including inside `claudenv loop`.
 *   - LIVE (parsed from README)  → untrusted → gated: installSkill returns
 *                                  needs-confirm without confirmLive; the harness
 *                                  skill / a human confirms before installing.
 *
 * `install` is the resolved class (see skills-registry.js):
 *   repo-path | in-repo | repo-root | bootstrap | guide
 *
 * URLs and classes here were verified against live endpoints
 * (raw.githubusercontent.com 200s) on 2026-06-08. If an upstream repo moves,
 * `claudenv skills add` degrades to an honest "open the link" guide.
 */

const A = 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master';

export const BUNDLED_CATALOG = [
  // --- Browser automation (bootstrap — not a copyable SKILL.md) ---
  {
    slug: 'kimi-webbridge',
    name: 'Kimi WebBridge',
    category: 'Browser & Web',
    description:
      "Control the user's real browser (their login sessions) via a local daemon — navigate, click, fill, snapshot, screenshot, network capture. Powerful automation for any website.",
    url: 'https://www.kimi.com/features/webbridge',
    install: 'bootstrap',
    bootstrap: 'curl -fsSL https://cdn.kimi.com/webbridge/install.sh | bash',
    status: () => '~/.kimi-webbridge/bin/kimi-webbridge status',
  },

  // --- Connectors & integration ---
  {
    slug: 'connect',
    name: 'Connect',
    category: 'Connectors & Integration',
    description:
      'Connect Claude to 1000+ apps via Composio — send emails, create issues, post messages, update databases. Take real actions across Gmail, Slack, GitHub, Notion, and more.',
    url: `${A}/connect`,
    install: 'repo-path',
  },
  {
    slug: 'mcp-builder',
    name: 'MCP Builder',
    category: 'Connectors & Integration',
    description: 'Scaffold and build Model Context Protocol (MCP) servers to expose new tools to Claude.',
    url: `${A}/mcp-builder`,
    install: 'repo-path',
  },

  // --- Meta: extend the harness itself ---
  {
    slug: 'skill-creator',
    name: 'Skill Creator',
    category: 'Meta & Self-extension',
    description: 'Author new Claude skills — structure, frontmatter, scripts, and best practices. Use to forge a missing capability instead of installing one.',
    url: `${A}/skill-creator`,
    install: 'repo-path',
  },

  // --- Document processing (anthropics/skills, branch main) ---
  {
    slug: 'docx',
    name: 'docx',
    category: 'Document Processing',
    description: 'Create, edit, and analyze Word documents with tracked changes, comments, and formatting.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/docx',
    install: 'repo-path',
  },
  {
    slug: 'pdf',
    name: 'pdf',
    category: 'Document Processing',
    description: 'Extract text, tables, and metadata from PDFs; merge and annotate them.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/pdf',
    install: 'repo-path',
  },
  {
    slug: 'pptx',
    name: 'pptx',
    category: 'Document Processing',
    description: 'Read, generate, and adjust PowerPoint slides, layouts, and templates.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/pptx',
    install: 'repo-path',
  },
  {
    slug: 'xlsx',
    name: 'xlsx',
    category: 'Document Processing',
    description: 'Spreadsheet manipulation: formulas, charts, and data transformations.',
    url: 'https://github.com/anthropics/skills/tree/main/skills/xlsx',
    install: 'repo-path',
  },

  // --- Development workflow (obra/superpowers, branch main) ---
  {
    slug: 'test-driven-development',
    name: 'Test-Driven Development',
    category: 'Development & Code Tools',
    description: 'Drive any feature or bugfix test-first, before writing implementation code.',
    url: 'https://github.com/obra/superpowers/tree/main/skills/test-driven-development',
    install: 'repo-path',
  },
  {
    slug: 'root-cause-tracing',
    name: 'Root-Cause Tracing',
    category: 'Development & Code Tools',
    description: 'Trace an error that surfaces deep in execution back to its original trigger.',
    url: 'https://github.com/obra/superpowers/tree/main/skills/root-cause-tracing',
    install: 'repo-path',
  },
  {
    slug: 'using-git-worktrees',
    name: 'Using Git Worktrees',
    category: 'Development & Code Tools',
    description: 'Create isolated git worktrees with smart directory selection and safety verification.',
    url: 'https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/',
    install: 'repo-path',
  },
  {
    slug: 'changelog-generator',
    name: 'Changelog Generator',
    category: 'Development & Code Tools',
    description: 'Transform git commits into customer-friendly release notes.',
    url: `${A}/changelog-generator`,
    install: 'repo-path',
  },

  // --- Data & analysis ---
  {
    slug: 'postgres',
    name: 'postgres',
    category: 'Data & Analysis',
    description: 'Run safe, read-only SQL against PostgreSQL with multi-connection support and defense-in-depth.',
    url: 'https://github.com/sanjay3290/ai-skills/tree/main/skills/postgres',
    install: 'repo-path',
  },
  {
    slug: 'brainstorming',
    name: 'Brainstorming',
    category: 'Productivity & Organization',
    description: 'Turn rough ideas into fully-formed designs through structured questioning and alternative exploration.',
    url: 'https://github.com/obra/superpowers/tree/main/skills/brainstorming',
    install: 'repo-path',
  },
];

/** Quick lookup of a curated entry by slug (case-insensitive). */
export function findBundled(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase();
  return BUNDLED_CATALOG.find((e) => e.slug.toLowerCase() === s) || null;
}
