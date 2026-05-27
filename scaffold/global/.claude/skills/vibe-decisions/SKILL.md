---
name: vibe-decisions
description: |
  Trigger before writing code that involves a non-trivial technical
  choice (library, algorithm, data structure, architecture pattern,
  sync vs async, correctness vs performance). Output a brief overview
  with concrete trade-offs and 1-2 alternatives, then log the decision.
  Two modes: auto-log (no pauses) inside `claudenv loop`, pause-and-ask
  in interactive Claude Code. Also triggers on: "почему X?", "X vs Y?",
  "/why", "/deeper", "/decisions", "alternatives?", "trade-offs?".
  Do NOT trigger for trivial syntax, naming, or formatting choices.
---

# Vibe decisions

## Mode detection (FIRST step every time)

Check the system prompt for the marker `Vibe-decisions mode (loop)`.

- **Marker present** → AUTO-LOG mode. Pick the approach, write the decision file, continue. NEVER pause. NEVER ask "делать так?". This is `claudenv loop` and pause violates autonomy=law.
- **Marker absent** → INTERACTIVE mode. Output brief overview, wait for user confirmation or `/deeper`.

Both modes share the same trigger criteria, file format, and slash-command behavior. Only output shape and pause behavior differ.

## Trigger criteria

Trigger if the decision involves:

- choosing a library or framework from 2+ viable options
- choosing an algorithm or data structure with meaningful trade-offs
- architecture pattern (sync/async, push/pull, where state lives, monolith/services)
- correctness vs performance vs simplicity trade-off
- anything where reasonable engineers would disagree

DO NOT trigger for:

- syntax-level choices in a single language (for vs map, ternary vs if)
- obvious choices (JSON for a config file, regex for simple pattern)
- pure refactoring within established patterns
- when the user typed `/just-code` in the previous turn

## Step 1 — Check memory before deciding

Before writing brief or auto-log, read related precedents:

- `view` `/memories/decisions/` — list files; if any topic looks related, read it
- Mention the precedent briefly: "Раньше для X выбирали Y (см. <file>)"

## Step 2A — AUTO-LOG mode output (inside `claudenv loop`)

Output exactly this shape in the user's language, then continue with code in the same turn:

```
**Выбрано:** <approach>
**Почему:** <one sentence>
**Альтернативы:** <A> — <terse trade-off>; <B> — <terse trade-off>
**Лог:** /memories/decisions/<YYYY-MM-DD>-<topic-slug>.md (scope: <global|project>)
```

Immediately after the block, use the Write tool to create the decision file (see Step 4 for format). Then proceed with the actual code. Do NOT pause.

## Step 2B — INTERACTIVE mode output (no loop)

Output this shape and STOP. Wait for the user.

```
**Подход:** <approach>
**Почему для этой задачи:** <1-2 lines, concrete to the task>
**Минусы:** <1-2 lines, concrete to the task>
**Альтернативы:** <A> — <one sentence>; <B> — <one sentence>
```

Then ask: "Делать так, или разобрать варианты подробнее?"

DO NOT proceed with code until the user confirms OR asks for deep dive.

## Step 3 — Deep dive (on `/deeper` or "расскажи подробнее")

Expand the most recent decision into:

1. **Концептуально** — what it is and the problem it solves (3-5 lines)
2. **Как работает** — simplified model (5-10 lines, optionally a code sketch)
3. **2-3 варианта реализации** — for each: code + 1-2 lines of trade-offs
4. **Канон** — 2-4 references. First check `~/.claudenv/memories/canon/index.yaml` for a topic match. If a match exists — cite those. If not — WebSearch for authoritative sources and after the response suggest `claudenv canon add <topic> <url> --why "..."`.

After deep dive, in auto-log mode update the existing decision file's `deep_dive_done: yes` field. In interactive mode wait for confirmation.

## Step 4 — Write the decision file

Path:

- `scope: global` (default) → `~/.claudenv/memories/decisions/<YYYY-MM-DD>-<topic-slug>.md`
- `scope: project` → `<cwd>/.claude/memories/decisions/<YYYY-MM-DD>-<topic-slug>.md`

**Choose scope BEFORE writing — don't rely on hook to rewrite.** Project scope if the choice mentions project-only artifacts (module name, env var, deployment target, internal service). Otherwise global.

File content:

```
---
date: <ISO 8601 datetime with timezone>
project: <basename of cwd, or "(none)" if no project context>
topic: <plain-language summary of what was decided>
chose: <approach>
alternatives_considered: [<A>, <B>]
reason: <one sentence why>
deep_dive_done: <yes|no>
sources_consulted: [<canon-id-or-url>, ...]
scope: <global|project>
---

<optional body — caveats, follow-ups, links>

__VIBE_DECISION__
```

The `__VIBE_DECISION__` marker on the last line lets the `decisions-logger` hook detect the file even if the path check fails. Always include it.

## Slash-commands the skill responds to

- `/why <X>` — explain X briefly without committing a decision; do NOT write a decision file
- `/deeper` — deep dive on the most recent decision (Step 3)
- `/decisions [N]` — execute Bash `claudenv decisions list --limit ${N:-10}` and show output
- `/canon [<topic>]` — execute Bash `claudenv canon list <topic>` and show output
- `/just-code` — suppress vibe-decisions on the NEXT response only; resume on the one after

Trigger phrases that also count (in any language): "расскажи подробнее", "почему именно X?", "X vs Y?", "alternatives?", "trade-offs?".
