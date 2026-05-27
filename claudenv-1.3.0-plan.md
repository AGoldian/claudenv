# claudenv 1.3.0 — план обновления

> Версия плана: 1.0 · Дата: 27 мая 2026 · Базируется на: [claudenv-update-plan.md](./claudenv-update-plan.md) (2.0)
> Тип релиза: **bridge release** между текущим Node.js installer (1.2.5) и будущим Python+SDK rewrite (2.0)

## TL;DR

1.3.0 — это **первый incremental шаг к 2.0**, который сохраняет работающий Node.js installer и `claudenv loop`, но добавляет рядом:

- **Split memory layout**: глобальные `~/.claudenv/memories/{decisions,canon,user}/` + per-project `.claude/memories/{projects,project-decisions}/`
- **Python модуль `claudenv-memory`** (новый pypi пакет): `LocalFileMemoryBackend` как subclass `BetaAbstractMemoryTool` — готовый компонент для пользователей, которые хотят Claude Agent SDK напрямую
- **Двухрежимный vibe-decisions skill**: auto-log без пауз в `claudenv loop` (сохраняет autonomy=law), pause-and-ask в interactive Claude Code сессиях
- **Hooks**: `decisions-logger` (PostToolUse Write) и `regen-index` (SessionEnd) — расширяют существующий `hooks-gen.js`
- **CLI**: `claudenv memory`, `claudenv decisions`, `claudenv canon`, `claudenv doctor` — новые subcommand'ы в существующем Node.js CLI

Не входит в 1.3.0 (откладывается на 1.4 / 2.0): age encryption, cross-device git sync, перепись loop на Python+SDK, cache_guard hook, subagents через SDK API.

Инварианты: 1.2.5 поведение не ломается; `autonomy=law` сохраняется (loop никогда не паузится); Python модуль публикуется параллельно, Node.js не переводится.

---

## Что меняется vs 1.2.5

| Компонент | 1.2.5 | 1.3.0 |
|---|---|---|
| CLI | install/loop/report/validate | + `memory`, `decisions`, `canon`, `doctor`, `hook` |
| Scaffold | `.claude/{agents,commands,skills,hooks}/` | + `.claude/skills/vibe-decisions/`, + `.claude/memories/`, + decisions-logger hook в `settings.json` |
| Global state | `~/.claude/` (Claude Code auto-memory) | + `~/.claudenv/memories/` (decisions/canon/user) |
| Loop | `--append-system-prompt` с autonomy-prompt | + INDEX.md briefing в том же append-system-prompt, + `CLAUDENV_LOOP=1` env |
| Hooks | PreToolUse (validate), PostToolUse (audit) | + PostToolUse Write → decisions-logger, + SessionEnd → regen-index |
| Python | — | новый pypi пакет `claudenv-memory` с `LocalFileMemoryBackend` |

---

## Memory layout (split)

### Глобальное: `~/.claudenv/memories/`

Cross-project, shareable между всеми сессиями любого проекта.

```
~/.claudenv/
├── memories/
│   ├── INDEX.md                    # one-pager briefing (<50 строк), генерируется
│   ├── decisions/                  # cross-project tech decisions
│   │   └── 2026-05-27-distributed-locks.md
│   ├── canon/                      # личный канон (был отдельный canon/ в 2.0 плане — мерджим)
│   │   ├── index.yaml
│   │   └── notes/                  # cached articles (опц.)
│   └── user/
│       └── preferences.md          # editor, package manager, code style
├── config.yaml                     # model, sandbox, auto_commit
└── .gitignore                      # пустой по умолчанию; sync — 1.4
```

### Per-project: `.claude/memories/`

В git репо проекта, шарится с командой через PR'ы.

```
<project>/.claude/
├── memories/
│   ├── project.md                  # стек, конвенции, важные urls (как 2.0 projects/<name>.md)
│   ├── decisions/                  # project-specific decisions
│   │   └── 2026-05-27-auth-jwt.md
│   └── README.md                   # объясняет split
├── skills/
│   └── vibe-decisions/
│       ├── SKILL.md
│       └── deep-dive-template.md
└── settings.json                   # + регистрация hook'ов
```

### Где что писать

