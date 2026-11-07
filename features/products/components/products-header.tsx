"use client";

import Link from "next/link";
import { ShoppingBag, Eye, RotateCw, PlusCircle } from "lucide-react";
import { useAuth } from "@/components/auth-context";

export interface ProductsHeaderProps {
  loading: boolean;
  statsLoading: boolean;
  onRefreshCatalog: () => void;
  onOpenAddProductModal: () => void;
}

export function ProductsHeader({
  loading,
  statsLoading,
  onRefreshCatalog,
  onOpenAddProductModal,
}: ProductsHeaderProps) {
  const { isStaff } = useAuth();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border">
      <div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-black text-foreground tracking-tight">
            Tracked Products
          </h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Monitor competitor store offers, verify live ads, and watch for scaling signals.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isStaff && (
          <button
            onClick={onOpenAddProductModal}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-sm shadow-indigo-600/30 transition-all cursor-pointer"
            title="Track a new product landing page or store URL"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Track Product</span>
          </button>
        )}

        {!isStaff && (
          <Link
            href="/spy"
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border shadow-xs transition-all cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ad Spy Feed</span>
          </Link>
        )}

        <button
          onClick={onRefreshCatalog}
          disabled={loading && statsLoading}
          title="Refresh product intelligence catalog"
          className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-card hover:bg-accent text-foreground border border-border transition-all cursor-pointer shadow-xs"
        >
          <RotateCw
            className={`w-3.5 h-3.5 ${loading || statsLoading ? "animate-spin text-indigo-500" : ""}`}
          />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}

