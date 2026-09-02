// app/dashboard/search/page.tsx
import { Suspense } from "react";
import SearchContent from "./SearchContent";
import { SkeletonList } from "@/app/components/ui/loading";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading search results">
          <SkeletonList rows={5} />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