- **Глобальное decision** — когда выбор технологии универсален (Redis для locks, Raft для consensus) → `~/.claudenv/memories/decisions/`
- **Project decision** — когда выбор специфичен проекту (JWT vs session для этого API) → `.claude/memories/decisions/`
- **Skill решает** через эвристику: если решение касается project-only артефакта (название модуля, env name, deployment target) → project; иначе → global. По умолчанию global если непонятно.

Hook `decisions-logger` определяет destination по полю `scope: global|project` в frontmatter (по умолчанию `global`).

---

## Python модуль `claudenv-memory`

### Зачем

Пользователи, которые хотят писать свои Python-приложения на Claude Agent SDK с тем же memory layout что и claudenv loop — могут просто `pip install claudenv-memory` и подключить готовый `LocalFileMemoryBackend`. Это **bridge** к 2.0: когда loop переедет на Python+SDK, он будет использовать тот же модуль.

### Расположение в репо

```
claudenv/                           # текущий Node.js пакет (root)
├── python/                         # новый Python пакет
│   ├── pyproject.toml              # name = "claudenv-memory", version = "0.1.0"
│   ├── README.md
│   ├── claudenv_memory/
│   │   ├── __init__.py             # export LocalFileMemoryBackend
│   │   ├── backend.py              # BetaAbstractMemoryTool subclass
│   │   └── paths.py                # резолв ~/.claudenv/memories/ и .claude/memories/
│   └── tests/
│       └── test_backend.py
└── ...                             # Node.js файлы как раньше
```

Публикация: `claudenv-memory` отдельный pypi пакет; версионируется независимо от Node.js `claudenv` (0.1.0 = parallel с claudenv 1.3.0).

### API

```python
from claudenv_memory import LocalFileMemoryBackend
from claude_agent_sdk import ClaudeAgentOptions

backend = LocalFileMemoryBackend(
    global_root=None,        # default ~/.claudenv/memories
    project_root=None,       # default ./.claude/memories
    scope_routing=True,      # writes к /memories/decisions/ роутятся по frontmatter scope
)

options = ClaudeAgentOptions(
    model="claude-opus-4-7",
    extra_headers={"anthropic-beta": "context-management-2025-06-27"},
    tools=[backend.as_tool()],
)
```

Имплементация — как в [claudenv-update-plan.md строки 175-226](./claudenv-update-plan.md), но с одной поправкой: `view/create/str_replace/insert/delete/rename` принимают paths типа `/memories/decisions/<x>.md` и `/memories/project/decisions/<x>.md` — backend сам резолвит global vs project через префикс пути или поле в frontmatter.

### Что НЕ входит в `claudenv-memory` 0.1.0

- Sync (это будет `claudenv-sync` в 1.4)
- Subagent configs (2.0)
- Canon API (Node.js CLI владеет канонoм; Python модуль не дублирует)

### Статус 0.1.x — alpha

Без real-world consumer внутри 1.3.0 (loop/hooks остаются Node.js). Чтобы не протухло между релизом и 2.0: README явно alpha, `python/examples/loop_example.py` smoke в CI (mocked API), `claude-agent-sdk = "~=0.2"` в pyproject.toml.

---

## Vibe-decisions двухрежимный

### Триггер режима — через system prompt, не env

> ⚠️ SKILL.md — это markdown-инструкция, не исполняемый код. Полагаться на `$CLAUDENV_LOOP` env через Bash call внутри скилла = надежда что Claude сам сделает этот шаг. Ненадёжно. Используем тот же канал что уже работает в loop — `--append-system-prompt`.

Loop в `src/loop.js` (`buildSystemPromptWithMemory`) добавляет директивный fragment:

```
## Vibe-decisions mode (loop)

You are running inside `claudenv loop` in autonomous mode. When the
vibe-decisions skill triggers: pick the approach, write the decision
log immediately, continue with code. Do NOT pause for user
confirmation. Do NOT ask "делать так?". The goal is law (см. autonomy=law).
```

В interactive Claude Code (без loop) этого fragment'а в system prompt нет → skill ведёт себя по дефолту (pause-and-ask).

SKILL.md в `Trigger criteria` секции просто проверяет: "If system prompt mentions 'Vibe-decisions mode (loop)' → auto-log. Else → pause-and-ask." Это явная инструкция, не env.

Env `CLAUDENV_LOOP=1` устанавливается loop'ом дополнительно — для будущего Python кода (например, `claudenv-memory` 0.2.x может его читать). В 1.3.0 — secondary marker, не primary.

