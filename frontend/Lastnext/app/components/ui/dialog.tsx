import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/app/lib/utils/cn";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  mobileFullscreen?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, mobileFullscreen = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 grid gap-4 border bg-background shadow-card duration-200",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        mobileFullscreen
          ? [
              "mobile:inset-x-0 mobile:bottom-0 mobile:top-auto mobile:left-0 mobile:right-0",
              "mobile:max-h-[92vh] mobile:w-full mobile:max-w-full mobile:rounded-t-3xl mobile:rounded-b-none",
              "mobile:p-5 mobile:pb-[calc(env(safe-area-inset-bottom)+1rem)]",
              "mobile:overflow-y-auto mobile:overscroll-contain",
              "mobile:data-[state=closed]:slide-out-to-bottom mobile:data-[state=open]:slide-in-from-bottom",
              "mobile:data-[state=open]:duration-300 mobile:data-[state=closed]:duration-200",
            ].join(" ")
          : "",
        "tablet:left-[50%] tablet:top-[50%] tablet:w-full tablet:max-w-lg tablet:translate-x-[-50%] tablet:translate-y-[-50%] tablet:rounded-lg tablet:p-6",
        "desktop:left-[50%] desktop:top-[50%] desktop:w-full desktop:max-w-lg desktop:translate-x-[-50%] desktop:translate-y-[-50%] desktop:rounded-lg desktop:p-6",
        "tablet:data-[state=closed]:zoom-out-95 tablet:data-[state=open]:zoom-in-95 tablet:data-[state=closed]:slide-out-to-left-1/2 tablet:data-[state=closed]:slide-out-to-top-[48%] tablet:data-[state=open]:slide-in-from-left-1/2 tablet:data-[state=open]:slide-in-from-top-[48%]",
        "desktop:data-[state=closed]:zoom-out-95 desktop:data-[state=open]:zoom-in-95 desktop:data-[state=closed]:slide-out-to-left-1/2 desktop:data-[state=closed]:slide-out-to-top-[48%] desktop:data-[state=open]:slide-in-from-left-1/2 desktop:data-[state=open]:slide-in-from-top-[48%]",
        className,
      )}
      {...props}
    >
      {mobileFullscreen && (
        <div
          aria-hidden="true"
          className="mx-auto hidden h-1.5 w-12 rounded-full bg-slate-300 mobile:block"
        />
      )}
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className="inline-flex items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
    {...props}
  >
    {children || (
      <>
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </>
    )}
  </DialogPrimitive.Close>
));
DialogClose.displayName = DialogPrimitive.Close.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className="flex flex-col space-y-1.5 text-center sm:text-left"
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className="text-lg font-semibold leading-none tracking-tight"
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className="text-sm text-muted-foreground"
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
