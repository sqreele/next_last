"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, Tag, X } from "lucide-react";
import type { TopicFromAPI } from "@/app/lib/types";
import { cn } from "@/app/lib/utils/cn";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/app/components/ui/bottom-sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";

type TopicValue = { title: string; description: string };

interface TopicPickerProps {
  topics: TopicFromAPI[];
  value: TopicValue;
  onChange: (topic: TopicValue) => void;
  disabled?: boolean;
  invalid?: boolean;
}

const EMPTY_TOPIC: TopicValue = { title: "", description: "" };

export default function TopicPicker({
  topics,
  value,
  onChange,
  disabled = false,
  invalid = false,
}: TopicPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return topics;
    return topics.filter((topic) =>
      `${topic.title} ${topic.description || ""}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query, topics]);

  const chooseTopic = (topic: TopicFromAPI) => {
    onChange({
      title: topic.title,
      description: topic.description || "",
    });
    setOpen(false);
  };

  const trigger = (
    <Button
      type="button"
      variant="outline"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-invalid={invalid}
      disabled={disabled}
      className={cn(
        "h-auto min-h-12 w-full justify-between whitespace-normal px-3 py-2.5 text-left font-medium",
        invalid && "border-destructive ring-2 ring-destructive/15",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            value.title
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {value.title ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Search className="h-4 w-4" aria-hidden />
          )}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-sm",
              !value.title && "text-muted-foreground",
            )}
          >
            {value.title || t("createJob.searchCategories")}
          </span>
          {value.title && value.description && (
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {value.description}
            </span>
          )}
        </span>
      </span>
      <ChevronsUpDown
        className="ml-2 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </Button>
  );

  const pickerContent = (
    <>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("createJob.searchCategories")}
          aria-label={t("createJob.searchCategories")}
          className="h-12 pl-10 pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("createJob.clearCategorySearch")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {!query && topics.length > 0 && (
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("createJob.suggestedCategories")}
        </p>
      )}

      <div
        role="listbox"
        aria-label={t("createJob.chooseCategory")}
        className="mt-2 max-h-[min(55vh,24rem)] space-y-1 overflow-y-auto overscroll-contain pr-1"
      >
        {filteredTopics.map((topic, index) => {
          const selected = value.title === topic.title;
          return (
            <button
              key={topic.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => chooseTopic(topic)}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary/25 bg-primary/10"
                  : index < 6 && !query
                    ? "bg-muted/60 hover:bg-muted"
                    : "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground",
                )}
              >
                {selected ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Tag className="h-4 w-4" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {topic.title}
                </span>
                {topic.description && (
                  <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">
                    {topic.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {topics.length === 0 && (
          <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
            {t("createJob.loadingTopics")}
          </p>
        )}

        {topics.length > 0 && filteredTopics.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {t("createJob.noCategoryResults")}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-2">
      {isDesktop ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            className="block w-[var(--radix-popover-trigger-width)] min-w-[24rem] p-3"
          >
            {pickerContent}
          </PopoverContent>
        </Popover>
      ) : (
        <BottomSheet open={open} onOpenChange={setOpen}>
          <BottomSheetTrigger asChild>{trigger}</BottomSheetTrigger>
          <BottomSheetContent>
            <BottomSheetHeader>
              <BottomSheetTitle>{t("createJob.chooseCategory")}</BottomSheetTitle>
              <BottomSheetDescription>
                {t("createJob.topicPickerHint")}
              </BottomSheetDescription>
            </BottomSheetHeader>
            {pickerContent}
          </BottomSheetContent>
        </BottomSheet>
      )}

      {value.title && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_TOPIC)}
          disabled={disabled}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t("createJob.clearCategory")}
        </button>
      )}
    </div>
  );
}
