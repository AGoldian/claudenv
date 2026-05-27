---
description: Показать или найти принятые vibe-decisions (последние N, по slug, или по поисковому запросу)
allowed-tools: Bash(claudenv:*), Read
argument-hint: [list|show <id>|search <query>] [--limit N] [--scope global|project|all]
---

# /decisions — Список и поиск принятых решений

Wrapper над `claudenv decisions` CLI. Запускается из Bash, результат показывается пользователю как есть.

## Routing

Разбери `$ARGUMENTS`:

- пусто или `list` → `claudenv decisions list --limit 10`
- `list --limit N` → `claudenv decisions list --limit N`
- `list --scope <s>` → `claudenv decisions list --scope <s>`
- `show <id>` → `claudenv decisions show <id>`
- `search <query>` → `claudenv decisions search "<query>"`
- иначе если выглядит как id или slug → `claudenv decisions show "$ARGUMENTS"`
- иначе → `claudenv decisions search "$ARGUMENTS"`

## Output

Печатай stdout команды без редактирования. Если команда вернула non-zero exit code — покажи stderr пользователю и предложи `claudenv decisions list` для проверки доступных id.

## Если `claudenv` не на PATH

Подскажи: `npm i -g claudenv` или `npx claudenv decisions list`.
