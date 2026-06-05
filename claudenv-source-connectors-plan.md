# План: Source Connectors + Workspace Memory Isolation

Статус: черновик на согласование. Ветка `feature/source-connectors`.

## 1. Цель

Дать claudenv возможность:
1. **Предлагать и создавать коннекторы** к источникам данных (внутренний SQL, REST API, корп-вики, Redash, YouTrack и т.п.) — Claude опрашивает юзера, генерирует рабочий скрипт, тестирует, и дальше помогает автоматизировать работу через него.
2. **Кэшировать знание о коннекторе в памяти** — параметры подключения + **provenance** (откуда собрана инфа: вики, git, переписка), с возможностью **обновлять**.
3. **Изолировать память по пространствам (workspaces)** — на одном устройстве несколько компаний/контекстов; контекст и коннекторы одного НЕ видны и НЕ текут в другой.

Мотивация: ровно этот опыт уже был получен вручную (коннекторы adwh/pymssql, YouTrack, Confluence-вики, Redash) — фича формализует и делает повторяемым то, что Claude уже умеет делать в диалоге.

## 2. Позиционирование (vs существующий MCP)

claudenv уже детектит и настраивает MCP-серверы (`.mcp.json`). Коннекторы **дополняют**, а не заменяют MCP:
- **MCP** — когда для источника есть готовый MCP-сервер.
- **Коннектор** — для источников БЕЗ MCP: внутренний SQL за VPN, корпоративная вики, Redash, самописные REST. Подключается скриптом + креды в `.env.local`.

Skill сначала проверяет, нет ли подходящего MCP; коннектор — это скриптовый путь, когда MCP недоступен.

## 3. Архитектура памяти: 3 уровня + изоляция

```
~/.claudenv/
  memories/
    user/                     # УРОВЕНЬ 1 — личное, нейтральное. Видно везде.
      preferences.md          #   стиль, предпочтения. БЕЗ доступов/секретов/имён компаний.
    canon/                    #   личные ссылки (нейтральные)
  workspaces/                 # УРОВЕНЬ 2 — изолированные пространства
    <workspace-id>/
      workspace.yaml          #   манифест: name, description, project paths/globs
      memories/
        connectors/<name>.md  #   записи коннекторов (метаданные + provenance, БЕЗ секретов)
        context/*.md          #   бизнес-контекст пространства
      .gitignore
  active-workspace            # указатель на активный (или per-shell env CLAUDENV_WORKSPACE)

<project>/.claude/
  memories/                   # УРОВЕНЬ 3 — память репозитория
  .env.local                  # СЕКРЕТЫ (gitignored) — ТОЛЬКО здесь
```

Видимость уровней при сборке контекста:
- **user** — всегда (нейтральное, без доступов).
- **workspace** — ТОЛЬКО активный.
- **project** — ТОЛЬКО текущий репозиторий.

Никогда не загружаются все workspaces разом. Сборка контекста читает строго `user + active workspace + current project`.

## 4. Security-инварианты (изоляция — фундамент, не опция)

1. **Секреты только в `.env.local`** проекта (gitignored). В память — НИКОГДА значения, только `secret_refs` (имена env-переменных).
2. **Физическое разделение workspaces** по директориям. Загрузчик контекста читает только активный workspace; нет API «прочитать все коннекторы устройства».
3. **Привязка проект→workspace** по пути (workspace.yaml: paths/globs) либо явным `claudenv workspace use`. Проект не может случайно подтянуть чужой workspace.
4. **user-уровень нейтрален**: туда нельзя писать доступы, имена компаний, хосты. Только личные предпочтения/стиль.
5. **doctor-lint на лики**: проверка, что в `memories/` нет похожего на секрет (пароли/токены/ключи), что `.env.local` в `.gitignore`, что коннектор-записи не содержат значений секретов.
6. **Переключение workspace явное** и пересобирает контекст. По умолчанию — если проект не привязан, спросить, а не подтягивать глобально.

## 5. Формат записи коннектора (provenance + обновляемость)

`workspaces/<id>/memories/connectors/<name>.md`:

