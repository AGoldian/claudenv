---
description: Показать или добавить ссылки в личный канон (~/.claudenv/memories/canon/index.yaml)
allowed-tools: Bash(claudenv:*), Read
argument-hint: [list [<topic>]|search <query>|add <topic> <url> --why "<reason>"]
---

# /canon — Личный канон ссылок

Wrapper над `claudenv canon` CLI.

## Routing

Разбери `$ARGUMENTS`:

- пусто или `list` → `claudenv canon list`
- `list <topic>` → `claudenv canon list <topic>`
- `search <query>` → `claudenv canon search "<query>"`
- `add <topic> <url> --why "<reason>"` → `claudenv canon add <topic> <url> --why "<reason>"`
- иначе если выглядит как topic slug → `claudenv canon list <slug>`
- иначе → `claudenv canon search "$ARGUMENTS"`

## Output

Печатай stdout как есть. На non-zero exit code покажи stderr и подскажи usage.

## Когда канон пуст

Если `claudenv canon list` ничего не вернул:

```
Канон пока пуст. Добавь первые записи когда будешь делать /deeper —
после deep dive предложу `claudenv canon add <topic> <url> --why "..."`.
```
