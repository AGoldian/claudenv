"""Smoke example: instantiate LocalFileMemoryBackend with Claude Agent SDK.

This is a minimal "does it wire up?" check for the alpha 0.1.x release.
It is NOT a full integration test — it does not call the real API.

Run with: python examples/loop_example.py
Run in CI with: ANTHROPIC_API_KEY=stub-key python examples/loop_example.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path


def main() -> int:
    # Use a temp directory so we don't pollute ~/.claudenv during smoke.
    with tempfile.TemporaryDirectory() as tmpdir:
        global_root = Path(tmpdir) / "global"
        project_root = Path(tmpdir) / "project"
        project_root.mkdir(parents=True)

        try:
            from claudenv_memory import LocalFileMemoryBackend
        except ImportError as exc:
            print(f"FAIL: cannot import claudenv_memory: {exc}", file=sys.stderr)
            return 2

        backend = LocalFileMemoryBackend(
            global_root=global_root,
            project_root=project_root,
        )

        # Round-trip the six operations.
        backend.create("/memories/INDEX.md", "hello\nline two\nline three")
        assert backend.view("/memories/INDEX.md").startswith("hello"), "view failed"
        backend.str_replace("/memories/INDEX.md", "hello", "HELLO")
        assert backend.view("/memories/INDEX.md").startswith("HELLO"), "str_replace failed"
        backend.insert("/memories/INDEX.md", 1, "inserted")
        backend.rename("/memories/INDEX.md", "/memories/RENAMED.md")
        backend.delete("/memories/RENAMED.md")

        # Report what SDK base the backend extends (alpha drift visibility).
        print(f"OK: backend sdk_base_source = {backend.sdk_base_source}")

        # Try wiring to the SDK options object if the SDK is installed.
        # `extra_headers` is the canonical way to pass the memory beta header
        # when it is supported. If the current SDK rev doesn't accept that
        # kwarg yet, we still consider the smoke passing — backend itself works.
        try:
            from claude_agent_sdk import ClaudeAgentOptions  # type: ignore[import-not-found]
        except ImportError:
            print(
                "SKIP: claude-agent-sdk not installed — backend operations succeeded "
                "but SDK wiring not validated.",
                file=sys.stderr,
            )
            return 0

        for kwargs in (
            {"model": "claude-haiku-4-5-20251001",
             "extra_headers": {"anthropic-beta": "context-management-2025-06-27"}},
            {"model": "claude-haiku-4-5-20251001"},  # fallback if extra_headers unsupported
        ):
            try:
                ClaudeAgentOptions(**kwargs)
                print(f"OK: ClaudeAgentOptions constructed with keys {list(kwargs)}")
                break
            except TypeError as exc:
                print(f"SKIP: ClaudeAgentOptions rejected {list(kwargs)} — {exc}",
                      file=sys.stderr)
        else:
            print("WARN: ClaudeAgentOptions could not be constructed at all "
                  "(unexpected — backend smoke still passed)", file=sys.stderr)

        print("OK: claudenv_memory smoke complete")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