### Auto-log mode (loop)

Перед нетривиальным выбором:

```
**Выбрано:** <approach>
**Почему:** <одно предложение>
**Альтернативы:** <A> (--), <B> (--)
**Лог:** /memories/decisions/<date>-<topic>.md (scope: <global|project>)

[продолжает работу без паузы]
```

Skill сразу пишет decision файл через Write tool, потом продолжает. Никакого confirmation. Соответствует `autonomy=law`.

### Interactive mode (без loop)

Полный pause-and-ask формат как в [claudenv-update-plan.md строки 482-571](./claudenv-update-plan.md):

```
**Подход:** ...
**Почему для этой задачи:** ...
**Минусы:** ...
**Альтернативы:** ...

Делать так, или разобрать варианты подробнее?
```

Ждёт user input. На `/deeper` → разворачивает в deep dive (концепт, реализация, варианты, канон). На confirmation → пишет в decisions/.

### Slash-commands

Каждая команда — это отдельный markdown файл в `.claude/commands/<name>.md` (стандартный Claude Code механизм; так же как уже работают `/claudenv`, `/autonomy`, `/improve`). Installer кладёт их при `claudenv install`.

| Команда | Назначение | Auto-log mode (loop) | Interactive mode |
|---|---|---|---|
| `/deeper` | **Развернуть последнее решение в подробное объяснение** (deep dive): концепт → как работает → 2-3 варианта с trade-offs → канон | Перечитывает последнюю запись из `decisions/`, выводит deep dive, опционально обновляет файл полем `deep_dive_done: yes` | То же; вызывается после brief overview когда пользователь хочет разобраться |
| `/why <X>` | Спросить про любую технологию в контексте текущей задачи без принятия решения | Brief explanation (3-5 строк), не пишет в decisions/ | То же — explainer не trigger'ит pause |
| `/decisions [N]` | Показать последние N (default 10) принятых решений | Печатает grep по `~/.claudenv/memories/decisions/` + project decisions | То же |
| `/canon [<topic>]` | Показать ссылки из канона по теме (или все темы если без аргумента) | Читает `~/.claudenv/memories/canon/index.yaml`, фильтрует | То же |
| `/just-code` | Одноразово пропустить vibe-decisions для следующего ответа | No-op (в loop уже auto-log, без пауз) | Подавляет brief overview на ОДИН ответ; на следующем restore поведение по умолчанию |
| `/decisions search <q>` | Grep по reason/topic во всех decisions | Печатает matches | То же |

**`/deeper` — главная команда для подробных объяснений.** Разворачивает последнее решение: концепт (3-5 строк) → как работает (5-10 строк, опц. code sketch) → 2-3 варианта с trade-offs → канон (2-4 ссылки из `~/.claudenv/memories/canon/index.yaml`; если match нет — WebSearch + предложение `claudenv canon add`).

Альтернативные триггеры в чате без slash: "расскажи подробнее", "почему именно X?", "X vs Y?", "alternatives?", "trade-offs?" — SKILL.md перечисляет их.

Каждая команда — frontmatter (`description`, `allowed-tools`, `argument-hint`) + 20-40 строк инструкций. Образец — существующий `scaffold/global/.claude/commands/autonomy.md`. Slash-команды зовут Node.js CLI через Bash где удобно (`/canon` → `!claudenv canon list <topic>`).

---

## Hooks

### `decisions-logger` (PostToolUse, matcher: Write)

```json
{
  "PostToolUse": [
    {
      "matcher": "Write",
      "hooks": [
        { "type": "command", "command": "claudenv hook decisions-logger" }
      ]
    }
  ]
}
```

`claudenv hook decisions-logger` — новая subcommand в Node.js CLI. Реализация в `src/hooks/decisions-logger.js`:

1. **Path check FIRST** (hot path — hook фигурирует на каждом Write): если `tool_input.file_path` не подходит ни под `*/memories/decisions/*.md` ни под `*/decisions/*.md`, и в `content` нет маркера `__VIBE_DECISION__` → exit 0 немедленно, без чтения content полностью.
2. Если path/marker matched: парсит YAML frontmatter, валидирует обязательные поля (`date`, `topic`, `chose`, `reason`)
3. Подставляет недостающие defaults: `date = now`, `scope = global` если не указан
4. Валидирует scope vs path consistency — если `scope: project` но файл в global path → лог warning в `~/.claudenv/.log/decisions-logger.log`, **НЕ** переписывает файл (см. ниже)
5. Регенерирует INDEX.md (или ставит dirty flag для batch регенерации в SessionEnd)
6. Не блокирует write — PostToolUse, write уже произошёл

