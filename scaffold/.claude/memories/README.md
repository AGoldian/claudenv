# Project memories

This directory holds **project-scoped** memory for `vibe-decisions` and related skills. Cross-project memory lives in `~/.claudenv/memories/`.

## Layout

```
.claude/memories/
├── project.md           # стек, конвенции, важные urls — заполняешь вручную
├── decisions/           # project-specific tech decisions (committed to repo)
│   └── 2026-05-27-auth-jwt.md
└── README.md            # this file
```

## When goes here vs `~/.claudenv/memories/`

- **Здесь (project)**: выбор специфичен этому проекту — внутренний сервис, формат API, deployment target, project-only convention
- **В `~/.claudenv/memories/decisions/` (global)**: универсальный tech-выбор — какая БД, какой algo, который применим в любом проекте

Skill `vibe-decisions` решает scope автоматически по полю `scope: global|project` в frontmatter. По умолчанию `global` если непонятно.

## project.md шаблон

Создай этот файл вручную (claudenv не генерит автоматически):

```markdown
# <project-name>

- **Stack:** Python 3.12, FastAPI, Postgres, Redis
- **Tests:** `pytest -m "not slow"` локально; CI запускает всё
- **Package manager:** uv (NOT pip, NOT poetry)
- **Линтеры:** ruff + mypy strict
- **Deploy:** GitHub Actions → ArgoCD → k8s
- **Внутренние ADR:** `docs/adr/`
- **Слаг для decisions/:** `<project-slug>`
```

`vibe-decisions` читает project.md перед каждым нетривиальным выбором.

## Commit policy

- `project.md` — committed
- `decisions/*.md` — committed (это shared с командой)
- Никаких secrets (production endpoints, API keys, internal hostnames) — для них используй `~/.claudenv/memories/` с глобальным scope (выйдет за пределы repo)
