import * as React from "react";

import { cn } from "@/app/lib/utils/cn";

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  /**
   * When true, on mobile the table renders each row as a stacked card
   * (using th text as labels) instead of a horizontally scrolling table.
   */
  mobileCards?: boolean;
};

const TableMobileCardsContext = React.createContext(false);

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, mobileCards = false, ...props }, ref) => (
    <TableMobileCardsContext.Provider value={mobileCards}>
      <div
        className={cn(
          "relative w-full rounded-[var(--pcms-radius)] border border-[var(--pcms-border)] bg-white/95 shadow-[var(--pcms-shadow-sm)]",
          mobileCards
            ? "overflow-visible mobile:border-0 mobile:bg-transparent mobile:shadow-none"
            : "overflow-x-auto",
        )}
      >
        <table
          ref={ref}
          className={cn(
            "w-full min-w-[720px] caption-bottom text-sm",
            mobileCards &&
              "mobile:block mobile:min-w-0 mobile:[&_thead]:hidden mobile:[&_tbody]:block mobile:[&_tfoot]:block",
            className,
          )}
          {...props}
        />
      </div>
    </TableMobileCardsContext.Provider>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("bg-[var(--pcms-surface-soft)] [&_tr]:border-b", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
  const mobileCards = React.useContext(TableMobileCardsContext);
  return (
    <tbody
      ref={ref}
      className={cn(
        "[&_tr:last-child]:border-0",
        mobileCards && "mobile:space-y-2",
        className,
      )}
      {...props}
    />
  );
});
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => {
  const mobileCards = React.useContext(TableMobileCardsContext);
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-[var(--pcms-border)] transition-colors hover:bg-[var(--pcms-primary-soft)] data-[state=selected]:bg-[var(--pcms-primary-soft)]",
        mobileCards &&
          "mobile:mb-3 mobile:flex mobile:flex-col mobile:gap-2 mobile:rounded-2xl mobile:border mobile:border-slate-200 mobile:bg-white mobile:p-4 mobile:shadow-sm mobile:hover:bg-white mobile:active:scale-[0.99] mobile:transition-transform",
        className,
      )}
      {...props}
    />
  );
});
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle text-xs font-black uppercase tracking-[0.08em] text-[var(--pcms-text-muted)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  /** Label rendered before content on mobile when in card mode. */
  mobileLabel?: string;
};

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, mobileLabel, children, ...props }, ref) => {
    const mobileCards = React.useContext(TableMobileCardsContext);
    return (
      <td
        ref={ref}
        className={cn(
          "p-4 align-middle text-[var(--pcms-text)] [&:has([role=checkbox])]:pr-0",
          mobileCards &&
            "mobile:flex mobile:items-center mobile:justify-between mobile:gap-3 mobile:p-0 mobile:text-sm",
          className,
        )}
        data-mobile-label={mobileLabel}
        {...props}
      >
        {mobileCards && mobileLabel ? (
          <>
            <span className="hidden mobile:inline text-xs font-semibold uppercase tracking-wide text-slate-500">
              {mobileLabel}
            </span>
            <span className="min-w-0 mobile:text-right mobile:font-medium mobile:text-slate-900">
              {children}
            </span>
          </>
        ) : (
          children
        )}
      </td>
    );
  },
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
