"""Tests for path resolution (no SDK dependency required)."""

from __future__ import annotations

from pathlib import Path

import pytest

from claudenv_memory.paths import resolve_memory_path


def test_global_decision_path(tmp_path: Path) -> None:
    global_root = tmp_path / "global"
    project_root = tmp_path / "project"
    global_root.mkdir()
    project_root.mkdir()

    physical, scope = resolve_memory_path(
        "/memories/decisions/2026-05-27-foo.md",
        global_root=global_root,
        project_root=project_root,
    )
    assert scope == "global"
    assert physical == (global_root / "decisions" / "2026-05-27-foo.md").resolve()


def test_project_path(tmp_path: Path) -> None:
    global_root = tmp_path / "global"
    project_root = tmp_path / "project"
    global_root.mkdir()
    project_root.mkdir()

    physical, scope = resolve_memory_path(
        "/memories/project/decisions/2026-05-27-bar.md",
        global_root=global_root,
        project_root=project_root,
    )
    assert scope == "project"
    assert physical == (project_root / "decisions" / "2026-05-27-bar.md").resolve()


def test_root_view(tmp_path: Path) -> None:
    global_root = tmp_path / "global"
    project_root = tmp_path / "project"
    global_root.mkdir()
    project_root.mkdir()

    physical, scope = resolve_memory_path(
        "/memories",
        global_root=global_root,
        project_root=project_root,
    )
    assert scope == "global"
    assert physical == global_root


def test_rejects_traversal(tmp_path: Path) -> None:
    global_root = tmp_path / "global"
    project_root = tmp_path / "project"
    global_root.mkdir()
    project_root.mkdir()

    with pytest.raises(ValueError, match="escapes root"):
        resolve_memory_path(
            "/memories/../../etc/passwd",
            global_root=global_root,
            project_root=project_root,
        )


def test_rejects_non_memories_prefix(tmp_path: Path) -> None:
    global_root = tmp_path / "global"
    project_root = tmp_path / "project"
    global_root.mkdir()
    project_root.mkdir()

    with pytest.raises(ValueError, match="must start with"):
        resolve_memory_path(
            "/etc/passwd",
            global_root=global_root,
            project_root=project_root,
        )
