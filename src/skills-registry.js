/**
 * skills-registry.js — discover and install Claude skills from the
 * awesome-claude-skills registry + a curated bundled catalog.
 *
 * The registry (https://github.com/ComposioHQ/awesome-claude-skills) is a plain
 * markdown README, not a machine index, and its links are HETEROGENEOUS. Install
 * classes (verified against live raw.githubusercontent.com endpoints 2026-06-08):
 *
 *   repo-path : github.com/<o>/<r>/(tree|blob)/<branch>/<path>
 *               → https://raw.githubusercontent.com/<o>/<r>/<branch>/<path>/SKILL.md   (reliable)
 *   in-repo   : a README-relative "./<slug>/" link
 *               → resolved against the awesome repo (reliable)
 *   repo-root : github.com/<o>/<r> with no path
 *               → SKILL.md location unknown; best-effort probe, else guide
 *   bootstrap : not a copyable SKILL.md — installed by a shell command (kimi-webbridge)
 *   guide     : non-fetchable (vendor dashboard, Composio platform connector) → show the URL
 *
 * SECURITY. installSkill() writes ONLY under ~/.claude/skills/<slug>/SKILL.md, never
 * overwrites without force, validates that the fetched body is a real SKILL.md
 * (frontmatter + name, size cap, not an HTML page), and NEVER executes fetched
 * content. A fetched SKILL.md is auto-loaded, model-facing instruction text, so it
 * is a prompt-injection surface: only CURATED (bundled) entries are safe to
 * auto-equip; LIVE entries must be confirmed by the user (see the harness skill).
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  claudeSkillsDir,
  skillsRegistryCachePath,
  parseFrontmatter,
} from './memory-paths.js';
import { BUNDLED_CATALOG, findBundled } from './bundled-catalog.js';

const AWESOME = { owner: 'ComposioHQ', repo: 'awesome-claude-skills', branch: 'master' };
const RAW = 'https://raw.githubusercontent.com';
const README_URL = `${RAW}/${AWESOME.owner}/${AWESOME.repo}/${AWESOME.branch}/README.md`;
const MAX_SKILL_BYTES = 256 * 1024;

// =============================================================
// Classification & resolution (pure)
// =============================================================

/** Classify a registry link into an install class from its URL shape alone. */
export function classifyUrl(url) {
  const u = (url || '').trim();
  if (!u) return 'guide';
  // README-relative link → an in-repo skill folder of the awesome repo
  if (!/^https?:\/\//i.test(u)) return 'in-repo';
  const gh = /^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(u);
  if (gh) {
    return /\/(tree|blob)\/[^/]+\/.+/i.test(u) ? 'repo-path' : 'repo-root';
  }
  return 'guide';
}

/**
 * Resolve an entry into something installable.
 * Returns one of:
 *   { kind: 'bootstrap', command, url }
 *   { kind: 'fetch', class, candidates: [rawUrl...], url, uncertain? }
 *   { kind: 'guide', url, reason }
 */
export function resolveSkillSource(entry) {
  const url = (entry.url || '').trim();
  // Strip query/fragment before constructing raw fetch URLs (display keeps `url`).
  const u = url.replace(/[?#].*$/, '');
  const cls = entry.install || classifyUrl(url);

  if (cls === 'bootstrap' || entry.bootstrap) {
    return { kind: 'bootstrap', command: entry.bootstrap, url };
  }

  if (cls === 'in-repo') {
    const path = u.replace(/^\.?\/+/, '').replace(/\/+$/, '');
    if (!path) return { kind: 'guide', url, reason: 'empty in-repo path' };
    return {
      kind: 'fetch',
      class: 'in-repo',
      url,
      candidates: [`${RAW}/${AWESOME.owner}/${AWESOME.repo}/${AWESOME.branch}/${path}/SKILL.md`],
    };
  }

  if (cls === 'repo-path') {
    const m = /github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)\/(.+?)\/?$/i.exec(u);
    if (m) {
      const [, owner, repo, branch, path] = m;
      return {
        kind: 'fetch',
        class: 'repo-path',
        url,
        candidates: [`${RAW}/${owner}/${repo}/${branch}/${path}/SKILL.md`],
      };
    }
  }

  if (cls === 'repo-root') {
    const m = /github\.com\/([^/]+)\/([^/]+?)\/?$/i.exec(u);
    if (m) {
      const [, owner, repo] = m;
      const candidates = [];
      for (const b of ['main', 'master']) {
        candidates.push(`${RAW}/${owner}/${repo}/${b}/SKILL.md`);
        candidates.push(`${RAW}/${owner}/${repo}/${b}/skills/${repo}/SKILL.md`);
        candidates.push(`${RAW}/${owner}/${repo}/${b}/${repo}/SKILL.md`);
      }
      return { kind: 'fetch', class: 'repo-root', url, candidates, uncertain: true };
    }
  }

  return { kind: 'guide', url, reason: 'not a fetchable SKILL.md (vendor/platform link)' };
}

// Terminal path segments that are too generic to be a distinctive slug — for
// these we prefer the descriptive link text (e.g. ".../ai-skills/tree/main/skills").
const GENERIC_SEGMENTS = new Set([
  'skills', 'skill', 'src', 'main', 'master', 'plugin', 'plugins',
  'package', 'packages', 'tree', 'blob', 'docs', 'examples',
]);

/** Derive a filesystem-safe slug from a registry entry's name/url. */
export function slugify(name, url) {
  const cleaned = (url || '')
    .replace(/[?#].*$/, '') // drop query/fragment
    .replace(/\/(tree|blob)\/[^/]+\//i, '/') // drop the /tree|blob/<branch>/ segment
    .replace(/\/+$/, '');
  const last = /\/([^/]+)$/.exec(cleaned);
  let base = (last ? last[1] : cleaned).toLowerCase();
  base = base.replace(/\.git$/, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const nameSlug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (base && /^[a-z0-9]/.test(base) && !GENERIC_SEGMENTS.has(base)) return base;
  return nameSlug || base || 'skill';
}

// =============================================================
// README parsing (pure)
// =============================================================

/**
 * Parse the awesome-claude-skills README markdown into entries. Only the
 * "## Skills" section is scanned; "### <category>" headings group entries;
 * items look like `- [Name](url) - description *By [@x](...)*`.
 */
export function parseRegistry(markdown) {
  const entries = [];
  let category = null;
  let inSkills = false;

  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.replace(/\s+$/, '');

    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      inSkills = /^skills\b/i.test(h2[1].trim());
      category = null;
      continue;
    }
    if (!inSkills) continue;

    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      category = h3[1].trim();
      continue;
    }

    const item = /^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[-–—:]*\s*(.*)$/.exec(line);
    if (!item) continue;

    const name = item[1].trim();
    const url = item[2].trim();
    let description = item[3].trim();
    // strip a trailing "*By [@author](...)*" attribution
    description = description.replace(/\*By\s+\[[^\]]*\]\([^)]*\)\*\s*$/i, '').trim();
    description = description.replace(/\s*\*By\b[^*]*\*\s*$/i, '').trim();

    if (!name || !url) continue;
    entries.push({
      name,
      slug: slugify(name, url),
      url,
      description,
      category,
      install: classifyUrl(url),
      curated: false,
    });
  }
  return entries;
}

/** Rank catalog entries against a free-text query (curated entries get a nudge). */
export function searchCatalog(entries, query) {
  if (!query || !query.trim()) {
    return [...entries].sort((a, b) => Number(b.curated) - Number(a.curated));
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of entries) {
    const slug = (e.slug || '').toLowerCase();
    const name = (e.name || '').toLowerCase();
    const hay = `${name} ${slug} ${e.description || ''} ${e.category || ''}`.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const t of terms) {
      if (!hay.includes(t)) {
        matchedAll = false;
        break;
      }
      if (slug === t) score += 6;
      score += name.includes(t) ? 3 : 1;
    }
    if (!matchedAll) continue;
    if (e.curated) score += 2;
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.e);
}

