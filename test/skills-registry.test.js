import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  classifyUrl,
  resolveSkillSource,
  slugify,
  parseRegistry,
  searchCatalog,
  mergeCatalog,
  validateSkillBody,
  installSkill,
  listInstalledSkills,
  findEntry,
  loadCatalog,
  refreshCatalog,
  makeEntryFromUrl,
} from '../src/skills-registry.js';
import { existsSync } from 'node:fs';
import { BUNDLED_CATALOG } from '../src/bundled-catalog.js';

const README_FIXTURE = `# Awesome Claude Skills

## Contents
- [Skills](#skills)

## What Are Claude Skills?
Some prose that mentions [a link](https://example.com) but is NOT a skill entry.

## Skills

### Document Processing
- [docx](https://github.com/anthropics/skills/tree/main/skills/docx) - Create, edit, analyze Word docs.
- [LangSmith Fetch](./langsmith-fetch/) - Debug LangChain agents. *By [@OthmanAdi](https://github.com/OthmanAdi)*

### Development & Code Tools
- [Playwright Browser Automation](https://github.com/lackeyjb/playwright-skill) - Model-invoked Playwright automation. *By [@lackeyjb](https://github.com/lackeyjb)*
- [using-git-worktrees](https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/) - Isolated git worktrees.

### Business & Marketing
- [Septim Agents Pack](https://septimlabs.com/tools/agents?utm_source=x) - 10 named sub-agents.

## Getting Started
- [Not a skill](https://example.com/nope) - this is past the Skills section.
`;

