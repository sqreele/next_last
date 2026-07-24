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
          className="w-full flex items-center justify-between gap-2 px-3 py-2 h-auto hover:bg-muted"
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center overflow-hidden",
                !session.user.profile_image &&
                  "bg-gradient-to-br from-blue-500 to-blue-700",
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
                <span className="text-white font-semibold">{initials}</span>
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className="font-medium text-sm text-foreground">
                {displayName}
              </span>
              <span className="text-xs text-muted-foreground">
                {session.user.positions || "User"}
              </span>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[240px] p-2 bg-card border-border"
        align="start"
      >
        <DropdownMenuItem className="flex flex-col items-start rounded-md p-3 hover:bg-muted">
          <div className="flex w-full items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center overflow-hidden",
                !session.user.profile_image &&
                  "bg-gradient-to-br from-blue-500 to-blue-700",
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
                <span className="text-white font-semibold">{initials}</span>
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className="font-medium text-sm text-foreground">
                {displayName}
              </span>
              <span className="text-xs text-muted-foreground">
                {session.user.email || ""}
              </span>
            </div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-gray-200" />

        <Link href="/dashboard/profile">
          <DropdownMenuItem className="rounded-md cursor-pointer hover:bg-muted">
            <User2 className="mr-2 h-4 w-4" />
            <span>My Profile</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/settings">
          <DropdownMenuItem className="rounded-md cursor-pointer hover:bg-muted">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator className="bg-gray-200" />

        <DropdownMenuItem
          className="rounded-md cursor-pointer text-red-500 hover:bg-red-50"
          onClick={() => appSignOut({ callbackUrl: "/auth/login" })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default User;
