"use client";

import React from "react";
import { useSession } from "@/app/lib/session.client";
import { appSignOut } from "@/app/lib/logout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Button } from "@/app/components/ui/button";
import { User2, LogOut, Settings, ChevronDown } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import Link from "next/link";
import { ProfileImage } from "@/app/components/ui/UniversalImage";
import { getDisplayName } from "@/app/lib/utils/display-name";

const User: React.FC = () => {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  const displayName = getDisplayName(session.user, "User");
  const initials = displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto min-h-12 w-full justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                !session.user.profile_image &&
                  "bg-primary",
              )}
            >
              {session.user.profile_image &&
              session.user.profile_image !== "" ? (
                <ProfileImage
                  src={session.user.profile_image}
                  alt={displayName}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  fill
                />
              ) : (
                <span className="font-semibold text-primary-foreground">{initials}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {session.user.positions || "User"}
              </span>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[min(16rem,calc(100vw-2rem))] rounded-xl border-border bg-popover p-2 shadow-card"
        align="start"
      >
        <DropdownMenuItem className="flex flex-col items-start rounded-lg p-3 hover:bg-muted focus:bg-muted">
          <div className="flex min-w-0 w-full items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                !session.user.profile_image &&
                  "bg-primary",
              )}
            >
              {session.user.profile_image &&
              session.user.profile_image !== "" ? (
                <ProfileImage
                  src={session.user.profile_image}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  width={40}
                  height={40}
                  fill
                />
              ) : (
                <span className="font-semibold text-primary-foreground">{initials}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {session.user.email || ""}
              </span>
            </div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border" />

        <Link href="/dashboard/profile">
          <DropdownMenuItem className="min-h-11 cursor-pointer rounded-lg hover:bg-muted focus:bg-muted">
            <User2 className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>My Profile</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/settings">
          <DropdownMenuItem className="min-h-11 cursor-pointer rounded-lg hover:bg-muted focus:bg-muted">
            <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>Settings</span>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator className="bg-border" />

        <DropdownMenuItem
          className="min-h-11 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive"
          onClick={() => appSignOut({ callbackUrl: "/auth/login" })}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default User;