/** Merge curated (authoritative) + live entries; curated wins on slug collision. */
export function mergeCatalog(curated, live) {
  const bySlug = new Map();
  for (const e of live || []) bySlug.set(e.slug, e);
  for (const e of curated || []) bySlug.set(e.slug, e); // curated overrides
  return [...bySlug.values()];
}

// =============================================================
// Fetch / cache / install (effectful — fetch is injectable for tests)
// =============================================================

async function fetchText(url, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  if (!f) throw new Error('no fetch available — Node >= 18 or pass fetchImpl');
  let res;
  try {
    res = await f(url, { headers: { 'User-Agent': 'claudenv-skills' }, redirect: 'follow' });
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;
  return await res.text();
}

/** Validate that a fetched body really is a SKILL.md (cheap safety gate). */
export function validateSkillBody(text) {
  if (!text || typeof text !== 'string') return { ok: false, reason: 'empty response' };
  if (Buffer.byteLength(text, 'utf-8') > MAX_SKILL_BYTES) {
    return { ok: false, reason: 'SKILL.md too large (>256KB) — fetch manually' };
  }
  if (/^\s*<(!doctype|html|head|body)\b/i.test(text)) {
    return { ok: false, reason: 'response looks like an HTML page, not a SKILL.md' };
  }
  const fm = parseFrontmatter(text);
  if (!fm || !fm.name) return { ok: false, reason: 'no SKILL.md frontmatter (missing name:)' };
  return { ok: true, frontmatter: fm };
}

/** Fetch + parse the live registry README. Throws only if README itself is unreachable. */
export async function fetchRegistry(fetchImpl) {
  const md = await fetchText(README_URL, fetchImpl);
  if (!md) throw new Error(`could not fetch registry README (${README_URL})`);
  return parseRegistry(md);
}

async function readCache() {
  try {
    return JSON.parse(await readFile(skillsRegistryCachePath(), 'utf-8'));
  } catch {
    return [];
  }
}

export async function writeCache(entries) {
  const p = skillsRegistryCachePath();
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, JSON.stringify(entries, null, 2), 'utf-8');
}

