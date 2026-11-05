"use client";

import { useState, useCallback } from "react";
import { Supplier } from "@/types";

interface UseSupplierActionsOptions {
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  showToast: (type: "success" | "error" | "info", message: string) => void;
  onRefresh?: () => void;
}

export function useSupplierActions({ setSuppliers, showToast, onRefresh }: UseSupplierActionsOptions) {
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());

  // 1. Trigger immediate scan
  const handleScanNow = useCallback(
    async (supplierId: string) => {
      setScanningIds((prev) => new Set(prev).add(supplierId));
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, lastScrapeStatus: "scanning" } : s))
      );

      try {
        const res = await fetch(`/api/suppliers/${supplierId}/scan`, {
          method: "POST",
          signal: AbortSignal.timeout(95000),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (data.newPhotosCount > 0) {
            showToast("success", `🎉 ${data.message}`);
          } else {
            showToast("info", data.message || "No new posts or albums found.");
          }
          window.dispatchEvent(new Event("supplier-drop-updated"));
          onRefresh?.();
        } else {
          showToast("error", data.error || "Failed to scan supplier.");
          setSuppliers((prev) =>
            prev.map((s) =>
              s.id === supplierId
                ? { ...s, lastScrapeStatus: "failed", lastScrapeError: data.error }
                : s
            )
          );
        }
      } catch (err: any) {
        showToast("error", "Scan request timed out. Processing in background.");
      } finally {
        setScanningIds((prev) => {
          const next = new Set(prev);
          next.delete(supplierId);
          return next;
        });
      }
    },
    [setSuppliers, showToast, onRefresh]
  );

  // 2. Toggle status (active <-> paused)
  const handleToggleStatus = useCallback(
    async (supplierId: string, currentStatus: string) => {
      const nextStatus = currentStatus === "active" ? "paused" : "active";
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, status: nextStatus as any } : s))
      );

      try {
        const res = await fetch(`/api/suppliers/${supplierId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (res.ok) {
          showToast("success", `Supplier ${nextStatus === "active" ? "resumed" : "paused"}.`);
        } else {
          showToast("error", "Failed to update status.");
          onRefresh?.();
        }
      } catch {
        showToast("error", "Error updating status.");
        onRefresh?.();
      }
    },
    [setSuppliers, showToast, onRefresh]
  );

  // 3. Mark unseen drop as seen
  const handleMarkAsSeen = useCallback(
    async (supplierId: string) => {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, hasUnseenDrop: false } : s))
      );

      try {
        await fetch(`/api/suppliers/${supplierId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hasUnseenDrop: false }),
        });
        window.dispatchEvent(new Event("supplier-drop-updated"));
      } catch {}
    },
    [setSuppliers]
  );

  // 4. Delete supplier
  const handleDelete = useCallback(
    async (supplierId: string, supplierName: string) => {
      if (!confirm(`Are you sure you want to delete supplier "${supplierName}" and all their scraped photos?`)) {
        return;
      }

      setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));

      try {
        const res = await fetch(`/api/suppliers/${supplierId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          showToast("success", `Deleted supplier "${supplierName}".`);
          window.dispatchEvent(new Event("supplier-drop-updated"));
          onRefresh?.();
        } else {
          showToast("error", "Failed to delete supplier.");
          onRefresh?.();
        }
      } catch {
        showToast("error", "Error deleting supplier.");
        onRefresh?.();
      }
    },
    [setSuppliers, showToast, onRefresh]
  );

  return {
    scanningIds,
    handleScanNow,
    handleToggleStatus,
    handleMarkAsSeen,
    handleDelete,
  };
}