function mockFetch(routes) {
  return async (url) => {
    if (Object.prototype.hasOwnProperty.call(routes, url)) {
      const body = routes[url];
      if (body === null) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => body };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
}

describe('classifyUrl', () => {
  it('classifies github tree/blob paths as repo-path', () => {
    expect(classifyUrl('https://github.com/anthropics/skills/tree/main/skills/docx')).toBe('repo-path');
    expect(classifyUrl('https://github.com/obra/superpowers/blob/main/skills/x/')).toBe('repo-path');
  });
  it('classifies github repo roots as repo-root', () => {
    expect(classifyUrl('https://github.com/lackeyjb/playwright-skill')).toBe('repo-root');
  });
  it('classifies README-relative links as in-repo', () => {
    expect(classifyUrl('./langsmith-fetch/')).toBe('in-repo');
    expect(classifyUrl('connect/')).toBe('in-repo');
  });
  it('classifies non-github URLs as guide', () => {
    expect(classifyUrl('https://septimlabs.com/tools/agents')).toBe('guide');
    expect(classifyUrl('')).toBe('guide');
  });
});

describe('slugify', () => {
  it('prefers the folder name from a repo-path url', () => {
    expect(slugify('docx', 'https://github.com/anthropics/skills/tree/main/skills/docx')).toBe('docx');
  });
  it('uses the repo name for repo-root', () => {
    expect(slugify('Playwright', 'https://github.com/lackeyjb/playwright-skill')).toBe('playwright-skill');
  });
  it('handles in-repo relative links', () => {
    expect(slugify('LangSmith Fetch', './langsmith-fetch/')).toBe('langsmith-fetch');
  });
  it('falls back to the name when url is unusable', () => {
    expect(slugify('My Cool Skill', '')).toBe('my-cool-skill');
  });
  it('prefers the link text over a GENERIC terminal segment', () => {
    // .../ai-skills/tree/main/skills -> segment "skills" is generic -> use the name
    expect(slugify('google-workspace-skills', 'https://github.com/sanjay3290/ai-skills/tree/main/skills'))
      .toBe('google-workspace-skills');
  });
  it('strips query/fragment from the url segment', () => {
    expect(slugify('Agents', 'https://github.com/o/r/tree/main/agents?utm=x#frag')).toBe('agents');
  });
});

describe('resolveSkillSource', () => {
  it('resolves repo-path to a raw SKILL.md URL', () => {
    const src = resolveSkillSource({ url: 'https://github.com/anthropics/skills/tree/main/skills/docx', install: 'repo-path' });
    expect(src.kind).toBe('fetch');
    expect(src.candidates[0]).toBe('https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md');
  });
  it('resolves blob paths too (drops /blob/)', () => {
    const src = resolveSkillSource({ url: 'https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/' });
    expect(src.candidates[0]).toBe('https://raw.githubusercontent.com/obra/superpowers/main/skills/using-git-worktrees/SKILL.md');
  });
  it('resolves in-repo links against the awesome repo (master)', () => {
    const src = resolveSkillSource({ url: './langsmith-fetch/', install: 'in-repo' });
    expect(src.candidates[0]).toBe('https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/langsmith-fetch/SKILL.md');
  });
  it('produces best-effort candidates for repo-root and marks them uncertain', () => {
    const src = resolveSkillSource({ url: 'https://github.com/lackeyjb/playwright-skill', install: 'repo-root' });
    expect(src.kind).toBe('fetch');
    expect(src.uncertain).toBe(true);
    expect(src.candidates.length).toBeGreaterThan(1);
  });
  it('returns bootstrap for entries with a bootstrap command', () => {
    const src = resolveSkillSource({ url: 'https://x', install: 'bootstrap', bootstrap: 'curl x | bash' });
    expect(src.kind).toBe('bootstrap');
    expect(src.command).toBe('curl x | bash');
  });
  it('returns guide for non-fetchable links', () => {
    const src = resolveSkillSource({ url: 'https://septimlabs.com/tools/agents', install: 'guide' });
    expect(src.kind).toBe('guide');
  });
  it('strips ?query / #fragment from the resolved raw URL', () => {
    const src = resolveSkillSource({ url: 'https://github.com/o/r/tree/main/docx?utm=x#top', install: 'repo-path' });
    expect(src.candidates[0]).toBe('https://raw.githubusercontent.com/o/r/main/docx/SKILL.md');
  });
  it('falls through to guide when a repo-path class has a malformed URL', () => {
    // install says repo-path but the URL has no /tree|blob/<branch>/<path>
    const src = resolveSkillSource({ url: 'https://github.com/o/r', install: 'repo-path' });
    expect(src.kind).toBe('guide');
  });
});

describe('parseRegistry', () => {
  const entries = parseRegistry(README_FIXTURE);

  it('only scans the ## Skills section', () => {
    const names = entries.map((e) => e.name);
    expect(names).toContain('docx');
    expect(names).not.toContain('Not a skill'); // after Skills section
    expect(names).not.toContain('a link'); // in prose before Skills
  });
  it('captures category, url, and cleaned description', () => {
    const docx = entries.find((e) => e.slug === 'docx');
    expect(docx.category).toBe('Document Processing');
    expect(docx.install).toBe('repo-path');
    expect(docx.description).toBe('Create, edit, analyze Word docs.');
  });
  it('strips the *By [@author]* attribution from descriptions', () => {
    const ls = entries.find((e) => e.slug === 'langsmith-fetch');
    expect(ls.description).toBe('Debug LangChain agents.');
    expect(ls.install).toBe('in-repo');
  });
  it('marks live entries as non-curated', () => {
    expect(entries.every((e) => e.curated === false)).toBe(true);
  });
});

describe('searchCatalog', () => {
  const catalog = [
    { slug: 'docx', name: 'docx', description: 'word documents', category: 'Document', curated: true },
    { slug: 'pdf', name: 'pdf', description: 'pdf files', category: 'Document', curated: true },
    { slug: 'weird', name: 'weird', description: 'word adjacent thing', category: 'Misc', curated: false },
  ];
  it('returns exact slug matches first', () => {
    const hits = searchCatalog(catalog, 'docx');
    expect(hits[0].slug).toBe('docx');
  });
  it('matches on description tokens', () => {
    const hits = searchCatalog(catalog, 'word');
    expect(hits.map((h) => h.slug)).toContain('docx');
    expect(hits.map((h) => h.slug)).toContain('weird');
  });
  it('requires all terms to match', () => {
    expect(searchCatalog(catalog, 'word nonexistentterm')).toEqual([]);
  });
  it('with empty query, curated entries float up', () => {
    const hits = searchCatalog(catalog, '');
    expect(hits[0].curated).toBe(true);
  });
  it('does not throw on entries missing name or slug', () => {
    const messy = [{ description: 'no name no slug', category: 'x' }, { slug: 'ok', name: 'ok', description: 'fine' }];
    expect(() => searchCatalog(messy, 'fine')).not.toThrow();
    expect(searchCatalog(messy, 'fine').map((e) => e.slug)).toEqual(['ok']);
  });
});

describe('bundled catalog integrity', () => {
  it('every curated entry is well-formed and resolvable', () => {
    for (const e of BUNDLED_CATALOG) {
      expect(e.slug, `slug for ${e.name}`).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
      expect(e.name, `name for ${e.slug}`).toBeTruthy();
      expect(e.description, `description for ${e.slug}`).toBeTruthy();
      expect(e.url, `url for ${e.slug}`).toBeTruthy();
      const src = resolveSkillSource(e);
      // a curated entry must never degrade to a dead "guide" — it resolves to a
      // bootstrap command or to concrete fetch candidates.
      expect(['bootstrap', 'fetch'], `${e.slug} resolves`).toContain(src.kind);
      if (src.kind === 'fetch') {
        expect(src.candidates.length, `${e.slug} candidates`).toBeGreaterThan(0);
        for (const c of src.candidates) expect(c).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
      }
      if (src.kind === 'bootstrap') expect(src.command).toBeTruthy();
    }
  });
  it('has unique slugs', () => {
    const slugs = BUNDLED_CATALOG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('mergeCatalog', () => {
  it('lets curated entries override live ones on slug collision', () => {
    const curated = [{ slug: 'docx', name: 'docx', curated: true, install: 'repo-path' }];
    const live = [{ slug: 'docx', name: 'docx-live', curated: false }, { slug: 'other', curated: false }];
    const merged = mergeCatalog(curated, live);
    const docx = merged.find((e) => e.slug === 'docx');
    expect(docx.curated).toBe(true);
    expect(merged.map((e) => e.slug).sort()).toEqual(['docx', 'other']);
  });
});

describe('validateSkillBody', () => {
  it('accepts a real SKILL.md with frontmatter + name', () => {
    const v = validateSkillBody('---\nname: foo\ndescription: bar\n---\n\nbody');
    expect(v.ok).toBe(true);
    expect(v.frontmatter.name).toBe('foo');
  });
  it('rejects HTML pages', () => {
    expect(validateSkillBody('<!DOCTYPE html><html>...').ok).toBe(false);
  });
  it('rejects bodies without frontmatter name', () => {
    expect(validateSkillBody('# Just a heading, no frontmatter').ok).toBe(false);
  });
  it('rejects empty bodies', () => {
    expect(validateSkillBody('').ok).toBe(false);
    expect(validateSkillBody(null).ok).toBe(false);
  });
});

describe('installSkill (effectful, mocked fetch)', () => {
  let claudeHome;
  let prevHome;
  let claudenvHome;

  beforeEach(async () => {
    claudeHome = await mkdtemp(join(tmpdir(), 'claudenv-claude-'));
    claudenvHome = await mkdtemp(join(tmpdir(), 'claudenv-state-'));
    prevHome = process.env.CLAUDENV_HOME;
    process.env.CLAUDENV_HOME = claudenvHome;
  });
  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    await rm(claudeHome, { recursive: true, force: true });
    await rm(claudenvHome, { recursive: true, force: true });
  });

  const SKILL_BODY = '---\nname: docx\ndescription: word docs\n---\n\nHello';
  const entry = { slug: 'docx', name: 'docx', url: 'https://github.com/anthropics/skills/tree/main/skills/docx', install: 'repo-path', curated: true };
  const rawUrl = 'https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md';

  it('fetches, validates, and writes SKILL.md', async () => {
    const res = await installSkill(entry, { fetchImpl: mockFetch({ [rawUrl]: SKILL_BODY }), claudeHome });
    expect(res.action).toBe('installed');
    const written = await readFile(join(claudeHome, 'skills', 'docx', 'SKILL.md'), 'utf-8');
    expect(written).toBe(SKILL_BODY);
  });

  it('refuses to overwrite without force', async () => {
    const fetchImpl = mockFetch({ [rawUrl]: SKILL_BODY });
    await installSkill(entry, { fetchImpl, claudeHome });
    const again = await installSkill(entry, { fetchImpl, claudeHome });
    expect(again.action).toBe('exists');
  });

  it('overwrites with force', async () => {
    const fetchImpl = mockFetch({ [rawUrl]: SKILL_BODY });
    await installSkill(entry, { fetchImpl, claudeHome });
    const forced = await installSkill(entry, { fetchImpl, claudeHome, force: true });
    expect(forced.action).toBe('installed');
  });

  it('degrades to guide when no candidate resolves', async () => {
    const res = await installSkill(entry, { fetchImpl: mockFetch({}), claudeHome });
    expect(res.action).toBe('guide');
  });

  it('rejects an HTML response as invalid (no file written)', async () => {
    const res = await installSkill(entry, { fetchImpl: mockFetch({ [rawUrl]: '<!DOCTYPE html><html></html>' }), claudeHome });
    expect(res.action).toBe('invalid');
  });

  it('returns a bootstrap result for kimi-webbridge (does not run it)', async () => {
    const kimi = BUNDLED_CATALOG.find((e) => e.slug === 'kimi-webbridge');
    const res = await installSkill(kimi, { fetchImpl: mockFetch({}), claudeHome });
    expect(res.action).toBe('bootstrap');
    expect(res.command).toContain('install.sh');
  });

  it('returns guide for non-fetchable entries', async () => {
    const res = await installSkill({ slug: 'agents', name: 'Agents', url: 'https://septimlabs.com/x', install: 'guide' }, { fetchImpl: mockFetch({}), claudeHome });
    expect(res.action).toBe('guide');
  });

  it('rejects an unsafe slug', async () => {
    await expect(
      installSkill({ slug: '../evil', name: 'evil', url: 'x' }, { fetchImpl: mockFetch({}), claudeHome })
    ).rejects.toThrow(/invalid skill slug/);
  });

  it('TRUST GATE: a live (non-curated) entry is not fetched/written without confirmLive', async () => {
    const live = { slug: 'docx', name: 'docx', url: entry.url, install: 'repo-path', curated: false };
    const fetchImpl = mockFetch({ [rawUrl]: SKILL_BODY });
    const res = await installSkill(live, { fetchImpl, claudeHome });
    expect(res.action).toBe('needs-confirm');
    expect(existsSync(join(claudeHome, 'skills', 'docx', 'SKILL.md'))).toBe(false);
  });

  it('TRUST GATE: confirmLive lets a live entry install', async () => {
    const live = { slug: 'docx', name: 'docx', url: entry.url, install: 'repo-path', curated: false };
    const res = await installSkill(live, { fetchImpl: mockFetch({ [rawUrl]: SKILL_BODY }), claudeHome, confirmLive: true });
    expect(res.action).toBe('installed');
  });

  it('tries later candidates when the first 404s (repo-root)', async () => {
    const rootEntry = { slug: 'bar', name: 'bar', url: 'https://github.com/foo/bar', install: 'repo-root', curated: true };
    const second = 'https://raw.githubusercontent.com/foo/bar/main/skills/bar/SKILL.md';
    const fetchImpl = mockFetch({
      'https://raw.githubusercontent.com/foo/bar/main/SKILL.md': null, // 404
      [second]: '---\nname: bar\ndescription: b\n---\nx',
    });
    const res = await installSkill(rootEntry, { fetchImpl, claudeHome });
    expect(res.action).toBe('installed');
    expect(res.source).toBe(second);
  });

  it('writes NO file when the fetched body is invalid', async () => {
    const res = await installSkill(entry, { fetchImpl: mockFetch({ [rawUrl]: '<!DOCTYPE html>' }), claudeHome });
    expect(res.action).toBe('invalid');
    expect(existsSync(join(claudeHome, 'skills', 'docx'))).toBe(false);
  });

  it('installs an entry synthesized from a raw URL (with confirmLive)', async () => {
    const e = makeEntryFromUrl('https://github.com/anthropics/skills/tree/main/skills/docx');
    expect(e.curated).toBe(false);
    expect(e.install).toBe('repo-path');
    expect(e.slug).toBe('docx');
    const res = await installSkill(e, { fetchImpl: mockFetch({ [rawUrl]: SKILL_BODY }), claudeHome, confirmLive: true });
    expect(res.action).toBe('installed');
  });
});

describe('listInstalledSkills', () => {
  it('lists skill dirs and reads frontmatter', async () => {
    const claudeHome = await mkdtemp(join(tmpdir(), 'claudenv-claude-'));
    await mkdir(join(claudeHome, 'skills', 'foo'), { recursive: true });
    await writeFile(join(claudeHome, 'skills', 'foo', 'SKILL.md'), '---\nname: foo\ndescription: a foo\n---\nbody');
    await mkdir(join(claudeHome, 'skills', 'bare'), { recursive: true }); // no SKILL.md
    const list = await listInstalledSkills(claudeHome);
    const foo = list.find((s) => s.slug === 'foo');
    const bare = list.find((s) => s.slug === 'bare');
    expect(foo.hasSkillMd).toBe(true);
    expect(foo.description).toBe('a foo');
    expect(bare.hasSkillMd).toBe(false);
    await rm(claudeHome, { recursive: true, force: true });
  });
  it('returns [] when skills dir is absent', async () => {
    expect(await listInstalledSkills(join(tmpdir(), 'definitely-not-here-xyz'))).toEqual([]);
  });
});

describe('loadCatalog + findEntry (offline)', () => {
  let prevHome;
  let claudenvHome;
  beforeEach(async () => {
    claudenvHome = await mkdtemp(join(tmpdir(), 'claudenv-state-'));
    prevHome = process.env.CLAUDENV_HOME;
    process.env.CLAUDENV_HOME = claudenvHome;
  });
  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    await rm(claudenvHome, { recursive: true, force: true });
  });

  it('returns the curated catalog with no network and no cache', async () => {
    const catalog = await loadCatalog({ fetchImpl: async () => { throw new Error('no net'); } });
    expect(catalog.length).toBe(BUNDLED_CATALOG.length);
    expect(catalog.every((e) => e.curated)).toBe(true);
  });

  it('findEntry resolves by slug and by name', async () => {
    const catalog = await loadCatalog({});
    expect(findEntry(catalog, 'docx').slug).toBe('docx');
    expect(findEntry(catalog, 'Kimi WebBridge').slug).toBe('kimi-webbridge');
    expect(findEntry(catalog, 'does-not-exist')).toBeNull();
  });

  it('refresh:true fetches the README, caches it, and merges live entries', async () => {
    const readmeUrl = 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/README.md';
    const fetchImpl = mockFetch({ [readmeUrl]: README_FIXTURE });
    const catalog = await loadCatalog({ fetchImpl, refresh: true });
    // a live-only entry from the fixture shows up alongside curated ones
    expect(catalog.some((e) => e.slug === 'playwright-skill')).toBe(true);
    // and it was cached: a subsequent non-refresh load still sees it
    const cached = await loadCatalog({});
    expect(cached.some((e) => e.slug === 'playwright-skill')).toBe(true);
  });

  it('refreshCatalog persists entries and returns them', async () => {
    const readmeUrl = 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/README.md';
    const entries = await refreshCatalog(mockFetch({ [readmeUrl]: README_FIXTURE }));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.curated === false)).toBe(true);
  });

  it('refresh failure falls back to the cache (still returns curated)', async () => {
    const throwing = async () => { throw new Error('offline'); };
    const catalog = await loadCatalog({ fetchImpl: throwing, refresh: true });
    expect(catalog.length).toBe(BUNDLED_CATALOG.length); // curated survive even when refresh fails with empty cache
  });
});
