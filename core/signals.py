# core/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.apps import apps
from django.db.utils import OperationalError, ProgrammingError

@receiver(post_save, sender=User)
def create_profile(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        UserProfile = apps.get_model("core", "UserProfile")
        UserProfile.objects.get_or_create(
            user=instance,
            defaults={"role": "ADMIN" if instance.is_staff else "CLIENT"},
        )
    except (OperationalError, ProgrammingError):
        # Tabela ainda não criada durante migrações iniciais
        pass
