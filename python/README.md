# claudenv-memory

> **Status: 0.1.x is alpha.** First production consumer is claudenv 2.0 (`loop` rewrite on Claude Agent SDK). API may change before 1.0. Use at your own risk.

Local file-based memory backend for [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code), companion to the [claudenv](https://github.com/AGoldian/claudenv) Node.js installer.

Implements `BetaAbstractMemoryTool` so Claude can `view` / `create` / `str_replace` / `insert` / `delete` / `rename` virtual paths under `/memories/`, transparently mapped to the same `~/.claudenv/memories/` + per-project `.claude/memories/` layout that the Node.js claudenv uses.

## Install

```bash
pip install claudenv-memory
```

## Usage

```python
from claudenv_memory import LocalFileMemoryBackend
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

backend = LocalFileMemoryBackend(
    # Defaults to ~/.claudenv/memories and ./.claude/memories — pass overrides for tests.
    global_root=None,
    project_root=None,
)

options = ClaudeAgentOptions(
    model="claude-opus-4-7",
    extra_headers={"anthropic-beta": "context-management-2025-06-27"},
    tools=[backend.as_tool()],
)

async with ClaudeSDKClient(options=options) as client:
    async for msg in client.query("Read /memories/INDEX.md and summarize"):
        print(msg)
```

## Path routing

The backend routes virtual `/memories/...` paths to two physical roots:

| Virtual path prefix | Physical location | Use case |
|---|---|---|
| `/memories/decisions/...` | `<global_root>/decisions/...` (default) | global cross-project decisions |
| `/memories/project/...` | `<project_root>/...` | project-scoped memory |
| `/memories/canon/...` | `<global_root>/canon/...` | personal canon |
| `/memories/user/...` | `<global_root>/user/...` | user preferences |
| `/memories/INDEX.md` | `<global_root>/INDEX.md` | session briefing |

`scope: project` in YAML frontmatter is the authoritative scope marker — see SKILL.md for the vibe-decisions skill.

## Development

```bash
pip install -e ".[dev]"
pytest
```

## Why this exists

claudenv 1.3.0 ships a Node.js installer + headless `claudenv loop` based on the Claude Code CLI. It is the *first* claudenv release to surface a Python module — published independently so anyone building on Claude Agent SDK can share the same memory layout. When claudenv 2.0 reimplements `loop` on Python+SDK, it will consume this package.

## License

MIT
