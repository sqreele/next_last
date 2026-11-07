"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import { cn } from "@/app/lib/utils/cn";
import { Button } from "@/app/components/ui/button";
import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/app/components/ui/bottom-sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/app/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
}

interface SearchablePickerProps {
  id?: string;
  label: string;
  placeholder: string;
  options: SearchableOption[];
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
  className?: string;
  searchPlaceholder?: string;
  hint?: string;
  emptyText?: string;
  noMatchesText?: string;
}

export function SearchablePicker({
  id,
  label,
  placeholder,
  options,
  value,
  onValueChange,
  onBlur,
  disabled = false,
  invalid = false,
  errorId,
  className,
  searchPlaceholder,
  hint,
  emptyText,
  noMatchesText,
}: SearchablePickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const [viewport, setViewport] = useState<{ height: number; inset: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const update = () => {
      setIsDesktop(media.matches);
      setOpen(false);
      setQuery("");
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || isDesktop) return;
    const visualViewport = window.visualViewport;
    const update = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const offset = visualViewport?.offsetTop ?? 0;
      setViewport({
        height,
        inset: Math.max(0, window.innerHeight - height - offset),
      });
    };
    update();
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, isDesktop]);

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setViewport(null);
      onBlur?.();
    }
  };

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      role={isDesktop ? "combobox" : undefined}
      aria-label={selected
        ? `${label}: ${selected.label}${selected.description ? ` · ${selected.description}` : ""}`
        : placeholder}
      aria-expanded={open && !disabled}
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
      disabled={disabled}
      className={cn(
        "h-auto min-h-14 w-full min-w-0 justify-between gap-3 rounded-lg px-3 py-3 text-left font-normal",
        !selected && "text-muted-foreground",
        invalid && "border-destructive",
        className,
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {selected?.label || placeholder}
        </span>
        {selected?.description && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {selected.description}
          </span>
        )}
      </span>
      <ChevronsUpDown className="h-4 w-4 shrink-0" aria-hidden />
    </Button>
  );

  const picker = (
    <Command className="h-auto min-h-0 w-full flex-1" label={label}>
      <div className="relative shrink-0">
        <CommandInput
          ref={searchRef}
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onValueChange={setQuery}
          placeholder={searchPlaceholder ?? t("picker.search")}
          aria-label={searchPlaceholder ?? t("picker.search")}
          className="h-12 pr-12 text-base"
        />
        {query && (
          <button
            type="button"
            aria-label={t("picker.clearSearch")}
            onKeyDown={(event) => event.stopPropagation()}
            className="absolute right-0 top-0 grid h-12 w-12 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
      <CommandList className={cn(
        "overscroll-contain",
        isDesktop ? "max-h-[min(300px,50dvh)]" : "min-h-0 max-h-none flex-1 touch-pan-y",
      )}>
        <CommandEmpty>
          {options.length ? (noMatchesText ?? t("picker.noMatches")) : (emptyText ?? t("picker.noOptions"))}
        </CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              keywords={[option.label, option.description || "", ...(option.keywords || [])]}
              disabled={disabled}
              onSelect={() => {
                onValueChange(option.value);
                changeOpen(false);
              }}
              className={cn(
                "min-h-14 cursor-pointer gap-3 rounded-lg px-3 py-3",
                value === option.value && "bg-primary/10",
              )}
            >
              <Check
                className={cn("h-5 w-5 shrink-0 text-primary", value !== option.value && "opacity-0")}
                aria-hidden
              />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                <span className="block text-sm font-medium">{option.label}</span>
                {option.description && <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{option.description}</span>}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  if (isDesktop) {
    return (
      <Popover open={open && !disabled} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-80 max-w-[calc(100vw-2rem)] p-0"
        >
          {picker}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <BottomSheet open={open && !disabled} onOpenChange={changeOpen}>
      <BottomSheetTrigger asChild>{trigger}</BottomSheetTrigger>
      <BottomSheetContent
        showClose={false}
        className="h-[min(36rem,90dvh)]"
        bodyClassName="flex min-h-0 flex-col overflow-hidden"
        style={{
          bottom: viewport?.inset ?? 0,
          maxHeight: viewport ? `${Math.floor(viewport.height * 0.9)}px` : "90dvh",
        }}
        onOpenAutoFocus={(event) => {
          // Start with the list visible; tapping search opens the phone keyboard.
          event.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <BottomSheetHeader className="shrink-0">
          <div className="flex items-center justify-between gap-3">
            <BottomSheetTitle>{label}</BottomSheetTitle>
            <BottomSheetClose asChild>
              <Button
                ref={closeRef}
                data-bottom-sheet-close
                type="button"
                variant="ghost"
                size="icon"
                className="h-12 w-12 shrink-0"
                aria-label={t("action.close")}
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </BottomSheetClose>
          </div>
          <BottomSheetDescription>{hint ?? t("picker.hint")}</BottomSheetDescription>
        </BottomSheetHeader>
        {picker}
      </BottomSheetContent>
    </BottomSheet>
  );
}
