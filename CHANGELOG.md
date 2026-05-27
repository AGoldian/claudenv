# Changelog

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