/** Fetch the live registry and persist it to the cache. Returns the entries. */
export async function refreshCatalog(fetchImpl) {
  const entries = await fetchRegistry(fetchImpl);
  await writeCache(entries);
  return entries;
}

/**
 * Synthesize a catalog entry from a bare URL (github tree/blob/root or a
 * README-relative path), so `skills add <url>` works. Always non-curated.
 */
export function makeEntryFromUrl(url) {
  const u = (url || '').trim();
  return {
    name: u,
    slug: slugify(u, u),
    url: u,
    description: '',
    category: null,
    install: classifyUrl(u),
    curated: false,
  };
}

/**
 * Build the working catalog: bundled (curated) + live (cached, or refreshed).
 * Offline-first — with no network and no cache you still get the curated set.
 */
export async function loadCatalog({ fetchImpl, refresh = false } = {}) {
  const curated = BUNDLED_CATALOG.map((e) => ({ ...e, curated: true }));
  let live = [];
  if (refresh) {
    try {
      live = await refreshCatalog(fetchImpl);
    } catch {
      live = await readCache();
    }
  } else {
    live = await readCache();
  }
  return mergeCatalog(curated, live);
}

/** List skills currently installed under ~/.claude/skills/. */
export async function listInstalledSkills(claudeHome) {
  const dir = claudeHome ? join(claudeHome, 'skills') : claudeSkillsDir();
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    let frontmatter = null;
    try {
      frontmatter = parseFrontmatter(await readFile(join(dir, ent.name, 'SKILL.md'), 'utf-8'));
    } catch {
      /* directory without a SKILL.md — skip metadata */
    }
    out.push({
      slug: ent.name,
      name: (frontmatter && frontmatter.name) || ent.name,
      description: (frontmatter && frontmatter.description) || '',
      hasSkillMd: !!frontmatter,
    });
  }
  return out;
}

