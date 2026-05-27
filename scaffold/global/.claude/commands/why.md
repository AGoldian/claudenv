---
description: Объяснить технологию или подход в контексте текущей задачи — без принятия решения и без записи в decisions/
allowed-tools: Read, Glob, Grep, WebSearch, WebFetch, Bash(claudenv:*)
argument-hint: <technology-or-question>
---

# /why — Краткое объяснение

Объяснить `$ARGUMENTS` в контексте текущей задачи. Не вызывает vibe-decisions, не пишет в `~/.claudenv/memories/decisions/`.

## Step 1 — Check canon first

Run `claudenv canon search "$ARGUMENTS"` (Bash). If matches found — упомяни их как primary references.

## Step 2 — Brief explanation (3-5 lines)

Структура:

- **Что это:** 1 строка
- **Когда используется:** 1-2 строки
- **Когда не подходит:** 1 строка
- **Ссылки (опционально):** канон или WebSearch если канон пуст

## Не делать

- Не выводи vibe-decisions overview format (это explainer, не decision)
- Не пиши файл в decisions/
- Если пользователь после `/why` начинает реальный выбор технологии — тогда уже триггерится vibe-decisions skill

## Style

- User's language
- Краткость > полнота. Для полноты есть `/deeper` после реального decision.