**Skill пишет в правильный path сразу, hook только валидирует.** Post-hoc rewrite (как было в первой версии плана) — фрагильно: Claude может re-Write на оригинальный path в следующем turn, получается ping-pong. Корректнее: SKILL.md инструктирует "Choose scope BEFORE writing; write to the correct directory directly". Hook просто верифицирует и логирует mismatch для пользователя (`claudenv decisions fix --rescope`).

Идемпотентность: hook может перевызываться, файл уже корректен — no-op.

### `regen-index` (SessionEnd, matcher: ".*")

```json
{
  "SessionEnd": [
    {
      "matcher": ".*",
      "hooks": [
        { "type": "command", "command": "claudenv hook regen-index" }
      ]
    }
  ]
}
```

> ⚠️ **Проверить**: SessionEnd hook в Claude Code stable. Если ещё experimental — fallback: `claudenv loop` сам вызывает `claudenv memory index` после каждой iteration; interactive пользователь делает manual.

Реализация в `src/hooks/regen-index.js`:

1. Сканирует `~/.claudenv/memories/decisions/*.md` + все `.claude/memories/decisions/*.md` (если запущен из проекта)
2. Берёт top-5 latest по `date:` frontmatter
3. Сканирует `~/.claudenv/memories/user/preferences.md` и project facts
4. Генерирует INDEX.md компактного формата (~30-50 строк): свежие decisions + ключевые prefs + active projects

INDEX.md → попадает в системный промпт следующей сессии через `appendSystemPrompt` в loop (см. ниже) или через memory tool view на `/memories/INDEX.md` в interactive.

---

## Loop integration

`src/loop.js` изменения:

```javascript
// строка ~530 (текущая):
appendSystemPrompt: options.goal ? buildAutonomySystemPrompt(options.goal) : undefined,

// 1.3.0:
appendSystemPrompt: buildSystemPromptWithMemory(options.goal),
env: { ...process.env, CLAUDENV_LOOP: '1' },
```

`buildSystemPromptWithMemory(goal)` в новом `src/memory-context.js`:

```javascript
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function buildSystemPromptWithMemory(goal) {
  const parts = [];
  if (goal) parts.push(buildAutonomySystemPrompt(goal));

  // Memory briefing
  const indexPath = join(homedir(), '.claudenv', 'memories', 'INDEX.md');
  try {
    const indexContent = await readFile(indexPath, 'utf-8');
    parts.push('## Memory briefing\n\n' + indexContent);
  } catch { /* нет INDEX.md — пропускаем */ }

  return parts.join('\n\n');
}
```

После каждой iteration loop вызывает `await regenIndex({ cwd })` — обновляет INDEX.md из накопленных decisions. Это **fallback** на случай если SessionEnd hook не сработал (или Claude Code старой версии).

---

## CLI команды

Добавляются в `bin/cli.js`:

### `claudenv memory`

```
claudenv memory init                # создать ~/.claudenv/memories/ структуру
claudenv memory index               # регенерировать INDEX.md
claudenv memory show <path>         # печать файла из memories
claudenv memory edit <path>         # открыть в $EDITOR
```

### `claudenv decisions`

```
claudenv decisions list [--scope global|project|all] [--limit N]
claudenv decisions show <id-or-slug>
claudenv decisions search <query>   # grep по topic/reason
claudenv decisions archive <id>     # перенос в archive/ (для rotation)
```

### `claudenv canon`

```
claudenv canon add <topic> <url> --why "<reason>" [--author "<name>"]
claudenv canon list [<topic>]
claudenv canon search <query>
claudenv canon prune                # показать unused за последние 6 месяцев
```

### `claudenv hook <name>`

Внутренняя точка входа для shell hooks. Принимает event на stdin.

```
claudenv hook decisions-logger
claudenv hook regen-index
```

### `claudenv doctor`

```
claudenv doctor
# Checks: Node.js >= 20, claude CLI available, ~/.claudenv/memories/
# writable, .claude/skills/vibe-decisions/ installed, hooks registered
# в settings.json, INDEX.md size < 100 lines, active autonomy profile.
```