/** Find a catalog entry by slug or name (case-insensitive). */
export function findEntry(catalog, nameOrSlug) {
  if (!nameOrSlug) return null;
  const q = String(nameOrSlug).toLowerCase();
  return (
    catalog.find((e) => e.slug.toLowerCase() === q) ||
    catalog.find((e) => (e.name || '').toLowerCase() === q) ||
    catalog.find((e) => e.slug.toLowerCase().includes(q)) ||
    findBundled(nameOrSlug) ||
    null
  );
}

/**
 * Install one skill. Returns a result describing what happened:
 *   { action: 'installed', slug, path, source, curated, frontmatter }
 *   { action: 'exists', slug, path }
 *   { action: 'needs-confirm', slug, url }         — live (untrusted) entry, confirmLive not set
 *   { action: 'bootstrap', slug, command, url }   — caller decides whether to run it
 *   { action: 'guide', slug, url, reason }         — not file-copyable
 *   { action: 'invalid', slug, url, reason }       — fetched body failed validation
 *
 * TRUST GATE (enforced in code, not just docs): a live (non-curated) entry is NOT
 * fetched or written unless `confirmLive` is true. `claudenv loop` never passes it,
 * so the loop is physically unable to install a live skill — only the curated
 * allowlist can auto-equip. A fetched SKILL.md is auto-loaded model-facing text.
 *
 * Never throws on network/validation failures — degrades to 'guide'/'invalid'.
 */
export async function installSkill(entry, { fetchImpl, claudeHome, force = false, confirmLive = false } = {}) {
  const slug = entry.slug || slugify(entry.name, entry.url);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) {
    throw new Error(`invalid skill slug "${slug}"`);
  }

  const src = resolveSkillSource(entry);
  if (src.kind === 'bootstrap') {
    return { action: 'bootstrap', slug, command: src.command, url: src.url };
  }
  if (src.kind === 'guide') {
    return { action: 'guide', slug, url: src.url, reason: src.reason };
  }

  // Trust gate: never fetch/write an untrusted (non-curated) skill without
  // explicit confirmation. This is the code-level enforcement of the boundary
  // that the docs and the loop fragment describe.
  if (entry.curated !== true && !confirmLive) {
    return { action: 'needs-confirm', slug, url: src.url || entry.url };
  }

  const skillsHome = claudeHome ? join(claudeHome, 'skills') : claudeSkillsDir();
  const destDir = join(skillsHome, slug);
  const destFile = join(destDir, 'SKILL.md');

  if (!force) {
    try {
      await stat(destFile);
      return { action: 'exists', slug, path: destFile };
    } catch {
      /* not installed yet — proceed */
    }
  }

  let body = null;
  let usedUrl = null;
  for (const candidate of src.candidates) {
    body = await fetchText(candidate, fetchImpl);
    if (body) {
      usedUrl = candidate;
      break;
    }
  }
  if (!body) {
    return {
      action: 'guide',
      slug,
      url: src.url,
      reason: 'no SKILL.md found at the expected location — open the link and copy it manually',
    };
  }

  const valid = validateSkillBody(body);
  if (!valid.ok) {
    return { action: 'invalid', slug, url: usedUrl, reason: valid.reason };
  }

  await mkdir(destDir, { recursive: true });
  await writeFile(destFile, body, 'utf-8');
  return {
    action: 'installed',
    slug,
    path: destFile,
    source: usedUrl,
    curated: !!entry.curated,
    frontmatter: valid.frontmatter,
  };
}
