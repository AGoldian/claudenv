---
name: source-connector
description: |
  Trigger when the user wants to connect to a data source that has no ready
  MCP server - internal SQL/DWH behind VPN, corporate wiki (Confluence),
  Redash, YouTrack, a custom REST API - or says "добавь источник",
  "подключись к <система>", "/add-source". The skill interviews the user,
  generates a working connector script, stores credentials in .env.local
  (gitignored, never in memory), and caches connector knowledge (params +
  provenance) in the ACTIVE workspace memory, isolated from other workspaces.
  Do NOT trigger for sources that already have an MCP server (prefer MCP),
  or for trivial local file reads.
---

# Source connector

Создаёт коннектор к источнику данных без готового MCP: внутренний SQL/DWH,
корпоративная вики, Redash, YouTrack, самописный REST. Опрашивает юзера,
генерирует рабочий скрипт, кладёт секреты в `.env.local`, кэширует знание о
коннекторе (параметры + provenance) в память АКТИВНОГО workspace.

## Step 0 - Workspace resolution (FIRST, every time)

Память изолирована по пространствам (workspaces). Прежде чем что-либо писать:

1. Определи активный workspace:
   - env `CLAUDENV_WORKSPACE`, иначе файл `~/.claudenv/active-workspace`.
   - если есть `claudenv` CLI: `claudenv workspace show`.
2. Если активного нет - предложи выбрать из `~/.claudenv/workspaces/` или создать
   новый. НИКОГДА не подтягивай и не пиши в «глобальную» память доступы/коннекторы.
3. Все записи коннектора пиши ТОЛЬКО в активный workspace:
   `~/.claudenv/workspaces/<id>/memories/connectors/`.
4. НИКОГДА не читай чужие workspaces - это барьер от ликов между компаниями.

## Security invariants (нарушать нельзя)

- **Секреты (пароли, токены, ключи) - только в `<project>/.env.local`** и только
  значениями там. Убедись, что `.env.local` есть в `.gitignore` (добавь, если нет).
- **В память коннектора - НИКОГДА значения секретов.** Только `secret_refs` -
  имена переменных из `.env.local`.
- **Не эхай секреты** в вывод/логи/коммиты.
- Память активного workspace изолирована: не смешивай контекст разных компаний.

## Trigger criteria

Триггерь, если юзеру нужно регулярно/программно ходить в источник:
- БД (MSSQL/Postgres/ClickHouse), DWH за VPN
- корпоративная вики (Confluence), Redash, YouTrack, Grafana
- самописный REST/GraphQL API

НЕ триггерь:
- если для источника есть MCP-сервер - предложи MCP (см. ниже)
- разовое чтение локального файла
- источник уже подключён (тогда это обновление, см. Step 6)

## Step 1 - MCP vs connector

Сначала проверь, нет ли готового MCP для источника (claudenv умеет настраивать MCP
в `.mcp.json`). Если есть - предложи MCP-путь. Коннектор - для источников БЕЗ MCP.

## Step 2 - Interview (спроси у юзера, кратко)

Собери минимум для подключения:
- тип источника (mssql / postgres / clickhouse / rest / confluence / redash / youtrack)
- хост и порт, база/endpoint
- метод аутентификации (sql login / domain / token / trusted)
- что нужно достать (таблицы/эндпоинты) - для первого запроса
- как зовутся переменные кред в `.env.local` (или предложи имена)

Не выдумывай параметры - спрашивай. Если юзер уже дал часть (вики/git/переписка) -
зафиксируй это в provenance.

## Step 3 - Generate connector script

Сгенерируй рабочий скрипт из шаблона (`templates/connector-*.ejs`):
- MSSQL -> pymssql/pyodbc, строка `mssql+pymssql://{user}:{pwd}@{host}:{port}/{db}`
  (СУЗ - логин без домена; экранируй пароль через urllib `quote_plus`).
- REST -> requests + Bearer-токен из env.
Скрипт читает креды из `.env.local` (через env), не хардкодит.

## Step 4 - Secrets to .env.local

- Запиши значения в `<project>/.env.local` (создай при отсутствии).
- Проверь/добавь `.env.local` в `.gitignore`.
- В память пойдут только имена этих переменных (`secret_refs`).

## Step 5 - Write connector record (в активный workspace)

Создай `~/.claudenv/workspaces/<id>/memories/connectors/<name>.md`:

```markdown
---
name: <name>
type: <mssql|rest|...>
status: <draft|working|blocked>
host: <host>
database: <db|->
port: <port|->
auth: <sql|domain|token|trusted>
secret_refs: {user: <ENV_VAR>, password: <ENV_VAR>}   # ИМЕНА, не значения
connector_script: <path в проекте>
provenance:                                            # откуда собрана инфа
  - {source: <wiki|git|chat|docs>, ref: <url|путь>, note: <кратко>}
verified_at: <YYYY-MM-DD|->
updated_at: <YYYY-MM-DD>
---

Детали: как устроено подключение, что блокирует, как обновлять.
```

**Provenance обязателен** - фиксируй, откуда взял каждый факт (вики-страница, файл
в git, сообщение в чате). Это позволяет потом перепроверить и обновить.

## Step 6 - Test and iterate

Протестируй подключение, если возможно. Зафиксируй `status` и `verified_at`.
При ошибке - запиши симптом в запись (раздел деталей) и предложи следующий шаг.

## Step 7 - Updating an existing connector

Если коннектор уже есть в активном workspace:
- найди запись, обнови `status`/`host`/`secret_refs`, допиши `provenance`,
  обнови `updated_at`. Запись - единый источник правды по коннектору.

## После создания

Предложи дальнейшую автоматизацию через коннектор (регулярная выгрузка, отчёт,
интеграция в пайплайн). Язык общения - русский.