---

## Файлы которые меняются / создаются

### Node.js пакет (root)

**Изменяются:**
- `package.json` — version → 1.3.0
- `bin/cli.js` — добавить новые subcommand'ы (memory, decisions, canon, hook, doctor)
- `src/index.js` — re-export новых модулей
- `src/installer.js` — установка нового scaffold + global `~/.claudenv/memories/` структуры
- `src/hooks-gen.js` — добавить генерацию decisions-logger и regen-index hooks в settings.json
- `src/loop.js` — `buildSystemPromptWithMemory`, `CLAUDENV_LOOP=1`, post-iteration `regenIndex`
- `README.md` — раздел про memory + decisions + canon

**Создаются:**
- `src/memory.js` — implementation of `memory init/index/show/edit`
- `src/decisions.js` — implementation of `decisions list/show/search/archive`
- `src/canon.js` — implementation of `canon add/list/search/prune`
- `src/doctor.js` — health check
- `src/memory-context.js` — `buildSystemPromptWithMemory`
- `src/hooks/decisions-logger.js` — hook handler
- `src/hooks/regen-index.js` — hook handler
- `src/hooks/dispatcher.js` — `claudenv hook <name>` router

### Scaffold (новые шаблоны)

**Создаются:**
- `scaffold/.claude/skills/vibe-decisions/SKILL.md` — двухрежимный skill
- `scaffold/.claude/skills/vibe-decisions/deep-dive-template.md`
- `scaffold/.claude/commands/deeper.md` — slash для подробных объяснений (deep dive)
- `scaffold/.claude/commands/why.md` — explainer без логирования решения
- `scaffold/.claude/commands/decisions.md` — list/show/search через slash
- `scaffold/.claude/commands/canon.md` — slash wrapper над `claudenv canon`
- `scaffold/.claude/commands/just-code.md` — одноразовое подавление vibe overview
- `scaffold/.claude/memories/README.md` — explanation split layout
- `scaffold/global/.claudenv/memories/INDEX.md` — начальный template
- `scaffold/global/.claudenv/memories/canon/index.yaml` — пустой с примером
- `scaffold/global/.claudenv/memories/user/preferences.md.example`

### Python пакет (новый, в `python/`)

**Создаются:**
- `python/pyproject.toml`
- `python/README.md`
- `python/claudenv_memory/__init__.py`
- `python/claudenv_memory/backend.py`
- `python/claudenv_memory/paths.py`
- `python/tests/test_backend.py`

### Tests

`test/{memory,decisions,canon}.test.js`, `test/hooks/{decisions-logger,regen-index}.test.js`, `test/loop-memory-integration.test.js`.

---

## Фазы релиза

### Phase A: Scaffold + Python backend (3-4 дня)

- [ ] `scaffold/.claude/skills/vibe-decisions/SKILL.md` (двухрежимный)
- [ ] `scaffold/.claude/skills/vibe-decisions/deep-dive-template.md`
- [ ] `scaffold/global/.claudenv/memories/` начальные шаблоны
- [ ] `python/` пакет: pyproject.toml + `LocalFileMemoryBackend` + базовые tests
- [ ] Подтвердить через `claude-code-guide` agent: SessionEnd hook stable? memory beta header проходит через Claude Code CLI?

**DoD:** Python модуль импортируется + проходит unit tests; scaffold копируется без ошибок.

### Phase B: Hooks + Node.js dispatcher (2-3 дня)

- [ ] `src/hooks/dispatcher.js` — `claudenv hook <name>` router
- [ ] `src/hooks/decisions-logger.js` — парсинг и роутинг по scope
- [ ] `src/hooks/regen-index.js` — генерация INDEX.md
- [ ] `src/hooks-gen.js` — генерация PostToolUse + SessionEnd конфигов
- [ ] Unit tests для обоих hooks (stdin/stdout contracts)

**DoD:** `echo '<event>' | claudenv hook decisions-logger` корректно роутит в global/project; `claudenv hook regen-index` создаёт валидный INDEX.md.

### Phase C: CLI commands (2-3 дня)

- [ ] `src/memory.js` + `claudenv memory <subcommand>` в `bin/cli.js`
- [ ] `src/decisions.js` + `claudenv decisions <subcommand>`
- [ ] `src/canon.js` + `claudenv canon <subcommand>`
- [ ] `src/doctor.js` + `claudenv doctor`
- [ ] CLI integration tests

