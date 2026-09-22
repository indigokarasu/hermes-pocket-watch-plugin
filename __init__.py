"""Directory-plugin entry point for Pocket Watch.

Pocket Watch contributes no agent-facing tools or hooks: its surface is the
dashboard pane, mounted from ``dashboard/manifest.json`` independently of this
file. Hermes loads a directory plugin through ``__init__.py``, so this module
exists to give the plugin a loadable entry point, and ``register`` is
deliberately a no-op.
"""


def register(ctx) -> None:
    """No-op — Pocket Watch's surface is the dashboard pane, not tools/hooks."""
