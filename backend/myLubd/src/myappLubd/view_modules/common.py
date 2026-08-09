import logging

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


logger = logging.getLogger(__name__)
RAW_AUTH_PREFIXES = ('google-oauth2_', 'auth0_', 'auth0|')


class MaintenancePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    page_query_param = 'page'
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page.paginator.per_page
        logger.info(
            f"[Pagination] Page: {self.page.number}, Page Size: {page_size}, "
            f"Total: {self.page.paginator.count}, Total Pages: {self.page.paginator.num_pages}"
        )
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': page_size,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        })


def is_raw_auth_identifier(value):
    if value is None:
        return False
    text = str(value).strip()
    return (
        text.startswith(RAW_AUTH_PREFIXES)
        or text.lower() in {'null', 'undefined', '[object object]'}
    )


def display_name_from_user_values(first_name='', last_name='', email='', username='', fallback='Unknown Technician'):
    full_name = f"{first_name or ''} {last_name or ''}".strip()
    for candidate in (full_name, email, username):
        value = str(candidate or '').strip()
        if value and not is_raw_auth_identifier(value):
            return value
    return fallback


def display_name_from_user(user, fallback='Unknown Technician'):
    if not user:
        return fallback

    profile = getattr(user, 'userprofile', None)
    profile_full_name = getattr(profile, 'full_name', None)
    full_name = user.get_full_name().strip() if hasattr(user, 'get_full_name') else ''
    for candidate in (
        profile_full_name,
        full_name,
        getattr(user, 'email', None),
        getattr(user, 'username', None),
    ):
        value = str(candidate or '').strip()
        if value and not is_raw_auth_identifier(value):
            return value

    return fallback
