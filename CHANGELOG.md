# Changelog

## 1.3.2 — Self-extending harness

Claude becomes self-aware of the claudenv harness and can autonomously extend
it: introspect what it already has, find what's missing for the task, equip it
from the [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills)
registry, wire connectors/MCP/memory, and bootstrap browser automation. All new
surface is additive over 1.3.1.

### Added

- **`harness` skill** (`scaffold/global/.claude/skills/harness/SKILL.md`) + **`/harness`** command — the behavioral core. Teaches Claude the flow: introspect (`claudenv capabilities`) → gap-analysis → discover (`claudenv skills search`) → equip (`claudenv skills add`) → configure connectors/MCP/memory → bootstrap kimi-webbridge. Two modes: pause-and-propose in interactive Claude Code, no-pause (curated-only) inside `claudenv loop`.
- **`claudenv skills` CLI** (`src/skills-registry.js`, `src/bundled-catalog.js`): `search`, `list`, `info`, `add`, `refresh`. Installs skills from the awesome-claude-skills registry. The registry is a heterogeneous markdown README, so each entry is resolved by **install class** — `repo-path` / `in-repo` / `repo-root` (best-effort) / `bootstrap` / `guide` — verified against live raw.githubusercontent.com endpoints. Offline-first: a curated **bundled catalog** ships with claudenv so search/add work with no network; the live registry is parsed + cached on `--refresh`.
- **`claudenv capabilities`** (alias `caps`; `src/capabilities.js`) — structured self-introspection map: installed skills, CLI surface, memory + active workspace + connectors, kimi-webbridge daemon status, project MCP servers, registry size. `--json` for machine consumption. This is the "connect to claudenv, understand it" entry point.
- **kimi-webbridge** is a first-class curated entry — `claudenv skills add kimi-webbridge` detects an existing install and starts the daemon, or surfaces the official `install.sh` bootstrap (runs it with `--yes`). `capabilities`/`doctor` report its health. So browser automation "works even if it isn't there yet."
- **Loop integration** — `claudenv loop` appends a `Harness mode (loop)` fragment (`src/memory-context.js`) so the loop may self-equip a missing capability mid-run instead of doing tooling-shaped work by hand.
- **Doctor checks** — harness skill installed + kimi-webbridge status.

### Security

- **Trust boundary — gated in code, not just docs.** A fetched `SKILL.md` is auto-loaded, model-facing instruction text — a prompt-injection surface. Curated (bundled) entries have a **vetted source URL + classification** (the bytes are still fetched live at add-time, not content-pinned), so they're the only entries allowed to auto-equip. Live (README-parsed or URL) entries are gated: `installSkill` returns `needs-confirm` and writes nothing unless `confirmLive` is passed (`claudenv skills add … --yes`). `claudenv loop` never passes `--yes`, and the loop fragment instructs the model never to use it for live skills — so live installs are default-safe in headless runs.
- `skills add` writes **only** under `~/.claude/skills/<slug>/SKILL.md`, refuses to overwrite without `--force`, validates the fetched body (frontmatter + `name`, ≤256KB, not an HTML page), and **never executes** fetched content. Bootstrap installers are printed first and run only with explicit `--yes`. Install-by-raw-URL is supported (always treated as live).

### CI / Security tooling

- **gitleaks secret scanning** (`.github/workflows/gitleaks.yml` + `.gitleaks.toml`) — runs on every push and PR, scanning full git history and failing the build if a credential is committed. The allowlist covers claudenv's intentional non-secrets (test fixtures with `FAKE-…` values, example credential shapes in docs/skills, env-var references), so the signal stays real. Enforces claudenv's own "secrets only in `.env.local`" discipline at the CI level.

### Also in this release — Dynamic workflows

- **`dynamic-workflows` skill** (`scaffold/.claude/skills/dynamic-workflows/`) — teaches Claude *when* and *how* to use the built-in **Workflow** tool for deterministic multi-agent orchestration (fan-out, pipelines, adversarial-verify, multi-file migrations) and *when not to* (single-file or sequential work, where one or two `Agent` calls suffice). Installed into projects by `/claudenv` (Phase 4). Two modes: pause-and-propose in interactive Claude Code, no-pause in `claudenv loop`.
- **Loop integration** — `claudenv loop` now drives the Workflow tool from two layers: a static `Dynamic-workflows mode (loop)` fragment in the system prompt (`src/memory-context.js`) that sets no-pause loop mode, **plus** a guarded `Parallel decomposition (dynamic workflow)` directive injected into the execution prompt itself (`buildExecutionPrompt` in `src/loop.js`). The directive lives in the user prompt on purpose — the Workflow tool's opt-in keys on the user message, so a system-prompt fragment alone does not trigger it (measured: three headless runs stayed single-threaded). The directive fires only when the picked plan item decomposes into **3+ independent sub-tasks**, with a hard fan-out cap (cost ~15× single-threaded, runs under the per-iteration budget), and degrades to parallel `Agent` calls if the Workflow runtime is unavailable. **Verified:** with the directive in place, a wide six-module audit task invoked the Workflow tool under headless `claude -p`; trivial/sequential items correctly stay single-threaded.

