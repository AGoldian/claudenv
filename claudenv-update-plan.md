# claudenv 2.0 — план обновления

> Версия плана: 1.0 · Дата: 27 мая 2026 · Целевой релиз: claudenv 2.0

Три фокуса обновления:

1. **Cross-session agent memory** — память между сессиями, синхронизация между устройствами, опора на Anthropic memory tool и `/memories` директорию
2. **Harness на Claude Agent SDK** — переход на официальный SDK, prompt-cache discipline, hooks, subagents
3. **Vibelearning** — режим информированного кодинга: brief overview перед нетривиальным решением, deep dive по запросу, личный канон

Всё это собирается из официальных примитивов: Agent SDK (Python/TS), memory tool с beta header `context-management-2025-06-27`, универсальный SKILL.md формат, prompt caching через `cache_control`.

---

## Содержание

1. [Принципы](#принципы)
2. [Архитектура верхнего уровня](#архитектура-верхнего-уровня)
3. [Структура репозитория](#структура-репозитория)
4. [Часть 1: Cross-session memory](#часть-1-cross-session-memory)
5. [Часть 2: Harness на Claude Agent SDK](#часть-2-harness-на-claude-agent-sdk)
6. [Часть 3: Vibelearning](#часть-3-vibelearning)
7. [Cross-device синхронизация](#cross-device-синхронизация)
8. [Фазы релиза](#фазы-релиза)
9. [Риски и mitigation](#риски-и-mitigation)
10. [Открытые вопросы](#открытые-вопросы)

---

## Принципы

- **Универсальный SKILL.md формат** для всего что генерируется — портабельно между Claude Code, Cursor, Gemini CLI, Codex CLI
- **Plain files everywhere** — никаких баз, никаких векторных стораджей в дефолте. Git + markdown + YAML
- **Прогрессивное раскрытие контекста** — корневой CLAUDE.md под 100 строк, всё остальное on-demand
- **Cache stability как первый класс** — все промпты, скиллы и тулы оформляются так чтобы prefix оставался стабильным
- **Personal tool, не platform** — это инструмент для одного разработчика. Никаких метрик retention, никаких curriculum tracks, никаких exercise runners
- **Минимум абстракций** — обёртки только там где Anthropic API меняется чаще claudenv. SDK напрямую везде где можно

---

## Архитектура верхнего уровня

```
┌──────────────────────────────────────────────────────────────────┐
│                       claudenv CLI                                │
│  init · sync · canon · decisions · session · doctor               │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │  Agent runtime (Claude  │
                │  Agent SDK, ClaudeSDK   │
                │  Client with session)   │
                └────────────┬────────────┘
                             │
   ┌────────────┬────────────┼────────────┬────────────┬────────────┐
   ▼            ▼            ▼            ▼            ▼            ▼
 Skills      Hooks       Subagents     Memory      Prompt        Custom
 (.claude/   (Pre/Post   (planner,     tool        cache         tools
  skills/)   ToolUse,    critic,       (file       discipline    (MCP)
             Session     researcher)   backend                
             Start/End)                under
                                       /memories)
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
       ~/.claudenv/                .git remote + age
       (local state)               (cross-device sync)
```

**Что куда ложится:**

- Claude Agent SDK даёт agent loop, tool execution, subagent isolation, hooks, MCP integration. Это runtime.
- Memory tool (client-side filesystem операции через beta header) даёт persistent state между сессиями
- Skills (universal SKILL.md формат) дают переиспользуемое поведение, в том числе vibelearning
- Hooks — точки автоматизации (запись решений, проверка cache stability, гарантия sandboxing)
- Subagents — изоляция контекста для долгих исследований без загрязнения главной сессии

---

## Структура репозитория

```
claudenv/
├── pyproject.toml                  # SDK >= 0.2.x
├── claudenv/                       # Python package
│   ├── __init__.py
│   ├── cli.py                      # argparse / click CLI
│   ├── runtime.py                  # ClaudeSDKClient wiring
│   ├── memory/
│   │   ├── backend.py              # BetaAbstractMemoryTool subclass
│   │   ├── encryption.py           # age wrapper для sync
│   │   └── schema.py               # dataclasses для memory layout
│   ├── hooks/
│   │   ├── decisions_logger.py     # PostToolUse → memories/decisions/
│   │   ├── cache_guard.py          # PreToolUse → cache stability
│   │   └── session_brief.py        # SessionStart → decisions briefing
│   ├── subagents/
│   │   ├── planner.py
│   │   ├── critic.py
│   │   └── researcher.py
│   └── sync/
│       ├── git_sync.py
│       └── conflict.py
├── templates/                      # шаблоны которые claudenv init разворачивает
│   ├── .claude/
│   │   ├── settings.json
│   │   ├── agents/
│   │   ├── skills/
│   │   │   └── vibe-decisions/
│   │   │       ├── SKILL.md
│   │   │       └── deep-dive-template.md
│   │   └── hooks/
│   ├── CLAUDE.md                   # < 100 строк, Tier-1 правила
│   └── .gitignore
├── docs/
│   ├── memory-model.md
│   ├── vibe-decisions.md
│   ├── sync.md
│   └── adr/                        # ADR claudenv'а самого
└── tests/
```

`~/.claudenv/` (пользовательский, не репо):

```
~/.claudenv/
├── memories/                       # backend для memory tool, синкается
│   ├── decisions/                  # один файл на принятое решение
│   ├── projects/                   # per-project facts
│   └── user/                       # cross-project preferences
├── canon/                          # личный канон
│   ├── index.yaml
│   └── notes/                      # cached articles
├── sessions/                       # session_id транскрипты, gitignored
├── skills/                         # personal skills, синкается
├── config.yaml                     # model, sandbox, sync settings
└── keys/                           # age recipients (синк), privates (не синк)
```

---

## Часть 1: Cross-session memory

### Дизайн

Память живёт в `~/.claudenv/memories/` и эксплуатируется через **Anthropic memory tool** — официальный механизм где Claude делает tool calls (view/create/str_replace/insert/delete/rename) на виртуальной директории `/memories`, а backend исполняет их локально.

Это даёт три вещи:

1. **Persistence без БД** — простые markdown/yaml файлы, всё гитуется
2. **Контроль приватности** — Anthropic не видит содержимое, только tool calls
3. **Совместимость с экосистемой** — тот же mental model что у Claude Managed Agents memory (public beta с 23 апреля 2026)

### Layout `~/.claudenv/memories/`

```
memories/
├── decisions/
│   ├── 2026-05-27-distributed-locks.md
│   ├── 2026-05-25-state-mgmt.md
│   └── ...
├── projects/
│   ├── payments-service.md         # факты о проекте: стек, конвенции, важные urls
│   └── ...
├── user/
│   ├── preferences.md              # editor, package manager, code style
│   └── canon-shortlist.md          # 5-10 ссылок которые точно нужны
└── INDEX.md                        # генерируется hook'ом, краткий справочник
```

### Backend имплементация

Claude Agent SDK ожидает что вы наследуете `BetaAbstractMemoryTool` и реализуете 6 операций. Локальный backend — это просто файловая система с прозрачным mapping `/memories/foo.md` ↔ `~/.claudenv/memories/foo.md`.

```python
# claudenv/memory/backend.py
from anthropic.tools.beta import BetaAbstractMemoryTool
from pathlib import Path

class LocalFileMemoryBackend(BetaAbstractMemoryTool):
    def __init__(self, root: Path = Path.home() / ".claudenv" / "memories"):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def view(self, path: str, view_range=None):
        # маппинг /memories/X → root/X
        real = self.root / path.removeprefix("/memories/")
        if real.is_dir():
            return "\n".join(p.name for p in real.iterdir())
        text = real.read_text()
        if view_range:
            lines = text.splitlines()
            text = "\n".join(lines[view_range[0]-1 : view_range[1]])
        return text

    def create(self, path: str, file_text: str):
        real = self.root / path.removeprefix("/memories/")
        real.parent.mkdir(parents=True, exist_ok=True)
        real.write_text(file_text)

    def str_replace(self, path: str, old_str: str, new_str: str):
        real = self.root / path.removeprefix("/memories/")
        text = real.read_text()
        if text.count(old_str) != 1:
            raise ValueError(f"old_str not unique in {path}")
        real.write_text(text.replace(old_str, new_str))

    def insert(self, path: str, insert_line: int, new_str: str):
        real = self.root / path.removeprefix("/memories/")
        lines = real.read_text().splitlines()
        lines.insert(insert_line, new_str)
        real.write_text("\n".join(lines))

    def delete(self, path: str):
        real = self.root / path.removeprefix("/memories/")
        if real.is_file():
            real.unlink()
        elif real.is_dir():
            import shutil; shutil.rmtree(real)

    def rename(self, old_path: str, new_path: str):
        old = self.root / old_path.removeprefix("/memories/")
        new = self.root / new_path.removeprefix("/memories/")
        new.parent.mkdir(parents=True, exist_ok=True)
        old.rename(new)
```

Beta header передаётся через SDK при инициализации клиента:

```python
# claudenv/runtime.py
from anthropic.tools.beta import betaMemoryTool  # или эквивалент Python
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

options = ClaudeAgentOptions(
    model="claude-opus-4-7",
    extra_headers={"anthropic-beta": "context-management-2025-06-27"},
    tools=[memory_tool(LocalFileMemoryBackend())],
    # ...
)
```

### Что хранится: только то что переживёт сессию

**Decisions** — каждое принятое решение по vibe-decisions hook'у:

```yaml
---
date: 2026-05-27T14:32:00+02:00
project: payments-service
topic: distributed locking for message dedup
chose: redis-setnx
alternatives_considered: [postgres-advisory, etcd]
reason: "low-latency приоритетнее partition safety; нагрузка низкая"
deep_dive_done: no
sources_consulted: []
---

Решено быстро. Если задача станет mission-critical — пересмотреть с учётом Kleppmann critique.
```

**Projects** — стек, нестандартные конвенции, важные урлы:

```markdown
# payments-service

- Stack: Python 3.12, FastAPI, Postgres, Redis, Kafka
- Tests: `pytest -m "not slow"` локально; CI запускает всё
- Package manager: uv (NOT pip, NOT poetry)
- Линтеры: ruff + mypy strict
- Deploy: GitHub Actions → ArgoCD → k8s
- Внутренние ADR: `docs/adr/`
```

**User preferences** — кросс-проектные вещи:

```markdown
# preferences

- Default branch naming: `<initials>/<short-desc>`
- Commit style: conventional commits, lowercase
- Editor: helix
- Не использовать `as` import unless prefix collision
- TypeScript: strict + noUncheckedIndexedAccess
- Python: type hints обязательны, no `Any` без TODO
```

**INDEX.md** — генерируется хуком после каждой сессии. Это compact one-pager (~20-50 строк) который попадает в системный промпт следующей сессии. Содержит: топ-3 свежих решения, активные projects, ключевые preferences. Цель — Claude в новой сессии "вспоминает" контекст без чтения всех файлов.

### Что НЕ хранится

- Транскрипты разговоров (это session log, отдельно, gitignored)
- Промежуточный код / drafts
- Метрики обучения, FSRS state, exercise results — это всё вырезано из дизайна
- Кэш ответов Claude
- Любые секреты в plain text (для них — age, см. sync)

### Hook для записи decisions

```python
# claudenv/hooks/decisions_logger.py
from claude_agent_sdk import HookMatcher, PostToolUseHookInput
from pathlib import Path
import datetime, yaml

async def log_decision(input_data: PostToolUseHookInput, tool_use_id, context):
    """Триггерится когда vibe-decisions skill завершает решение.
    Skill кладёт спец-маркер в ответ; hook парсит и пишет файл."""
    if input_data.tool_name != "Write":
        return {}
    # маркер `__VIBE_DECISION__` в writeup → пишем в /memories/decisions/
    text = input_data.tool_input.get("content", "")
    if "__VIBE_DECISION__" not in text:
        return {}
    # парс YAML frontmatter из text, сохранение
    # ... (см. полную реализацию в claudenv/hooks/decisions_logger.py)
    return {}
```

### Сводка: что нового vs текущий claudenv

| Сейчас | После 2.0 |
|---|---|
| Один CLAUDE.md в репо | CLAUDE.md (< 100 строк) + `/memories/` через memory tool |
| Память теряется между сессиями | Persistent через memory tool, синхронизация git+age |
| Нет места для "почему выбрал X" | `decisions/` логируется автоматически hook'ом |
| Все факты в одном файле | Иерархия: user → projects → decisions, INDEX.md как entry point |

---

## Часть 2: Harness на Claude Agent SDK

### Почему SDK

До 2.0 claudenv опирался на сырые шаблоны и конвенции. SDK — это `agent loop + tool execution + context management + checkpointing` как библиотека. Тот же runtime что у Claude Code. Самим писать loop = техдолг.

> ⚠️ **Внимание к лимитам:** с 15 июня 2026 Agent SDK на subscription планах потребляет отдельный monthly credit. Для personal tool это обычно ок, но в `claudenv doctor` нужна проверка плана.

### Что используется из SDK

**`ClaudeSDKClient`** — для session-based работы (а не одноразовый `query()`). Захватывается `session_id` и в следующем запуске можно `resume=session_id`.

**`ClaudeAgentOptions`** — конфигурация:

```python
from claude_agent_sdk import ClaudeAgentOptions, HookMatcher
from claudenv.memory.backend import LocalFileMemoryBackend
from claudenv.hooks import decisions_logger, cache_guard, session_brief

options = ClaudeAgentOptions(
    model="claude-opus-4-7",
    allowed_tools=["Read", "Write", "Edit", "Bash", "Grep", "Glob",
                   "WebSearch", "WebFetch", "Agent", "AskUserQuestion"],
    setting_sources=["user", "project", "local"],  # подхватить .claude/
    extra_headers={"anthropic-beta": "context-management-2025-06-27"},
    agents={
        "planner": {
            "description": "Decomposes non-trivial tasks into a spec written to memory",
            "prompt": open("claudenv/subagents/planner.md").read(),
            "tools": ["Read", "Grep", "Glob", "WebSearch"],  # без Write/Bash
        },
        "critic": {
            "description": "Reviews recent diff before user sees it",
            "prompt": open("claudenv/subagents/critic.md").read(),
            "tools": ["Read", "Grep", "Bash"],
        },
        "researcher": {
            "description": "Deep-dive into a topic for vibe-decisions",
            "prompt": open("claudenv/subagents/researcher.md").read(),
            "tools": ["WebSearch", "WebFetch", "Read"],
        },
    },
    hooks={
        "PreToolUse": [HookMatcher(matcher=".*", hooks=[cache_guard.check])],
        "PostToolUse": [HookMatcher(matcher="Write", hooks=[decisions_logger.log_decision])],
        "SessionStart": [HookMatcher(matcher=".*", hooks=[session_brief.brief])],
        "SessionEnd":   [HookMatcher(matcher=".*", hooks=[session_brief.update_index])],
    },
)
```

### Prompt-cache discipline (критично)

Команда Claude Code открытым текстом написала: "We build our entire harness around prompt caching. A high prompt cache hit rate decreases costs and helps us create more generous rate limits, so we run alerts on our prompt cache hit rate and declare SEVs if they're too low." Это не nice-to-have, это load-bearing.

Правила в `claudenv` 2.0:

1. **Стабильный prefix** — `CLAUDE.md` + tool definitions + список skills генерируется ОДИН раз в начале сессии и не меняется. Никаких timestamps, никаких рандомизированных IDs.
2. **`cache_control` на крупных стабильных блоках** — system prompt, набор skills, memories/INDEX.md помечаются `cache_control: {"type": "ephemeral"}`
3. **Никаких смен модели mid-session** — выбор модели в `claudenv session start`, фиксируется на всю сессию (смена сбрасывает кэш полностью)
4. **Никакого add/remove инструментов mid-session** — claudenv фиксирует `allowed_tools` на старте
5. **Updates через append, не через edit** — если нужно "обновить инструкцию" в сессии — пишем в новое user message в конце, не редактируем system prompt
6. **Plan mode как tool call** — переключения режимов реализуются tool-ами (как Claude Code делает с EnterPlanMode), а не сменой system prompt
7. **`cache_guard` hook** — PreToolUse hook проверяет что в этом запросе prefix совпадает байт-в-байт с предыдущим. Если нет — пишет warning в `~/.claudenv/sessions/<id>/cache_breaks.log`

### Стабильный prefix конкретно

```python
# claudenv/runtime.py

STABLE_SYSTEM_PROMPT = """
# claudenv 2.0 — system prompt

You are operating inside claudenv, a personal tool for informed coding.

## Universal rules
[ ... <100 строк из CLAUDE.md template ... ]

## Memory protocol
You have access to /memories/ via the memory tool.
- At session start: read /memories/INDEX.md
- Before non-trivial decisions: check /memories/decisions/ for related precedents
- After non-trivial decisions: append to /memories/decisions/<date>-<topic>.md

## Skills loaded for this session
[ ... динамически вставленный список SKILL.md frontmatters ... ]
"""

# В messages.create:
system = [
    {
        "type": "text",
        "text": STABLE_SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    },
]
```

`STABLE_SYSTEM_PROMPT` строится один раз и хешируется; hook падает с ошибкой если хеш меняется.

### Subagents для изоляции контекста

Три встроенных:

- **`planner`** — когда задача требует декомпозиции. Получает запрос пользователя, читает relevant /memories/, пишет план в `/memories/plans/<task>.md`, возвращает summary. Без доступа к Write/Bash — только чтение и WebSearch.
- **`critic`** — после нетривиальной серии edit'ов. Читает diff (`git diff`), проверяет очевидные косяки (упущенные edge cases, нарушения проектных конвенций из `projects/`), возвращает список замечаний. Не правит сам — это работа main agent.
- **`researcher`** — для vibe-decisions deep dive. Получает топик, WebSearch + WebFetch, возвращает 3-5 ключевых источников с summary. Изолированный контекст значит что 50K токенов поиска не загрязняют main session.

Subagent invokes through `Agent` tool. Каждый стартует с пустым контекстом и получает только prompt string — поэтому в prompt'е нужно явно передать всё что ему нужно (пути к файлам, описание задачи, ожидаемый формат ответа). Финальное message subagent'а возвращается parent как tool result.

> ⚠️ **Не злоупотреблять** — multi-agent fan-out даёт ~15× больше токенов чем single. Single-threaded главное правило, subagent только для (а) реально изолированного исследования или (б) явно параллельных задач.

### Hooks которые нужны

| Hook | Когда | Что делает |
|---|---|---|
| `SessionStart` | начало сессии | Читает INDEX.md, кладёт в первое assistant message как briefing |
| `SessionEnd` | конец сессии | Регенерирует INDEX.md из decisions/, обновляет git, при настройке — auto-commit |
| `PreToolUse` (`.*`) | перед любым tool call | `cache_guard` — проверка стабильности prefix |
| `PostToolUse` (`Write`) | после Write | `decisions_logger` — если есть маркер vibe-decision, пишет в memories/decisions |
| `UserPromptSubmit` | пользователь отправил message | Если сообщение длинное и упоминает `/why X`, `/deeper`, `/decisions` — добавляет prefix для vibe-decisions skill |

### Чего НЕ делаем

- **Не пишем свой harness layer** поверх SDK. SDK уже делает agent loop, tool execution, checkpointing. Своего не нужно
- **Не пишем свой permission system** — SDK имеет PermissionRequest hooks; используем их
- **Не оборачиваем все tools в наши обёртки** — берём встроенные (Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch). Свои только когда реально нужно (например — custom MCP для канона)
- **Не тащим LangChain/CrewAI/AutoGen** — SDK самодостаточен

---

## Часть 3: Vibelearning (режим vibe-decisions)

### Финальный дизайн

Vibelearning **не curriculum, не learning platform**. Это **режим работы agent'а** в котором перед каждым нетривиальным техническим выбором выдаётся brief overview, и пользователь решает — идти дальше с этим выбором, или развернуть deep dive.

**Что вырезано:**
- FSRS, spaced repetition, review cycles
- Skill graph со статусами (mastered/learning)
- Exercise verification, self-explanation prompts
- Curriculum tracks, learning paths
- Метрики обучения

**Что осталось:**
- Brief overview формат как default для нетривиальных решений
- Deep dive on demand с форматом explain → variants → trade-offs → canon
- Личный канон в `~/.claudenv/canon/`
- Логирование принятых решений в /memories/decisions/

### Главный skill

```yaml
---
name: vibe-decisions
description: |
  Trigger before writing code that involves a non-trivial technical
  choice (library, algorithm, data structure, architecture pattern,
  sync vs async, correctness vs performance). Output a brief overview
  with pros/cons specific to the task and mention 1-2 alternatives.
  Wait for confirmation or a deep-dive request before coding.
  Also trigger when user types: "почему X?", "X vs Y?", "/why",
  "/deeper", "/decisions", "alternatives?", "trade-offs?".
  Do NOT trigger for trivial syntax, naming, or formatting choices.
---

# Vibe decisions

## Trigger criteria

Trigger if the decision involves:
- choosing a library or framework from 2+ viable options
- choosing an algorithm or data structure with meaningful trade-offs
- architecture pattern (sync/async, push/pull, where state lives)
- correctness vs performance vs simplicity trade-offs
- anything where reasonable engineers would disagree

DO NOT trigger for:
- syntax-level choices in a single language (for vs map, etc.)
- obvious choices (JSON for a config file, etc.)
- pure refactoring within established patterns
- when user typed `/just-code`

## Step 1 — Check memory before deciding

Read /memories/decisions/ for entries with related `topic`.
If a precedent exists, briefly mention it in the overview.

## Step 2 — Brief overview format (REQUIRED)

Output exactly this structure, in the user's language:

**Подход:** <название технологии/паттерна>
**Почему для этой задачи:** <1-2 строки, конкретно к задаче>
**Минусы:** <1-2 строки, конкретно к задаче>
**Альтернативы:** <название A — одно предложение>;
                  <название B — одно предложение>

Then ask: "Делать так, или разобрать варианты подробнее?"

DO NOT proceed with code until user confirms OR asks for deep dive.

## Step 3 — Deep dive (on request)

When user asks "расскажи подробнее", "/deeper", "почему X?",
"X vs Y", "alternatives?" — expand into full format:

1. **Концептуально** — что это и какую проблему решает (3-5 строк)
2. **Как работает** — упрощённая модель (5-10 строк, optionally
   с кратким code sketch)
3. **2-3 варианта реализации** — для каждого: код + 1-2 строки
   trade-offs
4. **Канон** — 2-4 ссылки. Сначала ищем match в
   ~/.claudenv/canon/index.yaml. Если match есть — используем эти
   ссылки. Если match отсутствует — используем WebSearch и
   предлагаем добавить новые ссылки в canon после сессии.

## Step 4 — After decision

When user confirms a choice, write to /memories/decisions/:

filename: <ISO-date>-<short-topic-slug>.md
content (YAML frontmatter + optional body):

---
date: <ISO datetime>
project: <current project name from /memories/projects/ or basename of cwd>
topic: <what was decided, plain language>
chose: <approach>
alternatives_considered: [<A>, <B>]
reason: <one sentence why>
deep_dive_done: <yes|no>
sources_consulted: [<canon-id-or-url>, ...]
---

<optional body — additional notes from the user, or relevant
caveats Claude wants to remember>

Include the marker `__VIBE_DECISION__` somewhere in the Write call
content so the decisions_logger hook can detect it.
```

### Канон

`~/.claudenv/canon/index.yaml`:

```yaml
# Личный канон. Только то что вы прочитали и сочли важным.
# Стартовое наполнение — несколько pinned записей; растёт по ходу работы.

distributed_locks:
  - title: "How to do distributed locking"
    author: Martin Kleppmann
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
    why: "обязательное чтение перед выбором Redis для locks"
  - title: "Is Redlock safe?"
    author: antirez
    url: http://antirez.com/news/101
    why: "ответ автора Redis на критику"

raft_consensus:
  - title: "In Search of an Understandable Consensus Algorithm"
    authors: [Ongaro, Ousterhout]
    venue: "USENIX ATC 2014"
    why: "оригинальный paper"
  - title: "Implementing Raft"
    author: Eli Bendersky
    url: https://eli.thegreenplace.net/2020/implementing-raft-part-1-elections/
    why: "лучшая поэтапная имплементация"

# Команды:
#   claudenv canon add <topic> <url> --why "..."
#   claudenv canon search <query>
#   claudenv canon prune    — показать unused за последние N месяцев
```

`canon/notes/` — для cached копий статей (если хочется офлайн). Большие файлы через git-lfs если репо приватный, или просто URL'ы если нет.

### Команды

```
claudenv init                       # развернуть .claude/ и ~/.claudenv/
claudenv session start              # начать новую сессию с ClaudeSDKClient
claudenv session resume <id>        # продолжить
claudenv session list               # последние сессии

claudenv canon add <topic> <url> --why "<reason>"
claudenv canon search <query>
claudenv canon list <topic>

claudenv decisions list             # последние 10
claudenv decisions show <id>
claudenv decisions search <query>   # grep по reason / topic

claudenv sync                       # git pull --rebase + push (зашифрованных файлов)
claudenv sync status                # diff от remote

claudenv doctor                     # проверка: SDK версия, beta header, sandbox,
                                    # cache hit rate из последних сессий
```

В чате во время сессии:

```
/just-code            # одноразово пропустить vibe overview для следующего ответа
/deeper               # развернуть последнее решение в deep dive
/why <X>              # спросить про любую технологию в контексте текущей задачи
/decisions            # показать последние 10 принятых решений
/canon <topic>        # показать ссылки из канона по теме
```

### Что это даёт

- **Анти-cargo-culting** — Claude не пишет код "вот вам Redlock" без объяснения
- **Память решений** — через месяц можно `grep` по decisions и найти "почему я выбрал X"
- **Личная библиотека** — канон растёт от реальных decision-моментов, не от попыток "выучить"
- **Низкая когнитивная нагрузка** — не прерывает поток когда задача тривиальная

### Чего точно НЕТ

- Никаких proactive nudges типа "you used Raft 3 times this week, want a review?"
- Никаких "skills mastered" badges
- Никаких exercises к concept'ам
- Никакого FSRS scheduler'а с next_review datetime
- Никаких метрик retention или recall rate

---

## Cross-device синхронизация

### Стек

- **Git** — single source of truth. `~/.claudenv/` это git репо (приватный)
- **age** (age-encryption.org) — encryption для секретов и приватных решений
- **Optional: Syncthing** — для дискретного P2P-синка без cloud git
- **`.gitignore`** жёстко: `sessions/`, `keys/private*`, любые `*.local.*`

### Что синхронизируется

| Папка | Sync | Encrypted | Зачем |
|---|---|---|---|
| `memories/` | ✅ | через age для sensitive | persistent state |
| `canon/` | ✅ | нет | shared canon между машинами |
| `skills/` | ✅ | нет | personal skills |
| `config.yaml` | ✅ | partial (через age для api keys) | preferences |
| `keys/recipients.txt` | ✅ | нет | публичные age recipients |
| `keys/private*` | ❌ | — | приватные ключи не уходят с машины |
| `sessions/` | ❌ | — | sessionTranscripts локальные |

### age для секретов

```bash
# на каждой машине: создать age key (один раз)
age-keygen -o ~/.claudenv/keys/private.age
# публичный ключ в keys/recipients.txt
cat ~/.claudenv/keys/private.age | grep "public key:" | cut -d' ' -f4 \
    >> ~/.claudenv/keys/recipients.txt

# claudenv sync шифрует чувствительные файлы через age:
age -R ~/.claudenv/keys/recipients.txt \
    -o memories/projects/payments-service.md.age \
    memories/projects/payments-service.md
# в git коммитится только .age файл; .md в .gitignore

# на другой машине после git pull:
age -d -i ~/.claudenv/keys/private.age \
    memories/projects/payments-service.md.age \
    > memories/projects/payments-service.md
```

`claudenv sync` оборачивает это — не нужно вручную age'ить каждый файл.

### Конфликты

Memory files короткие, конфликты редки. Стратегия:

1. `claudenv sync` делает `git pull --rebase` перед push
2. При конфликте в `decisions/<file>.md` — обе версии остаются: `<file>.md` (local) и `<file>.remote.md`. Claude в следующей сессии видит конфликт через `SessionStart` hook и спрашивает что делать.
3. Конфликт в `INDEX.md` — игнорируется (регенерируется автоматически из `decisions/`)

### Безопасность

- Никаких API ключей в git, даже зашифрованных (это для `~/.config/`, не для claudenv)
- `.git/hooks/pre-commit` ставится `claudenv init` — запускает `gitleaks` перед коммитом
- Приватные branches для machine-specific overrides

---

## Фазы релиза

### Фаза 0 — Скелет SDK (1-2 недели)

**Цель:** переход с current шаблонной модели на ClaudeSDKClient + базовый CLI.

- [ ] `pyproject.toml` с claude-agent-sdk зависимостью
- [ ] `claudenv init` — раскладка `.claude/` и `~/.claudenv/` (пустые но валидные)
- [ ] `claudenv session start` — поднимает ClaudeSDKClient с stable system prompt
- [ ] CLAUDE.md шаблон < 100 строк
- [ ] Базовая интеграция cache_control на system prompt

**Definition of done:** базовая сессия запускается, prompt cache hit > 0% на повторных turn'ах в одной сессии.

### Фаза 1 — Memory (2-3 недели)

**Цель:** memory tool работает, persistence между сессиями реально есть.

- [ ] `LocalFileMemoryBackend` (subclass `BetaAbstractMemoryTool`)
- [ ] beta header `context-management-2025-06-27` через `extra_headers`
- [ ] SessionStart hook читает INDEX.md
- [ ] SessionEnd hook регенерирует INDEX.md
- [ ] `claudenv decisions list/show/search`
- [ ] Базовая структура memories/: decisions, projects, user
- [ ] Шаблон INDEX.md generator

**Definition of done:** запустить сессию, упомянуть стек проекта; закрыть; в новой сессии Claude помнит стек.

### Фаза 2 — Vibe-decisions (2-3 недели)

**Цель:** brief overview + deep dive on demand работает на нетривиальных решениях.

- [ ] Skill `vibe-decisions/SKILL.md` с trigger criteria
- [ ] `deep-dive-template.md`
- [ ] `decisions_logger` hook (PostToolUse → memories/decisions/)
- [ ] `~/.claudenv/canon/index.yaml` template + 20-30 pinned записей по областям которые реально использую
- [ ] `claudenv canon add/search/list`
- [ ] In-chat команды `/just-code`, `/deeper`, `/why`, `/decisions`, `/canon`

**Definition of done:** на 5 различных нетривиальных вопросах ("какой DB", "sync или async", "какой algo для X", etc.) Claude выдаёт brief overview прежде чем код, ждёт подтверждения, и логирует решение.

### Фаза 3 — Sync (1-2 недели)

**Цель:** persistent state синкается между двумя машинами.

- [ ] `~/.claudenv/` инициализируется как git repo
- [ ] age интеграция для sensitive файлов
- [ ] `claudenv sync` команда (pull --rebase, encrypt, push)
- [ ] `claudenv sync status`
- [ ] Conflict resolution для memories
- [ ] Документация setup process

**Definition of done:** машина A пишет решение → claudenv sync → машина B делает claudenv sync → новая сессия на B видит то решение в INDEX.md.

### Фаза 4 — Subagents и hooks (2-3 недели)

**Цель:** изоляция контекста для долгих исследований, cache_guard, basic critic.

- [ ] `planner` subagent (опционально через явный `/plan` toggle)
- [ ] `critic` subagent (опционально через `/critic` после серии правок)
- [ ] `researcher` subagent (используется vibe-decisions deep dive когда нужен WebSearch)
- [ ] `cache_guard` hook с warning при cache break
- [ ] `claudenv doctor` показывает cache hit rate и другие метрики

**Definition of done:** deep dive vibe-decisions выполняет WebSearch через researcher subagent, не загрязняя main context >2K токенов.

### Фаза 5 — Polish (1-2 недели)

- [ ] Полная документация в `docs/`
- [ ] ADR для ключевых решений (используем `claudenv init --adr` который кладёт template)
- [ ] Examples в `examples/` (типовые сессии)
- [ ] Migration guide со старого claudenv

**Total:** 9-15 недель в зависимости от темпа. На одного maintainer'а реалистично ~12 недель.

---

## Риски и mitigation

| # | Риск | Вероятность | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Memory tool API меняется (он beta, header сменится) | Высокая | Средний | Изолировать backend через интерфейс; пинить версию SDK; в `doctor` показывать актуальный header |
| 2 | Cache break ломает экономику | Средняя | Высокий | `cache_guard` hook алертит; в `doctor` показывать hit rate; CI тест на stable prefix |
| 3 | Agent SDK alpha-статус (Python SDK на alpha как минимум до начала 2026) | Средняя | Средний | TypeScript SDK как fallback option; pin минорной версии; smoke tests |
| 4 | Agent SDK monthly credit limit (с 15 июня 2026) | Средняя | Низкий для personal | `doctor` предупреждает; документация по plan tier |
| 5 | Memory leak секретов через decisions/ | Низкая | Высокий | age по умолчанию для projects/ файлов; pre-commit gitleaks |
| 6 | Vibe-decisions триггерится слишком часто и раздражает | Средняя | Средний | Жёсткие trigger criteria в SKILL.md; `/just-code` escape hatch; tuning после первой недели реального использования |
| 7 | Vibe-decisions триггерится слишком редко | Средняя | Средний | Список trigger phrases в SKILL.md; явные slash-commands `/why`, `/deeper` |
| 8 | Sync конфликты в memories повреждают данные | Низкая | Высокий | Always rebase, .remote.md fallback files, гит хранит историю |
| 9 | Канон растёт неуправляемо | Низкая | Низкий | `claudenv canon prune` показывает unused; manual review раз в месяц |
| 10 | INDEX.md разрастается и становится cache-noise | Средняя | Средний | Лимит размера в SessionEnd hook; rotation старых решений в archive/ |

---

## Открытые вопросы

1. **TypeScript vs Python SDK** — Python имеет alpha статус, но более удобен для скриптинга hooks. TS более стабилен. Решение: начать с Python, держать поверхность узкой чтобы port на TS был дешёвым.

2. **Sandboxing** — `@anthropic-ai/sandbox-runtime` или built-in Claude Code sandbox. Зависит от того, исполняется ли claudenv внутри Claude Code или standalone. Для personal tool — built-in sandbox через `settings.json` достаточно; standalone SDK нужен Sandbox-runtime обёртка.

3. **Conflict resolution для decisions/** — стратегия "обе версии остаются" может накапливать orphan файлы. Альтернатива: при конфликте автоматически создавать `<topic>.merged.md` через subagent. Решить после первого реального конфликта.

4. **Канон как git submodule?** — для shared канона между разработчиками можно сделать `~/.claudenv/canon/community/` как submodule на отдельный публичный репо. Не для MVP.

5. **Cross-tool portability** — SKILL.md универсален; но команды (`/why`, `/deeper`) работают только в Claude Code. Если запускаем через Cursor/Gemini CLI — нужны альтернативные триггеры (текстовые фразы). Документация должна это явно отмечать.

6. **Auto-commit или manual?** — `claudenv sync` после каждой сессии vs `claudenv session end --commit`. Дефолт: предлагать но не делать автоматически. Можно включить `auto_commit: true` в config.yaml.

---

## Что измеряем (минимально)

Не "метрики обучения". Только техническое здоровье:

- **Prompt cache hit rate** per session (через SDK telemetry; цель > 70%)
- **Memory tool ops per session** (создания/правки; сколько realistically пишется?)
- **Decisions logged per week** (если за месяц < 5 — vibe-decisions не триггерится; tuning trigger criteria)
- **Sync conflicts per month** (если > 1 — что-то не так с rebase strategy)

Эти числа в `claudenv doctor`.

---

## Итог

```
До 2.0:                        После 2.0:
─────────────                  ─────────────
Шаблонный CLAUDE.md            Tier-1 CLAUDE.md (<100 строк)
                              + /memories через memory tool

Память теряется                Persistent via memory tool +
между сессиями                 git+age cross-device sync

Свой harness                   Claude Agent SDK runtime
поверх API                     + hooks + subagents

Нет vibe-decisions             Brief overview default
                              + deep dive on demand
                              + personal canon
                              + decisions log
```

Три фокуса, всё на официальных примитивах, всё файлы и текст, всё гитуется. Personal tool, не platform.
