"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/sidebar-context";
import { Navigation } from "@/components/navigation";
import { TopBar } from "@/components/top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <div className="h-full w-full bg-background overflow-y-auto flex flex-col">{children}</div>;
  }

  return (
    <SidebarProvider>
      <Navigation />
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
        <TopBar />
        <main className="flex-1 min-w-0 overflow-y-auto flex flex-col p-4 md:px-6 md:py-5 bg-background">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