```markdown
---
name: adwh-uksstat
type: mssql                 # mssql | postgres | rest | confluence | redash | youtrack | ...
status: blocked             # working | blocked | draft
host: adwh                  # без секретов
database: UKSSTAT
port: 1433
auth: sql                   # sql | domain | token | trusted
secret_refs:                # ИМЕНА env-переменных в .env.local, НЕ значения
  user: adwh_login
  password: adwh_password
connector_script: read_adwh_tables.py
provenance:                 # откуда собрана инфа (то, что важно сохранять)
  - {source: wiki,  ref: "https://wiki.../pageId=...", note: "метод pymssql"}
  - {source: git,   ref: "pilgrim-cronjobs/sql_utils.py"}
  - {source: chat,  ref: "Юра: mssql://login:pass@adwh:1433"}
verified_at: 2026-06-05
updated_at: 2026-06-05
---

Свободный текст: детали, история попыток, что блокирует, как обновлять.
```

Обновляемость: при новых находках Claude/CLI дописывает `provenance`, меняет `status`, обновляет `updated_at`. Запись — единый источник правды по коннектору в рамках workspace.

## 6. Skill `source-connector` (ядро — поведение Claude)

Триггеры: «подключись к…», «добавь источник», `/add-source`, упоминание БД/API/вики, к которым нужен доступ.

Шаги:
1. Определить активный workspace (нет → предложить выбрать/создать; не подтягивать глобально).
2. Проверить, нет ли MCP-пути для источника (тогда предложить MCP).
3. Опросить юзера: тип источника, хост, БД/endpoint, метод auth, что нужно достать.
4. Сгенерировать коннектор-скрипт из шаблона.
5. Секреты → `.env.local` (+ убедиться, что в `.gitignore`); в память — только `secret_refs`.
6. Записать/обновить запись коннектора в активном workspace с **provenance**.
7. Протестировать подключение, если возможно; зафиксировать `status`/`verified_at`.
8. Предложить дальнейшую автоматизацию через коннектор.

Инварианты в самом skill: писать только в активный workspace; никогда не читать чужие; секреты только в `.env.local`; язык — русский (как `canon.md`).

## 7. CLI (идиоматично, как canon/memory)

- `claudenv workspace add|list|use|show` — управление пространствами.
- `claudenv source add|list|update|test` — коннекторы активного workspace.
- `claudenv doctor` — расширить lint'ом на лики секретов и проверкой изоляции.

## 8. Шаблоны коннекторов (`templates/`)

- `connector-mssql.ejs` — pymssql/pyodbc (паттерн `mssql+pymssql://...@host/db`, secret_refs из env).
- `connector-rest.ejs` — REST с Bearer-токеном.
- расширяемо (postgres, confluence, redash, youtrack).

## 9. Фазы реализации

- **Фаза 1 (MVP, skill-first):** модель workspace-памяти (директории + workspace.yaml + формат записи коннектора), skill `source-connector`, `/add-source`, 2 шаблона (mssql, rest). Без полного CLI.
- **Фаза 2:** CLI `workspace` + `source` (add/list/use/show), doctor-lint на лики/изоляцию, vitest-тесты.
- **Фаза 3:** миграция текущей global-памяти на workspace-модель, доп. шаблоны, индексация/обновление provenance.

## 10. Решения по развилкам (согласовано)

1. **Привязка проект→workspace:** авто по пути — `workspace.yaml` содержит `paths` (globs); плюс явный `claudenv workspace use <id>` как override. Если проект не привязан — спросить, не подтягивать глобально.
2. **Активный workspace:** приоритет — env `CLAUDENV_WORKSPACE`; fallback — файл-указатель `~/.claudenv/active-workspace`. (env удобен для параллельных терминалов с разными компаниями.)
3. **Совместимость с 1.3.0:** workspace-слой ПОВЕРХ существующего, без ломки. Текущая `~/.claudenv/memories/` остаётся; добавляются `user/` и `workspaces/`. Миграция — отдельной Фазой 3, опционально.
4. **Уровень company:** не вводим — `workspace = компания/контекст` достаточно для MVP.