### Files & tests

- New: `src/skills-registry.js`, `src/bundled-catalog.js`, `src/capabilities.js`, `src/kimi.js`, harness skill + command, `test/skills-registry.test.js`, `test/capabilities.test.js`.
- Network stays out of tests (injectable `fetchImpl`, README fixture). Full suite **244 tests passing**.

## 1.3.0 — Cross-session memory & vibe-decisions

Bridge release between the existing Node.js installer and the planned 2.0 rewrite on Claude Agent SDK (Python). Existing 1.2.5 behavior is preserved; new surface is additive.

### Added

- **Split memory layout** — global `~/.claudenv/memories/{decisions,canon,user}/` (cross-project) + per-project `.claude/memories/{project,decisions}/` (committed)
- **`vibe-decisions` skill** (`scaffold/global/.claude/skills/vibe-decisions/`) — brief overview before non-trivial technical choices, with two modes:
  - **auto-log** inside `claudenv loop` (no pauses — preserves `autonomy=law`)
  - **pause-and-ask** in interactive Claude Code chat
  - Mode is selected by a directive fragment that `loop` injects via `--append-system-prompt`, not by env variables
- **Slash-commands**: `/deeper`, `/why`, `/decisions`, `/canon`, `/just-code` (in `scaffold/global/.claude/commands/`)
- **New CLI commands**:
  - `claudenv memory init|index|show|edit`
  - `claudenv decisions list|show|search|archive`
  - `claudenv canon add|list|search|prune`
  - `claudenv doctor` (health check)
  - `claudenv hook <name>` (internal dispatcher for Claude Code hooks)
- **Hooks** registered in generated `settings.json`:
  - PostToolUse on `Write` → `decisions-logger` (validates frontmatter, marks INDEX dirty, never rewrites paths)
  - SessionEnd → `regen-index` (rebuilds INDEX.md from decisions)
- **Loop integration** — `claudenv loop` now appends a memory briefing (INDEX.md) and the vibe-decisions auto-log fragment to the system prompt; regenerates INDEX.md after every iteration as a SessionEnd fallback
- **Python companion package `claudenv-memory` 0.1.0** (alpha) — `LocalFileMemoryBackend` subclassing `BetaAbstractMemoryTool` for users building on Claude Agent SDK. Lives in `python/`, published independently on PyPI

### Changed

- `installGlobal()` now also seeds `~/.claudenv/` from `scaffold/global-claudenv/` (INDEX.md, canon, user prefs example, .gitignore, config.yaml). Test signature now accepts both `claudeHome` and `claudenvHome` overrides
- `uninstallGlobal()` preserves `~/.claudenv/memories/` (user data) and now also removes the new slash-commands + vibe-decisions skill
- `generateSettingsJson()` accepts an optional `claudenvCmd` (`'claudenv'` vs `'npx claudenv'`) so hooks work whether claudenv is global-installed or invoked via npx
- `claudenv loop` `--append-system-prompt` now composes three fragments: autonomy directive, vibe-decisions loop fragment, INDEX.md briefing (in that order)

### Files & tests

- 13 new source files in `src/` (memory, decisions, canon, doctor, memory-context, memory-paths, hooks/dispatcher, hooks/decisions-logger, hooks/regen-index, …)
- 7 new test files covering memory CLI, decisions CLI, canon CLI, doctor, hooks, memory-context — full suite at **160 tests passing**
- New Python package in `python/` with paths & backend tests + smoke example
- New GitHub Action `.github/workflows/python.yml` running pytest + smoke on PRs touching `python/`

### Not in 1.3.0 (deferred)

- Cross-device git sync, age encryption — planned for 1.4
- `claudenv loop` rewrite on Python+SDK, subagent isolation, `cache_guard` PreToolUse hook — planned for 2.0 (see `claudenv-update-plan.md`)

## 1.2.5 and earlier

See git log for release notes prior to 1.3.0.
