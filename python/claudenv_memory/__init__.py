"""Local file-based memory backend for Claude Agent SDK.

See README.md for usage. Status: 0.1.x is alpha — API may change before 1.0.
"""

from claudenv_memory.backend import LocalFileMemoryBackend
from claudenv_memory.paths import default_global_root, default_project_root, resolve_memory_path

__version__ = "0.1.0"

__all__ = [
    "LocalFileMemoryBackend",
    "default_global_root",
    "default_project_root",
    "resolve_memory_path",
    "__version__",
]
