import logging

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


logger = logging.getLogger(__name__)


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

