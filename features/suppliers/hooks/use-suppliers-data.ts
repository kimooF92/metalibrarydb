"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Supplier, SuppliersStats } from "@/types";
import { useWorkspace } from "@/components/workspace-context";

interface UseSuppliersDataOptions {
  showToast: (type: "success" | "error" | "info", message: string) => void;
}

export function useSuppliersData({ showToast }: UseSuppliersDataOptions) {
  const { activeWorkspace } = useWorkspace();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stats, setStats] = useState<SuppliersStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 1,
  });

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchSuppliers = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (categoryFilter !== "all") params.set("category", categoryFilter);
        params.set("page", String(page));
        params.set("limit", "24");

        const res = await fetch(`/api/suppliers?${params.toString()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setSuppliers(data.suppliers || []);
            setPagination(data.pagination);
            setStats(data.stats);
          }
        } else {
          showToast("error", "Failed to load suppliers.");
        }
      } catch (err: any) {
        showToast("error", "Error connecting to suppliers service.");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [debouncedSearch, statusFilter, categoryFilter, page, showToast]
  );

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers, activeWorkspace?.id]);

  return {
    suppliers,
    setSuppliers,
    stats,
    loading,
    isRefreshing,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    page,
    setPage,
    pagination,
    fetchSuppliers,
  };
}

