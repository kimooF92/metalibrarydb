"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Eye,
  Globe,
  ShoppingBag,
  Settings,
  Menu,
  X,
  PanelLeftOpen,
  PanelLeftClose,
  LogOut,
  Sparkles,
  Flame,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { ProfileMenu } from "./profile-menu";
import { useSidebar } from "@/components/sidebar-context";
import { SmallPagesScanBadge } from "./small-pages-scan-banner";
import { NotificationCenter } from "./notification-center";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useLogout } from "@/hooks/use-logout";
import { useAuth } from "@/components/auth-context";
import { useAddUrlModal } from "@/components/add-url-modal";
import { useProductBadge } from "@/hooks/use-product-badge";
import { Plus, PlusCircle, ShieldCheck, Building2 } from "lucide-react";

export function Navigation() {
  const pathname = usePathname();
  const [baseRoute, setBaseRoute] = useState(pathname);

  useEffect(() => {
    if (!pathname.startsWith("/spy/brand/")) {
      setBaseRoute(pathname);
    }
  }, [pathname]);

  const activeRoute = pathname.startsWith("/spy/brand/") ? baseRoute : pathname;
  const [isOpen, setIsOpen] = useState(false);
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { logout, isLoggingOut } = useLogout();
  const { isStaff } = useAuth();
  const { openAddUrlModal } = useAddUrlModal();
  const { count: newProductsCount } = useProductBadge();

  const navSections = [
    {
      id: "workspace",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/products", label: "Products", icon: ShoppingBag },
        { href: "/brands", label: "Tracked Brands", icon: Building2 },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
      ],
    },
    {
      id: "intelligence",
      items: [
        {
          href: "/fresh-winners",
          label: "Fresh Winners",
          icon: Flame,
          badge: { text: "HOT", variant: "hot" as const },
          accentColor: "text-amber-500 dark:text-amber-400",
        },
        {
          href: "/opportunities",
          label: "Opportunities",
          icon: Sparkles,
          badge: { text: "AI", variant: "ai" as const },
          accentColor: "text-indigo-500 dark:text-indigo-400",
        },
        { href: "/spy", label: "Ad Feed", icon: Eye },
        { href: "/discovery", label: "Discover Brands", icon: Globe },
      ],
    },
  ];

  // Staff role only sees Products
  const filteredNavSections = isStaff
    ? [
      {
        id: "workspace",
        items: [
          { href: "/products", label: "Products", icon: ShoppingBag },
        ],
      },
    ]
    : navSections;

  const isSettingsActive = activeRoute === "/settings";

  return (
    <>
      {/* Desktop Left Sidebar (Admin Only - Staff has clean full-width workspace) */}
      {!isStaff && (
        <header
          className={`hidden md:flex flex-col ${isCollapsed ? "w-14 px-2" : "w-60 px-2.5"
            } py-3 h-screen border-r border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#010202] shrink-0 sticky top-0 left-0 z-40 justify-between transition-[width,padding] duration-200 ease-[cubic-bezier(0.2,0,0,1)] relative select-none`}
        >
          <div className="flex flex-col flex-1 min-w-0">
            {/* Header Row (Logo, Title & Toggle) */}
            <div className="flex items-center justify-between mb-3 h-9 w-full min-w-0">
              {isCollapsed ? (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Expand sidebar"
                  title="Expand sidebar (Ctrl+B)"
                  className="group relative flex items-center justify-center w-9 h-9 mx-auto rounded-md hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
                >
                  {/* Default: App Icon */}
                  <img
                    src="/icon.png"
                    alt="Meta Ad Tracker"
                    className="h-5 w-5 object-contain transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
                  />

                  {/* Hover: Expand Toggle Icon */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center text-slate-500 dark:text-slate-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <PanelLeftOpen className="w-4 h-4 stroke-[1.75]" />
                  </span>
                </button>
              ) : (
                <>
                  <Link
                    href="/"
                    className="flex items-center min-w-0 flex-1 h-full gap-2.5 px-1 group"
                  >
                    <div className="w-6 h-6 rounded-md bg-indigo-600/10 dark:bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <img
                        src="/icon.png"
                        alt="Meta Ad Tracker"
                        className="h-4 w-4 object-contain"
                      />
                    </div>

                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-[13px] text-slate-900 dark:text-white tracking-tight block leading-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        Meta Ad Tracker
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium block truncate">
                        Competitor Intel
                      </span>
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar (Ctrl+B)"
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5 stroke-[1.75]" />
                  </button>
                </>
              )}
            </div>

            {/* Navigation Groups with Hairline Dividers */}
            <nav className="flex flex-col space-y-0.5">
              {filteredNavSections.map((section, sIdx) => (
                <div key={section.id} className="flex flex-col space-y-0.5">
                  {sIdx > 0 && (
                    <div
                      className={`my-1.5 border-t border-slate-200/80 dark:border-slate-800/60 ${isCollapsed ? "mx-1" : "mx-1.5"
                        }`}
                    />
                  )}
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      item.href === "/"
                        ? activeRoute === "/"
                        : item.href === "/brands"
                          ? activeRoute === "/brands" || activeRoute === "/brand"
                          : activeRoute.startsWith(item.href);

                    const isProductItem = item.href === "/products";
                    const showProductBadge = isProductItem && newProductsCount > 0;
                    const badgeText = newProductsCount > 99 ? "99+" : `${newProductsCount}`;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={
                          isCollapsed
                            ? showProductBadge
                              ? `${item.label} (+${badgeText} new)`
                              : item.label
                            : undefined
                        }
                        className={`group relative flex items-center h-[34px] rounded-md text-[13px] font-medium transition-all duration-150 ${isCollapsed
                            ? "w-9 h-9 mx-auto justify-center p-0"
                            : "w-full px-2.5 gap-2.5 justify-start"
                          } ${active
                            ? "bg-indigo-50/90 dark:bg-indigo-500/[0.12] text-indigo-950 dark:text-white"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-white/[0.04]"
                          }`}
                      >
                        {/* Stationary Icon */}
                        <Icon
                          className={`w-4 h-4 shrink-0 stroke-[1.75] transition-colors ${active
                              ? "text-indigo-600 dark:text-indigo-400"
                              : item.accentColor
                                ? item.accentColor
                                : "text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                            }`}
                        />

                        {/* Collapsed Product Notification Dot */}
                        {isCollapsed && showProductBadge && (
                          <span className="absolute top-1.5 right-1.5 flex h-2 w-2 pointer-events-none">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 ring-2 ring-white dark:ring-[#010202]" />
                          </span>
                        )}

                        {/* Label & Badge */}
                        <div
                          className={`flex items-center justify-between min-w-0 flex-1 overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${isCollapsed
                              ? "opacity-0 -translate-x-2 max-w-0 pointer-events-none"
                              : "opacity-100 translate-x-0 max-w-full"
                            }`}
                        >
                          <span className="truncate whitespace-nowrap">{item.label}</span>
                          {/* Dynamic Product Unseen Notification Badge */}
                          {showProductBadge && (
                            <span className="flex shrink-0 items-center ml-2 animate-in fade-in zoom-in-95 duration-150">
                              <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 leading-none shadow-xs">
                                +{badgeText}
                              </span>
                            </span>
                          )}
                          {item.badge && (
                            <span className="flex shrink-0 items-center ml-2">
                              {item.badge.variant === "ai" && (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 leading-none">
                                  {item.badge.text}
                                </span>
                              )}
                              {item.badge.variant === "hot" && (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 leading-none">
                                  {item.badge.text}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>

          {/* Sidebar Bottom Footer — Super Admin Profile Menu */}
          <div className="pt-2">
            <div
              className={`mb-1.5 border-t border-slate-200/80 dark:border-slate-800/60 ${isCollapsed ? "mx-1" : "mx-1.5"
                }`}
            />
            <ProfileMenu />
          </div>
        </header>
      )}

      {/* Mobile Top Bar */}
      <header className="flex md:hidden items-center justify-between h-13 w-full px-4 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#010202]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-md bg-indigo-600/10 dark:bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <img
              src="/icon.png"
              alt="Meta Ad Tracker Logo"
              className="w-4 h-4 object-contain"
            />
          </div>
          <span className="font-semibold text-sm text-slate-900 dark:text-white tracking-tight">
            Meta Ad Tracker
          </span>
          {isStaff && (
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <ShieldCheck className="w-2.5 h-2.5" />
              <span>Staff</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!isStaff && <SmallPagesScanBadge />}
          {!isStaff && <NotificationCenter layout="navbar" />}
          {isStaff ? (
            <ProfileMenu layout="topbar" />
          ) : (
            <button
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "Close menu" : "Open menu"}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
            >
              {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          )}
        </div>
      </header>

      {/* Mobile Drawer Menu Overlay (Admin Only) */}
      {!isStaff && isOpen && (
        <div className="fixed inset-x-0 bottom-0 top-13 z-40 bg-white/98 dark:bg-[#010202]/98 backdrop-blur-md md:hidden flex flex-col p-5 space-y-5 animate-in slide-in-from-top-4 duration-200 justify-between">
          <div className="flex flex-col space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
                Active Workspace
              </span>
              <WorkspaceSwitcher />
            </div>

            <nav className="flex flex-col space-y-1">
              {filteredNavSections.map((section, sIdx) => (
                <div key={section.id} className="flex flex-col space-y-1">
                  {sIdx > 0 && (
                    <div className="my-1.5 border-t border-slate-200/80 dark:border-slate-800/60" />
                  )}
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      item.href === "/"
                        ? activeRoute === "/"
                        : item.href === "/brands"
                          ? activeRoute === "/brands" || activeRoute === "/brand"
                          : activeRoute.startsWith(item.href);
                    const isProductItem = item.href === "/products";
                    const showProductBadge = isProductItem && newProductsCount > 0;
                    const badgeText = newProductsCount > 99 ? "99+" : `${newProductsCount}`;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active
                            ? "bg-indigo-50/90 dark:bg-indigo-500/[0.12] text-indigo-950 dark:text-white"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon
                            className={`w-4 h-4 stroke-[1.75] ${active
                                ? "text-indigo-600 dark:text-indigo-400"
                                : item.accentColor || "text-slate-400"
                              }`}
                          />
                          <span>{item.label}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {showProductBadge && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 leading-none">
                              +{badgeText}
                            </span>
                          )}
                          {item.badge && (
                            <span>
                              {item.badge.variant === "ai" && (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                                  {item.badge.text}
                                </span>
                              )}
                              {item.badge.variant === "hot" && (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  {item.badge.text}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
            <button
              onClick={() => {
                setIsOpen(false);
                openAddUrlModal();
              }}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Brand</span>
            </button>

            <ProfileMenu />
          </div>
        </div>
      )}
    </>
  );
}
