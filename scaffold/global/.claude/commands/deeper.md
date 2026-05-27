---
description: Развернуть последнее принятое решение в подробное объяснение (deep dive — концепт, варианты, канон)
allowed-tools: Read, Glob, Grep, WebSearch, WebFetch, Bash(claudenv:*), Bash(ls:*), Write, Edit
argument-hint: [topic-or-decision-id]
---

# /deeper — Подробное объяснение последнего решения

Развернуть последнее (или указанное в `$ARGUMENTS`) принятое vibe-decision в полный формат.

## Step 1 — Find the target decision

If `$ARGUMENTS` is empty:

1. Run `claudenv decisions list --limit 1` (Bash) — get the most recent decision id
2. Run `claudenv decisions show <id>` to load its frontmatter

If `$ARGUMENTS` is a topic slug or id:

1. Run `claudenv decisions show $ARGUMENTS` to load it
2. If not found — fall back to `claudenv decisions search "$ARGUMENTS"` and pick the top match

If nothing matches:

```
Не нашёл недавнего решения. Сначала сделай нетривиальный выбор — vibe-decisions залогирует его. Потом вызови /deeper.
```

Stop here.

## Step 2 — Expand into the deep dive format

Follow `~/.claude/skills/vibe-decisions/deep-dive-template.md` exactly:

1. **Концептуально** (3-5 lines) — what it is, what problem it solves, name 1-2 alternatives
2. **Как работает** (5-10 lines, optional code sketch) — simplified model + key invariants
3. **2-3 варианта реализации** — for each: code sketch + when-suits / when-doesn't
4. **Канон** — 2-4 references, **first** from `~/.claudenv/memories/canon/index.yaml` by topic; if no match, WebSearch and propose `claudenv canon add` afterward

## Step 3 — Update the decision file

Edit the original decision file to set:

```yaml
deep_dive_done: yes
sources_consulted: [<urls and canon ids you cited>]
```

Preserve the `__VIBE_DECISION__` marker on the last line.

## Style

- User's language
- Concrete to the actual task, not generic textbook
- If a sketch is shorter than prose — use the sketch
