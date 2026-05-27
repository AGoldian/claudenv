"""Tests for LocalFileMemoryBackend.

These tests stub out claude-agent-sdk so they pass without the SDK installed.
Real integration is covered by `examples/loop_example.py` smoke test.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _stub_sdk(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace claude_agent_sdk.BetaAbstractMemoryTool with a minimal stub.

    Backend.py defers to the SDK class as its base. For unit tests we don't need
    the real one — a `class BetaAbstractMemoryTool: pass` is enough so the
    subclass can be instantiated.
    """
    if "claude_agent_sdk" in sys.modules:
        return  # real SDK installed — let the real class be used

    stub = types.ModuleType("claude_agent_sdk")

    class BetaAbstractMemoryTool:
        pass

    stub.BetaAbstractMemoryTool = BetaAbstractMemoryTool  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "claude_agent_sdk", stub)

    # Re-import backend so it picks up the stub
    if "claudenv_memory.backend" in sys.modules:
        del sys.modules["claudenv_memory.backend"]
    if "claudenv_memory" in sys.modules:
        # Force re-import of the package
        del sys.modules["claudenv_memory"]


def _make_backend(tmp_path: Path):
    from claudenv_memory.backend import LocalFileMemoryBackend  # late import after stub

    global_root = tmp_path / "global"
    project_root = tmp_path / "project"
    project_root.mkdir()
    return LocalFileMemoryBackend(global_root=global_root, project_root=project_root)


def test_create_and_view(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/INDEX.md", "hello world\nline two")

    assert backend.view("/memories/INDEX.md") == "hello world\nline two"
    assert backend.view("/memories/INDEX.md", view_range=(1, 1)) == "hello world"


def test_view_directory(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/decisions/a.md", "a")
    backend.create("/memories/decisions/b.md", "b")

    listing = backend.view("/memories/decisions/")
    assert "a.md" in listing
    assert "b.md" in listing


def test_str_replace(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/foo.md", "alpha bravo charlie")
    backend.str_replace("/memories/foo.md", "bravo", "BRAVO")
    assert backend.view("/memories/foo.md") == "alpha BRAVO charlie"


def test_str_replace_rejects_ambiguous(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/foo.md", "x x x")
    with pytest.raises(ValueError, match="not unique"):
        backend.str_replace("/memories/foo.md", "x", "y")


def test_insert(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/foo.md", "line1\nline2\nline3")
    backend.insert("/memories/foo.md", 1, "inserted")
    assert backend.view("/memories/foo.md") == "line1\ninserted\nline2\nline3"


def test_delete_file(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/foo.md", "x")
    backend.delete("/memories/foo.md")
    with pytest.raises(FileNotFoundError):
        backend.view("/memories/foo.md")


def test_rename_within_scope(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/decisions/a.md", "content")
    backend.rename("/memories/decisions/a.md", "/memories/decisions/b.md")
    assert backend.view("/memories/decisions/b.md") == "content"


def test_rename_across_scopes_refused(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/decisions/a.md", "content")
    with pytest.raises(ValueError, match="across scopes"):
        backend.rename("/memories/decisions/a.md", "/memories/project/decisions/a.md")


def test_project_scope_isolation(tmp_path: Path) -> None:
    backend = _make_backend(tmp_path)
    backend.create("/memories/project/notes.md", "project-only")
    backend.create("/memories/notes.md", "global")

    assert backend.view("/memories/project/notes.md") == "project-only"
    assert backend.view("/memories/notes.md") == "global"
