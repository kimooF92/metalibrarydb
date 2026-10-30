"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/sidebar-context";
import { Navigation } from "@/components/navigation";
import { TopBar } from "@/components/top-bar";
import { SmallPagesScanProvider } from "@/components/small-pages-scan-context";
import { SmallPagesScanBanner } from "@/components/small-pages-scan-banner";

import { WorkspaceProvider } from "@/components/workspace-context";
import { ManageWorkspaceModal } from "@/components/manage-workspace-modal";
import { AuthProvider } from "@/components/auth-context";
import { AddUrlModalProvider } from "@/components/add-url-modal";
import { UserRole } from "@/lib/auth";

export function AppShell({
  children,
  modal,
  initialRole = "admin",
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
  initialRole?: UserRole;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <div className="h-full w-full bg-background overflow-y-auto flex flex-col">{children}</div>;
  }

  // Track the underlying base route to prevent canvas pages (products, discovery)
  // from losing full-canvas styles when an intercepted modal (e.g. /spy/brand/*) opens over them.
  const [baseRoute, setBaseRoute] = React.useState(pathname);

  React.useEffect(() => {
    if (!pathname.startsWith("/spy/brand/")) {
      setBaseRoute(pathname);
    }
  }, [pathname]);

  const activeBaseRoute = pathname.startsWith("/spy/brand/") ? baseRoute : pathname;
  const isFullCanvasPage =
    activeBaseRoute.startsWith("/products") ||
    activeBaseRoute.startsWith("/discovery") ||
    activeBaseRoute.startsWith("/settings");

  return (
    <AuthProvider initialRole={initialRole}>
      <WorkspaceProvider>
        <SidebarProvider>
          <SmallPagesScanProvider>
            <AddUrlModalProvider>
              <Navigation />
              <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
                <TopBar />
                <SmallPagesScanBanner />
                <main
                  className={`flex-1 min-w-0 flex flex-col bg-background ${
                    isFullCanvasPage ? "h-full overflow-hidden p-0" : "overflow-y-auto p-4 md:px-6 md:py-5"
                  }`}
                >
                  {children}
                </main>
              </div>
              <ManageWorkspaceModal />
              {modal}
            </AddUrlModalProvider>
          </SmallPagesScanProvider>
        </SidebarProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

