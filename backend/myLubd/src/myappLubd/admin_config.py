from django.contrib.admin.apps import AdminConfig


class PropertyAdminConfig(AdminConfig):
    default_site = 'myappLubd.admin_site.PropertyAdminSite'