**DoD:** `claudenv decisions list` показывает свежие; `claudenv canon add foo https://example "test"` мутирует yaml; `claudenv doctor` печатает status.

### Phase D: Loop integration (1-2 дня)

- [ ] `src/memory-context.js` — `buildSystemPromptWithMemory`
- [ ] `src/loop.js` — env `CLAUDENV_LOOP=1`, append INDEX.md, post-iteration regenIndex
- [ ] `src/installer.js` — установка `vibe-decisions` skill + memory scaffold при `claudenv install`
- [ ] Integration test: loop iteration пишет decision → INDEX.md обновляется → следующая iteration видит в context

**DoD:** запустить `claudenv loop --trust -n 2 --goal "..."`, проверить что (а) `$CLAUDENV_LOOP=1` в env, (б) после первой iteration появилось decision в `~/.claudenv/memories/decisions/`, (в) INDEX.md обновился, (г) вторая iteration в логах упоминает первое decision.

### Phase E: Docs + polish + release (2 дня)

- [ ] README раздел про memory + vibe-decisions + Python модуль
- [ ] Migration note для существующих пользователей 1.2.5 (что появилось, что не сломано)
- [ ] CHANGELOG entry
- [ ] `package.json` version → 1.3.0
- [ ] Tag, npm publish
- [ ] `claudenv-memory` 0.1.0 на pypi
- [ ] Smoke test на одном реальном проекте после установки из npm

**Total:** ~10-14 дней realistic. Один maintainer.

---

## Migration с 1.2.5

Существующие пользователи:

1. `npm i -g claudenv@1.3.0` → CLI обновляется
2. При следующем `claudenv` в проекте — installer спрашивает: "Install vibe-decisions skill + memory hooks? [Y/n]"
3. Если yes — добавляет в `.claude/skills/`, `.claude/memories/`, обновляет `.claude/settings.json` (merge, не overwrite)
4. Если no — 1.3.0 ведёт себя ровно как 1.2.5
5. `~/.claudenv/memories/` создаётся при первом `claudenv memory init` или автоматически при первом `claudenv loop` (если пользователь согласился на skills)

Существующие `.claude/` структуры не трогаются. Pre-existing hooks мерджатся через json-merge (settings.json уже имеет hooks — `decisions-logger` добавляется к существующему PostToolUse массиву).

**`/autonomy` (faee5a5) и vibe-decisions ортогональны.** Первая управляет permission profiles (что Claude *может* делать), вторая — decision logging (какие выборы зафиксированы). Нет overlap в trigger criteria.

**Hook command path.** Installer детектит global install и подставляет `claudenv hook <name>` либо `npx claudenv hook <name>` в settings.json (`hooks-gen.js`: `const cmd = await isGlobalInstall() ? 'claudenv' : 'npx claudenv';`).

---

## Risks & mitigation

| # | Риск | Вероятность | Impact | Mitigation |
|---|---|---|---|---|
| 1 | SessionEnd hook не stable в Claude Code | Средняя | Низкий | Fallback: post-iteration regen в loop.js; interactive пользователь делает manual `claudenv memory index`. Проверка в Phase A. |
| 2 | Two-mode skill не срабатывает (skill не "видит" что он в loop) | Низкая | Средний | Режим переключается через fragment в `--append-system-prompt` (тот же канал что autonomy=law); integration test в Phase D. |
| 3 | autonomy=law нарушается через pause в loop | Низкая | Высокий | Loop инжектит "Vibe-decisions mode (loop)" fragment; integration test проверяет no-pause. |
| 4 | Pre-existing `.claude/settings.json` ломается при merge | Средняя | Высокий | json-merge тестируется на 5+ примерах; installer имеет dry-run preview. |
| 5 | INDEX.md разрастается, ломает cache | Средняя | Средний | Жёсткий лимит 50 строк; rotation через `claudenv decisions archive`. |
| 6 | Python модуль staletes без consumer | Средняя | Средний | README alpha; smoke example в CI; pin `claude-agent-sdk = "~=0.2"`. |

---

Bridge release. Дальше: 1.4 — sync (git+age, см. план 2.0); 2.0 — переписывание loop на Python+SDK (см. [claudenv-update-plan.md](./claudenv-update-plan.md)).
