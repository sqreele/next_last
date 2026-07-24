"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/app/lib/utils/cn";

const BottomSheet = DialogPrimitive.Root;
const BottomSheetTrigger = DialogPrimitive.Trigger;
const BottomSheetPortal = DialogPrimitive.Portal;
const BottomSheetClose = DialogPrimitive.Close;

const BottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
BottomSheetOverlay.displayName = "BottomSheetOverlay";

interface BottomSheetContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  showHandle?: boolean;
  showClose?: boolean;
}

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  BottomSheetContentProps
>(
  (
    { className, children, showHandle = true, showClose = true, ...props },
    ref,
  ) => {
    const startY = React.useRef<number | null>(null);
    const currentY = React.useRef(0);
    const contentRef = React.useRef<HTMLDivElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<unknown>).current = node;
      },
      [ref],
    );

    const handleTouchStart = (e: React.TouchEvent) => {
      startY.current = e.touches[0].clientY;
      currentY.current = 0;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (startY.current === null || !contentRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        currentY.current = delta;
        contentRef.current.style.transform = `translateY(${delta}px)`;
        contentRef.current.style.transition = "none";
      }
    };

    const handleTouchEnd = () => {
      if (!contentRef.current) return;
      contentRef.current.style.transition = "transform 200ms ease-out";
      if (currentY.current > 120) {
        const closeBtn = contentRef.current.querySelector<HTMLButtonElement>(
          "[data-bottom-sheet-close]",
        );
        closeBtn?.click();
      } else {
        contentRef.current.style.transform = "translateY(0)";
      }
      startY.current = null;
      currentY.current = 0;
    };

    return (
      <BottomSheetPortal>
        <BottomSheetOverlay />
        <DialogPrimitive.Content
          ref={setRefs}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-3xl border-t border-border bg-background shadow-[0_-12px_40px_rgba(15,23,42,0.18)]",
            "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "data-[state=closed]:duration-200 data-[state=open]:duration-300",
            className,
          )}
          {...props}
        >
          {showHandle && (
            <div
              className="flex w-full cursor-grab justify-center pb-2 pt-3 active:cursor-grabbing touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              aria-hidden="true"
            >
              <div className="h-1.5 w-12 rounded-full bg-slate-300" />
            </div>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
            {children}
          </div>
          {showClose && (
            <DialogPrimitive.Close
              data-bottom-sheet-close
              className="absolute right-3 top-3 rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </BottomSheetPortal>
    );
  },
);
BottomSheetContent.displayName = "BottomSheetContent";

const BottomSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 pb-3 text-left", className)}
    {...props}
  />
);
BottomSheetHeader.displayName = "BottomSheetHeader";

const BottomSheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky bottom-0 -mx-5 mt-4 flex flex-col gap-2 border-t border-border bg-background px-5 pb-2 pt-3",
      className,
    )}
    {...props}
  />
);
BottomSheetFooter.displayName = "BottomSheetFooter";

const BottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-bold leading-tight tracking-tight text-foreground",
      className,
    )}
    {...props}
  />
));
BottomSheetTitle.displayName = DialogPrimitive.Title.displayName;

const BottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
BottomSheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetPortal,
  BottomSheetOverlay,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
};
