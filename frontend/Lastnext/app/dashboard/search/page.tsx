// app/dashboard/search/page.tsx
import { Suspense } from "react";
import SearchContent from "./SearchContent";
import { PageLoadingFrame, SkeletonList } from "@/app/components/ui/loading";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <PageLoadingFrame
          className="w-full max-w-none px-3 py-6 sm:px-6"
          role="status"
          aria-busy="true"
          aria-label="Loading search results"
        >
          <div className="w-full max-w-none">
            <SkeletonList rows={5} />
          </div>
        </PageLoadingFrame>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
