from django.apps import AppConfig


class MyapplubdConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'myappLubd'

    def ready(self):
        # Importing the module wires up the @receiver decorators.
        # Failing to import (e.g. circular import during test discovery) is
        # not fatal — the rest of the app still boots.
        try:
            from . import signals  # noqa: F401
        except Exception:  # pragma: no cover - defensive
            import logging
            logging.getLogger(__name__).exception('Failed to wire push signal handlers')
