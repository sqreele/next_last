//app/

"use client";

import { Button } from '@/app/components/ui/button';
import { PaginationProps } from '@/app/lib/types';

function generatePageNumbers(currentPage: number, totalPages: number, maxVisible: number): number[] {
  const pages: number[] = [];
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  let end = Math.min(totalPages, currentPage + half);

  if (end - start + 1 < maxVisible) {
    if (start === 1) {
      end = Math.min(totalPages, start + maxVisible - 1);
    } else if (end === totalPages) {
      start = Math.max(1, end - maxVisible + 1);
    }
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
}

export default function Pagination({ totalPages, currentPage, onPageChange }: PaginationProps) {
  const mobilePages = generatePageNumbers(currentPage, totalPages, 3);
  const desktopPages = generatePageNumbers(currentPage, totalPages, 7);

  return (
    <div className="w-full">
      {/* Mobile Pagination */}
      <div className="md:hidden flex items-center justify-between gap-2 mt-4">
        <Button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          variant="outline"
          className="h-9 px-3"
        >
          Prev
        </Button>

        <div className="flex items-center gap-1">
          {mobilePages.map((page) => (
            <Button
              key={page}
              onClick={() => onPageChange(page)}
              variant={currentPage === page ? 'default' : 'outline'}
              className="h-9 min-w-[2.25rem] px-2"
            >
              {page}
            </Button>
          ))}
        </div>

        <Button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          variant="outline"
          className="h-9 px-3"
        >
          Next
        </Button>
      </div>

      {/* Desktop Pagination */}
      <div className="hidden md:flex justify-center items-center gap-2 mt-8">
        <Button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          variant="outline"
          className="flex items-center gap-1"
        >
          Previous
        </Button>

        <div className="flex items-center gap-1">
          {desktopPages[0] > 1 && (
            <>
              <Button onClick={() => onPageChange(1)} variant={currentPage === 1 ? 'default' : 'outline'} className="min-w-[2.5rem]">
                1
              </Button>
              {desktopPages[0] > 2 && <span className="px-1 text-gray-400">…</span>}
            </>
          )}

          {desktopPages.map((page) => (
            <Button
              key={page}
              onClick={() => onPageChange(page)}
              variant={currentPage === page ? 'default' : 'outline'}
              className="flex items-center justify-center min-w-[2.5rem]"
            >
              {page}
            </Button>
          ))}

          {desktopPages[desktopPages.length - 1] < totalPages && (
            <>
              {desktopPages[desktopPages.length - 1] < totalPages - 1 && (
                <span className="px-1 text-gray-400">…</span>
              )}
              <Button onClick={() => onPageChange(totalPages)} variant={currentPage === totalPages ? 'default' : 'outline'} className="min-w-[2.5rem]">
                {totalPages}
              </Button>
            </>
          )}
        </div>

        <Button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          variant="outline"
          className="flex items-center gap-1"
        >
          Next
        </Button>
      </div>
    </div>
  );
}