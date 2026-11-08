"use client";

import { useState, useCallback } from "react";
import { Supplier } from "@/types";
import { useToast } from "@/components/toast-context";
import { useSuppliersData } from "@/features/suppliers/hooks/use-suppliers-data";
import { useSupplierActions } from "@/features/suppliers/hooks/use-supplier-actions";
import { SuppliersHeader } from "@/features/suppliers/components/suppliers-header";
import { SuppliersFilterBar } from "@/features/suppliers/components/suppliers-filter-bar";
import { SupplierCard } from "@/features/suppliers/components/supplier-card";
import { AddSupplierModal } from "@/features/suppliers/components/add-supplier-modal";
import { SupplierPhotoGalleryModal } from "@/features/suppliers/components/supplier-photo-gallery-modal";
import { Truck, Loader2 } from "lucide-react";

export default function SuppliersPage() {
  const { showToast: triggerToast } = useToast();
  const showToast = useCallback(
    (type: "success" | "error" | "info", message: string) => {
      triggerToast({ type, title: message });
    },
    [triggerToast]
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedGallerySupplier, setSelectedGallerySupplier] = useState<Supplier | null>(null);

  const {
    suppliers,
    setSuppliers,
    stats,
    loading,
    isRefreshing,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    fetchSuppliers,
  } = useSuppliersData({ showToast });

  const {
    scanningIds,
    handleScanNow,
    handleToggleStatus,
    handleMarkAsSeen,
    handleDelete,
  } = useSupplierActions({
    setSuppliers,
    showToast,
    onRefresh: fetchSuppliers,
  });

  const handleOpenGallery = useCallback((supplier: Supplier) => {
    setSelectedGallerySupplier(supplier);
    if (supplier.hasUnseenDrop) {
      handleMarkAsSeen(supplier.id);
    }
  }, [handleMarkAsSeen]);

  return (
    <div className="w-full flex-1 flex flex-col space-y-4 pb-8 min-w-0">
      {/* Top Header */}
      <SuppliersHeader
        stats={stats}
        isRefreshing={isRefreshing}
        onAddClick={() => setIsAddModalOpen(true)}
        onRefreshClick={() => fetchSuppliers(true)}
      />

      {/* Filter and Search Bar */}
      <SuppliersFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        unseenDropsCount={stats?.unseenDropsCount}
      />

      {/* Main Content Area */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-xs">Loading suppliers...</p>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">No suppliers found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Add your first Facebook supplier page or paste a list of URLs to monitor for new product drops.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          >
            Add Suppliers
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {suppliers.map((supplier) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              isScanning={scanningIds.has(supplier.id)}
              onScanNow={handleScanNow}
              onViewPhotos={handleOpenGallery}
              onToggleStatus={handleToggleStatus}
              onMarkAsSeen={handleMarkAsSeen}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add Supplier Modal */}
      <AddSupplierModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => fetchSuppliers(true)}
        showToast={showToast}
      />

      {/* Photo Lightbox Gallery Modal */}
      <SupplierPhotoGalleryModal
        supplier={selectedGallerySupplier}
        isOpen={Boolean(selectedGallerySupplier)}
        onClose={() => setSelectedGallerySupplier(null)}
        showToast={showToast}
      />
    </div>
  );
}
