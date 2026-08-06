// app/dashboard/search/page.tsx
import { Suspense } from "react";
import SearchContent from "./SearchContent";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-blue-600"></div>
            <p className="text-muted-foreground">Loading search results...</p>
          </div>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
