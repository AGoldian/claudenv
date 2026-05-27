---
description: Подавить vibe-decisions overview на следующий ответ — просто пиши код без brief overview
allowed-tools: 
argument-hint: 
---

# /just-code — Подавить vibe overview одноразово

Эффект на ОДИН следующий ответ:

- vibe-decisions skill НЕ выдаёт brief overview / auto-log block
- Просто пишет код для текущей задачи
- Decision файл НЕ создаётся для этого ответа
- На ответ после следующего поведение возвращается к дефолту

## В AUTO-LOG mode (loop)

В loop эта команда фактически no-op для большинства случаев — auto-log не паузит, а просто логирует. `/just-code` пропускает логирование на один шаг. Это полезно когда выбор тривиален но vibe-decisions всё равно зажёгся.

## В INTERACTIVE mode

Пропускает паузу на следующем шаге. Используй когда явно знаешь что хочешь, без нужды в overview.

## После использования

Не нужно ничего откатывать — действие истекает само через один turn. Если хочешь надолго отключить vibe-decisions — отредактируй его SKILL.md trigger criteria.
