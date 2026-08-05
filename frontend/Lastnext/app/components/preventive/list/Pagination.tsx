'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type PageToken = number | 'ellipsis';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange
}: PaginationProps) {
  const safeTotalCount = Math.max(0, totalCount);
  const safePageSize = Math.max(1, pageSize);
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safeTotalPages));
  const startItem = safeTotalCount === 0 ? 0 : (safeCurrentPage - 1) * safePageSize + 1;
  const endItem = Math.min(safeCurrentPage * safePageSize, safeTotalCount);

  const handlePageChange = (page: number) => {
    const nextPage = Math.max(1, Math.min(page, safeTotalPages));
    if (nextPage !== safeCurrentPage) {
      onPageChange(nextPage);
    }
  };

  const pageSizeSelect = (className: string) => (
    <select
      value={safePageSize}
      onChange={(e) => onPageSizeChange(Number(e.target.value))}
      className={className}
      aria-label="Rows per page"
    >
      <option value={10}>10 per page</option>
      <option value={25}>25 per page</option>
      <option value={50}>50 per page</option>
    </select>
  );

  return (
    <>
      {/* Mobile Pagination */}
      <div className="md:hidden bg-white border-t border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-600" aria-live="polite">
            {startItem}-{endItem} of {safeTotalCount}
          </span>
          {pageSizeSelect('px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500')}
        </div>
        
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handlePageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
            className="flex items-center px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </button>
          
          <div className="flex items-center space-x-1" aria-label="Page numbers">
            {generatePageTokens(safeCurrentPage, safeTotalPages, 5).map((pageToken, index) => (
              pageToken === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  className="min-w-[32px] text-center text-sm text-gray-500"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={pageToken}
                  onClick={() => handlePageChange(pageToken)}
                  aria-current={safeCurrentPage === pageToken ? 'page' : undefined}
                  className={`min-w-[44px] h-[44px] text-sm rounded-lg transition-colors ${
                    safeCurrentPage === pageToken
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {pageToken}
                </button>
              )
            ))}
          </div>
          
          <button
            onClick={() => handlePageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage === safeTotalPages}
            className="flex items-center px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            aria-label="Go to next page"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </button>
        </div>
      </div>

      {/* Desktop Pagination */}
      <div className="hidden md:flex items-center justify-between px-6 py-4 bg-white border border-gray-200 rounded-lg mt-6">
        <div className="flex items-center text-sm text-gray-600">
          <span aria-live="polite">
            Showing {startItem} to {endItem} of {safeTotalCount} results
          </span>
          {pageSizeSelect('ml-4 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500')}
        </div>
        
        <div className="flex items-center space-x-1" aria-label="Page numbers">
          <button
            onClick={() => handlePageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
            className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          {generatePageTokens(safeCurrentPage, safeTotalPages, 7).map((pageToken, index) => (
            pageToken === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-2 text-sm text-gray-500"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={pageToken}
                onClick={() => handlePageChange(pageToken)}
                aria-current={safeCurrentPage === pageToken ? 'page' : undefined}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  safeCurrentPage === pageToken
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {pageToken}
              </button>
            )
          ))}
          
          <button
            onClick={() => handlePageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage === safeTotalPages}
            className="p-2 text-gray-600 hover:text-gray-900 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Go to next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

// Utility function to generate page numbers with stable first/last links.
function generatePageTokens(currentPage: number, totalPages: number, maxVisible: number): PageToken[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const innerSlots = Math.max(1, maxVisible - 2);
  const half = Math.floor(innerSlots / 2);
  let start = Math.max(2, currentPage - half);
  let end = Math.min(totalPages - 1, start + innerSlots - 1);

  if (end - start + 1 < innerSlots) {
    start = Math.max(2, end - innerSlots + 1);
  }

  const pages: PageToken[] = [1];
  if (start > 2) pages.push('ellipsis');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);

  return pages;
}
