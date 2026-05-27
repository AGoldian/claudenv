"""LocalFileMemoryBackend — file-system backend for the Claude Agent SDK memory tool.

Forwards the six memory operations (view, create, str_replace, insert, delete,
rename) to files under the configured global and project roots.

Status: alpha (0.1.x). The SDK is still rev'ing its memory tool API — at the
time of writing, no stable `BetaAbstractMemoryTool` export exists. This module
ships the file-system implementation as a free-standing class so it works
today; when the SDK lands a stable abstract base class, we'll subclass it and
keep the same method names.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Optional

# Try several plausible import paths for the SDK's memory tool base. None of
# them are guaranteed to exist in the current SDK (~=0.2 alpha). We fall back
# to `object` so the package always loads.
_BaseClass: type = object
_BaseClassSource: str = "object (SDK abstract memory tool not found)"

for _module_path, _class_name in (
    ("claude_agent_sdk", "BetaAbstractMemoryTool"),
    ("claude_agent_sdk.memory", "AbstractMemoryTool"),
    ("claude_agent_sdk.tools.memory", "AbstractMemoryTool"),
    ("claude_agent_sdk.beta", "BetaAbstractMemoryTool"),
):
    try:
        _mod = __import__(_module_path, fromlist=[_class_name])
        _BaseClass = getattr(_mod, _class_name)
        _BaseClassSource = f"{_module_path}.{_class_name}"
        break
    except (ImportError, AttributeError):
        continue


from claudenv_memory.paths import (
    default_global_root,
    default_project_root,
    resolve_memory_path,
)


class LocalFileMemoryBackend(_BaseClass):  # type: ignore[misc, valid-type]
    """File-system backend for the SDK memory tool.

    Maps virtual /memories/... paths to two physical roots:
        global_root  (default: ~/.claudenv/memories/)
        project_root (default: <cwd>/.claude/memories/)

    See paths.resolve_memory_path for the routing rules.

    The base class is whatever the SDK exposes (BetaAbstractMemoryTool or
    AbstractMemoryTool) — see module-level discovery. Falls back to `object`
    if the SDK doesn't ship one yet; in that case the methods below are the
    only contract.
    """

    #: For introspection in tests / `claudenv doctor`: which SDK class (if any)
    #: this backend extends, or `object` if the SDK has no memory tool yet.
    sdk_base_source: str = _BaseClassSource

    def __init__(
        self,
        global_root: Optional[Path] = None,
        project_root: Optional[Path] = None,
    ) -> None:
        if _BaseClass is not object:
            try:
                super().__init__()
            except TypeError:
                # SDK base may require arguments we don't pass. Don't fail —
                # this is alpha and we degrade gracefully.
                pass
        self.global_root = (global_root or default_global_root()).resolve()
        self.project_root = (project_root or default_project_root()).resolve()
        self.global_root.mkdir(parents=True, exist_ok=True)
        # project_root may not exist yet (running outside a project) — don't force it.

    # ----- SDK operations -----

    def view(self, path: str, view_range: Optional[tuple[int, int]] = None) -> str:
        physical, _scope = self._resolve(path)
        if physical.is_dir():
            return "\n".join(sorted(p.name for p in physical.iterdir()))
        text = physical.read_text(encoding="utf-8")
        if view_range is not None:
            start, end = view_range
            lines = text.splitlines()
            text = "\n".join(lines[start - 1 : end])
        return text

    def create(self, path: str, file_text: str) -> None:
        physical, _scope = self._resolve(path)
        physical.parent.mkdir(parents=True, exist_ok=True)
        physical.write_text(file_text, encoding="utf-8")

    def str_replace(self, path: str, old_str: str, new_str: str) -> None:
        physical, _scope = self._resolve(path)
        text = physical.read_text(encoding="utf-8")
        count = text.count(old_str)
        if count == 0:
            raise ValueError(f"old_str not found in {path}")
        if count > 1:
            raise ValueError(f"old_str not unique in {path} (found {count} times)")
        physical.write_text(text.replace(old_str, new_str, 1), encoding="utf-8")

    def insert(self, path: str, insert_line: int, new_str: str) -> None:
        physical, _scope = self._resolve(path)
        lines = physical.read_text(encoding="utf-8").splitlines()
        if insert_line < 0 or insert_line > len(lines):
            raise ValueError(
                f"insert_line {insert_line} out of range for {path} ({len(lines)} lines)"
            )
        lines.insert(insert_line, new_str)
        physical.write_text("\n".join(lines), encoding="utf-8")

    def delete(self, path: str) -> None:
        physical, _scope = self._resolve(path)
        if physical.is_file():
            physical.unlink()
        elif physical.is_dir():
            shutil.rmtree(physical)
        else:
            raise FileNotFoundError(path)

    def rename(self, old_path: str, new_path: str) -> None:
        old_physical, old_scope = self._resolve(old_path)
        new_physical, new_scope = self._resolve(new_path)
        if old_scope != new_scope:
            # Renaming across scopes (global ↔ project) requires explicit user
            # intent — refuse silent moves that may leak project-scoped data.
            raise ValueError(
                f"Refusing to rename across scopes ({old_scope} → {new_scope}). "
                f"Use create+delete if intentional."
            )
        new_physical.parent.mkdir(parents=True, exist_ok=True)
        old_physical.rename(new_physical)

    # ----- helpers -----

    def _resolve(self, virtual_path: str) -> tuple[Path, str]:
        return resolve_memory_path(
            virtual_path,
            global_root=self.global_root,
            project_root=self.project_root,
        )
