"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TrackedPage, DashboardStats, SearchTabCounts } from "@/types";
import { useToast } from "@/components/toast-context";
import { TableToolbar } from "@/features/brands/components/table/table-toolbar";
import { TableBulkActions } from "@/features/brands/components/table/table-bulk-actions";
import { TableHeader } from "@/features/brands/components/table/table-header";
import { TableRow } from "@/features/brands/components/table/table-row";
import { TableEmptyState } from "@/features/brands/components/table/table-empty-state";
import { TablePagination } from "@/features/brands/components/table/table-pagination";
import { TableModals } from "@/features/brands/components/table/table-modals";
import { RowActionMenu } from "@/features/brands/components/table/row-action-menu";
import { NotePopover } from "@/features/brands/components/table/note-popover";
import { InlineSparkline } from "@/features/brands/components/table/sparkline-cell";
import { Loader2 } from "lucide-react";

export { InlineSparkline };

export interface PagesTableProps {
  pages: TrackedPage[];
  loading: boolean;
  onRefresh: (ids: string[]) => Promise<void> | void;
  onRetry: (ids?: string[]) => Promise<void> | void;
  onDelete: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  searchTypeFilter: string;
  onSearchTypeFilterChange: (value: string) => void;
  tagFilter?: string;
  onTagFilterChange?: (value: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount?: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (col: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onWatchlistToggle?: () => void;
  onResetFilters?: () => void;
  stats?: DashboardStats | null;
  searchTabCounts?: SearchTabCounts | null;
  hasPendingReSort?: boolean;
  onApplySort?: () => void;
}

export function PagesTable({
  pages,
  loading,
  onRefresh,
  onRetry,
  onDelete,
  onBulkDelete,
  search,
  searchTabCounts,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  searchTypeFilter,
  onSearchTypeFilterChange,
  tagFilter,
  onTagFilterChange,
  activeTab,
  onTabChange,
  page,
  pageSize,
  totalPages,
  totalCount,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSortChange,
  onWatchlistToggle,
  onResetFilters,
  stats,
  hasPendingReSort = false,
  onApplySort,
}: PagesTableProps) {
  const { showToast } = useToast();
  const [watchlisted, setWatchlisted] = useState<Record<string, boolean>>(
    Object.fromEntries(pages.map((p) => [p.id, p.isWatchlisted ?? false]))
  );

  const [refreshingPageIds, setRefreshingPageIds] = useState<Set<string>>(new Set());
  const [retryingPageIds, setRetryingPageIds] = useState<Set<string>>(new Set());
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  const handleRowRefresh = async (pageId: string) => {
    if (refreshingPageIds.has(pageId)) return;
    setRefreshingPageIds((prev) => new Set(prev).add(pageId));
    try {
      await Promise.all([
        Promise.resolve(onRefresh([pageId])),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } finally {
      setRefreshingPageIds((prev) => {
        const next = new Set(prev);
        next.delete(pageId);
        return next;
      });
    }
  };

  const handleRowRetry = async (pageId: string) => {
    if (retryingPageIds.has(pageId)) return;
    setRetryingPageIds((prev) => new Set(prev).add(pageId));
    try {
      await Promise.all([
        Promise.resolve(onRetry([pageId])),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } finally {
      setRetryingPageIds((prev) => {
        const next = new Set(prev);
        next.delete(pageId);
        return next;
      });
    }
  };

  const handleBulkRefresh = async () => {
    if (isBulkRefreshing || selectedIds.length === 0) return;
    setIsBulkRefreshing(true);
    const idsToRefresh = [...selectedIds];
    setRefreshingPageIds((prev) => {
      const next = new Set(prev);
      idsToRefresh.forEach((id) => next.add(id));
      return next;
    });
    try {
      await Promise.all([
        Promise.resolve(onRefresh(idsToRefresh)),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
      setSelectedIds([]);
    } finally {
      setIsBulkRefreshing(false);
      setRefreshingPageIds((prev) => {
        const next = new Set(prev);
        idsToRefresh.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleToolbarRetry = async () => {
    if (isRetryingAll) return;
    setIsRetryingAll(true);
    try {
      await Promise.all([
        Promise.resolve(onRetry()),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } finally {
      setIsRetryingAll(false);
    }
  };

  const [toast, setToast] = useState<{
    type: "success" | "error" | "info" | "warning";
    title: string;
    message: string;
  } | null>(null);

  const triggerToast = (type: "success" | "error" | "info" | "warning", title: string, message: string) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  const [mounted, setMounted] = useState(false);
  const [openMenuPageId, setOpenMenuPageId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close row actions menu on click outside, scroll, or resize
  useEffect(() => {
    if (!openMenuPageId) return;

    function handleClickOutside(e: MouseEvent) {
      if (rowMenuRef.current && rowMenuRef.current.contains(e.target as Node)) {
        return;
      }
      if ((e.target as HTMLElement)?.closest?.(`[data-menu-trigger="${openMenuPageId}"]`)) {
        return;
      }
      setOpenMenuPageId(null);
      setMenuPos(null);
    }

    function handleScrollOrResize() {
      setOpenMenuPageId(null);
      setMenuPos(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [openMenuPageId]);

  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, pageId: string) => {
    e.stopPropagation();
    if (openMenuPageId === pageId) {
      setOpenMenuPageId(null);
      setMenuPos(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards = spaceBelow < 220;
      setMenuPos({
        top: openUpwards ? undefined : rect.bottom + 4,
        bottom: openUpwards ? window.innerHeight - rect.top + 4 : undefined,
        right: Math.max(8, window.innerWidth - rect.right),
      });
      setOpenMenuPageId(pageId);
    }
  };

  const activeMenuPage = openMenuPageId ? (pages.find((p) => p.id === openMenuPageId) ?? null) : null;

  useEffect(() => {
    setWatchlisted(Object.fromEntries(pages.map((p) => [p.id, p.isWatchlisted ?? false])));
  }, [pages]);

  const toggleWatchlist = useCallback(async (id: string) => {
    const next = !watchlisted[id];
    setWatchlisted((prev) => ({ ...prev, [id]: next }));
    const target = pages.find((p) => p.id === id);
    if (target) target.isWatchlisted = next;

    try {
      const res = await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWatchlisted: next }),
      });
      if (res.ok) {
        onWatchlistToggle?.();
      } else {
        if (target) target.isWatchlisted = !next;
        setWatchlisted((prev) => ({ ...prev, [id]: !next }));
      }
    } catch {
      if (target) target.isWatchlisted = !next;
      setWatchlisted((prev) => ({ ...prev, [id]: !next }));
    }
  }, [watchlisted, pages, onWatchlistToggle]);

  const [selectedHistoryPage, setSelectedHistoryPage] = useState<TrackedPage | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const [runnerModalPages, setRunnerModalPages] = useState<TrackedPage[]>([]);
  const [runnerModalOpen, setRunnerModalOpen] = useState(false);

  const [resolveModalPageId, setResolveModalPageId] = useState<string | null>(null);
  const [manageDomainId, setManageDomainId] = useState<string | null>(null);

  const [moveModalPage, setMoveModalPage] = useState<TrackedPage | null>(null);
  const [moveModalPages, setMoveModalPages] = useState<TrackedPage[] | null>(null);
  const [moveModalPageIds, setMoveModalPageIds] = useState<string[] | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const target = params.get("resolveModal");
      if (target) {
        setResolveModalPageId(target);
      }
      const domainParam = params.get("manageDomain");
      if (domainParam) {
        setManageDomainId(domainParam);
      }
    }
  }, []);

  const handleLaunchScan = async (runner: "local" | "apify") => {
    if (runnerModalPages.length === 0) return;
    const targetIds = runnerModalPages.map((p) => p.id);

    try {
      const res = await fetch("/api/spy/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedPageIds: targetIds, runner }),
      });
      const data = await res.json();

      if (res.ok) {
        if (targetIds.length === 1) {
          const statusItem = data.pageStatuses?.[0];
          const brandName = runnerModalPages[0].displayName || runnerModalPages[0].pageId || runnerModalPages[0].id;

          if (statusItem?.status === "apify_launched") {
            triggerToast(
              "success",
              "⚡ Apify Scan Launched",
              `Launched Apify Delta Cloud scan for "${brandName}" (${statusItem.message})`
            );
          } else if (statusItem?.status === "already_queued") {
            triggerToast(
              "warning",
              "Already Queued",
              `Creative scan for "${brandName}" is already pending/running in queue.`
            );
          } else {
            triggerToast(
              "success",
              "Local Scan Queued",
              `Local Playwright creative scan queued for "${brandName}".`
            );
          }
        } else {
          triggerToast(
            "success",
            "Bulk Creative Scans Started",
            `Started ${data.enqueuedCount || 0} scan job(s) via ${runner === "apify" ? "Apify Cloud" : "Local Worker"}.`
          );
        }
        onWatchlistToggle?.();
        setSelectedIds([]);
      } else {
        triggerToast("error", "Scan Failed", data.error || "Could not launch creative scan");
      }
    } catch {
      triggerToast("error", "Network Error", "Failed to launch creative scan");
    }
  };

  const [pageToDelete, setPageToDelete] = useState<TrackedPage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async (id: string) => {
    setDeleting(true);
    try {
      await onDelete(id);
      setPageToDelete(null);
    } catch (err) {
      console.error("Failed to delete page", err);
    } finally {
      setDeleting(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEditing = (p: TrackedPage) => {
    setEditingId(p.id);
    setEditingName(p.displayName || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEditing = async (id: string) => {
    if (!editingName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editingName.trim() }),
      });
      if (res.ok) {
        const targetPage = pages.find((p) => p.id === id);
        if (targetPage) targetPage.displayName = editingName.trim();
        cancelEditing();
      }
    } catch (err) {
      console.error("Failed to update display name", err);
    } finally {
      setSavingEdit(false);
    }
  };

  const openHistory = (p: TrackedPage) => {
    setSelectedHistoryPage(p);
    setHistoryModalOpen(true);
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allVisibleSelected =
    pages.length > 0 && pages.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pages.map((p) => p.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const [notePopoverPage, setNotePopoverPage] = useState<TrackedPage | null>(null);
  const [notePopoverPos, setNotePopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  } | null>(null);
  const [notePopoverValue, setNotePopoverValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const notePopoverRef = useRef<HTMLDivElement | null>(null);

  // Close note popover on click outside, scroll, or resize
  useEffect(() => {
    if (!notePopoverPage) return;

    function handleClickOutside(e: MouseEvent) {
      if (notePopoverRef.current && notePopoverRef.current.contains(e.target as Node)) {
        return;
      }
      if ((e.target as HTMLElement)?.closest?.(`[data-note-trigger="${notePopoverPage?.id}"]`)) {
        return;
      }
      setNotePopoverPage(null);
      setNotePopoverPos(null);
    }

    function handleScrollOrResize() {
      setNotePopoverPage(null);
      setNotePopoverPos(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [notePopoverPage]);

  const openNotePopoverFromElement = (page: TrackedPage, triggerEl: HTMLElement) => {
    const rect = triggerEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < 250;

    let leftPos: number | undefined = undefined;
    let rightPos: number | undefined = undefined;

    if (rect.left + 328 <= window.innerWidth) {
      leftPos = Math.max(8, rect.left);
    } else {
      rightPos = Math.max(8, window.innerWidth - rect.right);
    }

    setNotePopoverPos({
      top: openUpwards ? undefined : rect.bottom + 6,
      bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
      left: leftPos,
      right: rightPos,
    });
    setNotePopoverPage(page);
    setNotePopoverValue((page as any).notes || "");
    setOpenMenuPageId(null);
    setMenuPos(null);
  };

  const openNotePopoverFromMenu = (page: TrackedPage) => {
    if (menuPos) {
      const right = Math.max(8, Math.min(menuPos.right, window.innerWidth - 328));
      setNotePopoverPos({
        top: menuPos.top,
        bottom: menuPos.bottom,
        right,
      });
    } else {
      setNotePopoverPos({
        top: 100,
        right: 16,
      });
    }
    setOpenMenuPageId(null);
    setMenuPos(null);
    setNotePopoverPage(page);
    setNotePopoverValue((page as any).notes || "");
  };

  const saveNotes = async (id: string, customValue?: string) => {
    const valueToSave = customValue !== undefined ? customValue : notePopoverValue;
    const trimmed = valueToSave.trim() || null;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/page/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: trimmed }),
      });
      if (res.ok) {
        const target = pages.find((p) => p.id === id);
        if (target) (target as any).notes = trimmed;
        setNotePopoverPage(null);
        setNotePopoverPos(null);
        showToast({
          title: trimmed ? "Note Saved" : "Note Cleared",
          message: trimmed
            ? `Note saved for ${target?.displayName || "page"}`
            : `Note removed for ${target?.displayName || "page"}`,
          type: "success",
        });
        onWatchlistToggle?.();
      } else {
        showToast({
          title: "Save Failed",
          message: "Failed to update note",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Failed to save notes", err);
      showToast({
        title: "Error",
        message: "An unexpected error occurred while saving the note",
        type: "error",
      });
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={onSearchChange}
        loading={loading}
        activeTab={activeTab}
        onTabChange={onTabChange}
        searchTabCounts={searchTabCounts}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        searchTypeFilter={searchTypeFilter}
        onSearchTypeFilterChange={onSearchTypeFilterChange}
        tagFilter={tagFilter}
        onTagFilterChange={onTagFilterChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        page={page}
        onResetFilters={onResetFilters}
        failedCount={stats?.failed}
        hasFailedPages={pages.some((p) => p.status === "failed")}
        onRetryFailed={handleToolbarRetry}
        isRetryingAll={isRetryingAll}
        hasPendingReSort={hasPendingReSort}
        onApplySort={onApplySort}
      />

      {/* Bulk Action Bar */}
      <TableBulkActions
        selectedCount={selectedIds.length}
        isBulkRefreshing={isBulkRefreshing}
        onBulkRefresh={handleBulkRefresh}
        onExtractAdSpy={() => {
          const targetPages = pages.filter((p) => selectedIds.includes(p.id));
          setRunnerModalPages(targetPages);
          setRunnerModalOpen(true);
        }}
        onMoveToWorkspace={() => {
          const targetPages = pages.filter((p) => selectedIds.includes(p.id));
          setMoveModalPages(targetPages);
          setMoveModalPageIds(selectedIds);
          setMoveModalPage(null);
          setMoveModalOpen(true);
        }}
        onBulkDelete={
          onBulkDelete
            ? () => {
                if (confirm(`Delete ${selectedIds.length} selected page(s)? This cannot be undone.`)) {
                  onBulkDelete(selectedIds);
                  setSelectedIds([]);
                }
              }
            : undefined
        }
        onClearSelection={() => setSelectedIds([])}
      />

      {/* Table Container */}
      <div className="border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-x-auto bg-white dark:bg-slate-900/50 shadow-xs relative">
        <table className="w-full md:table-fixed text-left text-[11px]">
          <TableHeader
            allVisibleSelected={allVisibleSelected}
            onToggleSelectAll={toggleSelectAll}
            sortBy={sortBy}
            sortOrder={sortOrder}
            hasPendingReSort={hasPendingReSort}
            onSortChange={onSortChange}
          />
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500 dark:text-indigo-400 mx-auto mb-2" />
                  <span>Loading tracked pages...</span>
                </td>
              </tr>
            ) : pages.length === 0 ? (
              <TableEmptyState
                filters={{
                  search,
                  activeTab,
                  statusFilter,
                  searchTypeFilter,
                  tagFilter,
                  page,
                }}
                searchTabCounts={searchTabCounts}
                actions={{
                  onTabChange,
                  onTagFilterChange,
                  onResetFilters,
                }}
              />
            ) : (
              pages.map((p) => (
                <TableRow
                  key={p.id}
                  page={p}
                  isSelected={selectedIds.includes(p.id)}
                  isWatchlisted={watchlisted[p.id] ?? false}
                  isRefreshing={refreshingPageIds.has(p.id)}
                  isMenuOpen={openMenuPageId === p.id}
                  editing={{
                    isEditing: editingId === p.id,
                    name: editingName,
                    saving: savingEdit,
                    onChangeName: setEditingName,
                    onSave: saveEditing,
                    onCancel: cancelEditing,
                  }}
                  actions={{
                    onToggleSelect: toggleSelectRow,
                    onToggleWatchlist: toggleWatchlist,
                    onRefresh: handleRowRefresh,
                    onOpenRunner: (targetPage) => {
                      setRunnerModalPages([targetPage]);
                      setRunnerModalOpen(true);
                    },
                    onToggleMenu: handleToggleMenu,
                    onOpenNotePopover: openNotePopoverFromElement,
                    onResolveMultiPage: (pageId) => setResolveModalPageId(pageId),
                    onManageDomain: (domainId) => setManageDomainId(domainId),
                    onCopyPageId: (pageId) => {
                      navigator.clipboard.writeText(pageId);
                      showToast({
                        title: "Page ID Copied",
                        message: `#${pageId} copied to clipboard`,
                        type: "success",
                      });
                    },
                  }}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>

      {/* Modals */}
      <TableModals
        history={{
          page: selectedHistoryPage,
          isOpen: historyModalOpen,
          onClose: () => {
            setHistoryModalOpen(false);
            setSelectedHistoryPage(null);
          },
        }}
        deleteModal={{
          page: pageToDelete,
          loading: deleting,
          onClose: () => setPageToDelete(null),
          onConfirm: () => pageToDelete && confirmDelete(pageToDelete.id),
        }}
        scanRunner={{
          isOpen: runnerModalOpen,
          pages: runnerModalPages,
          onClose: () => {
            setRunnerModalOpen(false);
            setRunnerModalPages([]);
          },
          onConfirm: handleLaunchScan,
          onAutoScanChanged: (pageIds, enabled) => {
            pageIds.forEach((id) => {
              const target = pages.find((p) => p.id === id);
              if (target) {
                target.autoCreativeScan = enabled;
              }
            });
            onWatchlistToggle?.();
          },
        }}
        brandResolution={{
          pageId: resolveModalPageId,
          onClose: () => setResolveModalPageId(null),
          onSuccess: () => onWatchlistToggle?.(),
        }}
        manageDomain={{
          domainOrId: manageDomainId,
          onClose: () => setManageDomainId(null),
          onSuccess: () => onWatchlistToggle?.(),
        }}
        moveWorkspace={{
          isOpen: moveModalOpen,
          page: moveModalPage,
          pages: moveModalPages,
          pageIds: moveModalPageIds || (moveModalPage ? [moveModalPage.id] : null),
          onClose: () => {
            setMoveModalOpen(false);
            setMoveModalPage(null);
            setMoveModalPages(null);
            setMoveModalPageIds(null);
          },
          onSuccess: () => {
            setSelectedIds([]);
            onWatchlistToggle?.();
          },
        }}
        toast={{
          data: toast,
          onDismiss: () => setToast(null),
        }}
      />

      {/* Row Action Menu Portal */}
      <RowActionMenu
        mounted={mounted}
        isOpen={Boolean(openMenuPageId && menuPos && activeMenuPage)}
        menuPos={menuPos}
        activeMenuPage={activeMenuPage}
        rowMenuRef={rowMenuRef}
        retryingPageIds={retryingPageIds}
        onClose={() => {
          setOpenMenuPageId(null);
          setMenuPos(null);
        }}
        onRename={startEditing}
        onHistory={openHistory}
        onNote={openNotePopoverFromMenu}
        onRetry={handleRowRetry}
        onMove={(page) => {
          setMoveModalPage(page);
          setMoveModalPages(null);
          setMoveModalPageIds([page.id]);
          setMoveModalOpen(true);
        }}
        onDelete={(page) => setPageToDelete(page)}
      />

      {/* Floating Notes Popover Portal */}
      <NotePopover
        mounted={mounted}
        isOpen={Boolean(notePopoverPage && notePopoverPos)}
        notePopoverPos={notePopoverPos}
        notePopoverPage={notePopoverPage}
        notePopoverRef={notePopoverRef}
        notePopoverValue={notePopoverValue}
        onChangeValue={setNotePopoverValue}
        onClose={() => {
          setNotePopoverPage(null);
          setNotePopoverPos(null);
        }}
        onSave={saveNotes}
        savingNotes={savingNotes}
      />
    </div>
  );
}
