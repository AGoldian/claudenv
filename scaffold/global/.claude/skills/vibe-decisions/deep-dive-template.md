# Deep dive template

Used by the `vibe-decisions` skill when the user requests `/deeper` or asks "расскажи подробнее", "X vs Y?", "trade-offs?".

Fill each section concretely against the current task — generic prose is the failure mode here.

## 1. Концептуально (3-5 строк)

What this approach is and what problem it solves. Mention the canonical name and 1-2 alternatives by name (so the reader can search later). Avoid marketing language.

## 2. Как работает (5-10 строк, опц. code sketch)

A simplified mental model. If a 10-15 line code sketch clarifies the mechanism, include it. Otherwise prose. Mention 1-2 invariants that matter — what the approach guarantees and what it explicitly does not.

## 3. Варианты реализации (2-3)

For each variant:

### Variant N — <name>

```<lang>
# minimal sketch, 5-15 lines
```

**Когда подходит:** <one line>
**Когда не подходит:** <one line>

## 4. Канон (2-4 ссылки)

Priority: matches from `~/.claudenv/memories/canon/index.yaml` by topic. If no match, WebSearch and propose `claudenv canon add` after the response.

Format each entry:

- **<title>** — <author or venue> — <1 line why>
  <url>

## After deep dive

In AUTO-LOG mode: update the existing decision file to set `deep_dive_done: yes` and append source URLs to `sources_consulted`.

In INTERACTIVE mode: ask the user "Принимаем этот подход?" before writing/updating the decision file.
