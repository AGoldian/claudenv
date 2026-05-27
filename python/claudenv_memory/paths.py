"""Resolve virtual /memories/... paths to physical locations.

Virtual layout (what Claude sees):

    /memories/
        INDEX.md
        decisions/
        canon/
        user/
        project/         <- maps to per-project .claude/memories/

Physical layout:

    ~/.claudenv/memories/    (default global_root)
        INDEX.md
        decisions/
        canon/
        user/

    <cwd>/.claude/memories/  (default project_root)
        project.md
        decisions/
        README.md
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, Optional, Tuple

_VIRTUAL_PREFIX: Final[str] = "/memories/"
_PROJECT_SUBPREFIX: Final[str] = "project/"


def default_global_root() -> Path:
    """Return ~/.claudenv/memories (does not create it)."""
    return Path.home() / ".claudenv" / "memories"


def default_project_root(cwd: Optional[Path] = None) -> Path:
    """Return <cwd>/.claude/memories (does not create it)."""
    base = cwd if cwd is not None else Path.cwd()
    return base / ".claude" / "memories"


def resolve_memory_path(
    virtual_path: str,
    *,
    global_root: Path,
    project_root: Path,
) -> Tuple[Path, str]:
    """Resolve a virtual /memories/... path to a physical Path.

    Returns (physical_path, scope) where scope is "global" or "project".

    Raises ValueError if the path does not start with /memories/ or escapes via ../.
    """
    if not virtual_path.startswith(_VIRTUAL_PREFIX) and virtual_path != "/memories":
        raise ValueError(
            f"Path must start with {_VIRTUAL_PREFIX!r} (got {virtual_path!r})"
        )

    if virtual_path == "/memories":
        # Directory view of the root → global root (canonical entry point).
        return global_root, "global"

    relative = virtual_path[len(_VIRTUAL_PREFIX):]

    if relative.startswith(_PROJECT_SUBPREFIX):
        sub = relative[len(_PROJECT_SUBPREFIX):]
        physical = (project_root / sub).resolve()
        _ensure_within(physical, project_root.resolve())
        return physical, "project"

    physical = (global_root / relative).resolve()
    _ensure_within(physical, global_root.resolve())
    return physical, "global"


def _ensure_within(physical: Path, root: Path) -> None:
    """Reject paths that escape the configured root via ../ traversal."""
    try:
        physical.relative_to(root)
    except ValueError as exc:
        raise ValueError(
            f"Path {physical} escapes root {root} — refusing"
        ) from exc
