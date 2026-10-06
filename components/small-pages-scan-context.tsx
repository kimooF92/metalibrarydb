"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { SmallPageNeedingScan } from "@/app/api/worker/small-pages-scan/route";
import { useWorkspace } from "@/components/workspace-context";

interface SmallPagesScanContextType {
  count: number;
  inQueueCount: number;
  pendingEnqueueCount: number;
  pages: SmallPageNeedingScan[];
  loading: boolean;
  enqueuing: boolean;
  isDismissed: boolean;
  isModalOpen: boolean;
  dismiss: () => void;
  unDismiss: () => void;
  openModal: () => void;
  closeModal: () => void;
  enqueueAll: () => Promise<number>;
  refresh: () => Promise<void>;
}

const SmallPagesScanContext = createContext<SmallPagesScanContextType | undefined>(undefined);

const LOCAL_STORAGE_DISMISS_KEY = "small_pages_scan_dismissed_sig";

export function SmallPagesScanProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id;

  const [pages, setPages] = useState<SmallPageNeedingScan[]>([]);
  const [count, setCount] = useState<number>(0);
  const [inQueueCount, setInQueueCount] = useState<number>(0);
  const [pendingEnqueueCount, setPendingEnqueueCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [enqueuing, setEnqueuing] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const requestInFlightRef = useRef(false);

  const generateSignature = (items: SmallPageNeedingScan[]) => {
    if (!items || items.length === 0) return "";
    return `${items.length}_${items.slice(0, 5).map((p) => p.id).join(",")}`;
  };

  const fetchData = useCallback(async () => {
    if (requestInFlightRef.current || document.hidden) return;
    requestInFlightRef.current = true;
    try {
      const url = workspaceId
        ? `/api/worker/small-pages-scan?workspaceId=${encodeURIComponent(workspaceId)}`
        : "/api/worker/small-pages-scan";
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const fetchedPages: SmallPageNeedingScan[] = data.pages || [];
          setPages(fetchedPages);
          setCount(data.count || 0);
          setInQueueCount(data.inQueueCount || 0);
          setPendingEnqueueCount(data.pendingEnqueueCount || 0);

          if (fetchedPages.length > 0) {
            const sig = generateSignature(fetchedPages);
            const savedSig = localStorage.getItem(LOCAL_STORAGE_DISMISS_KEY);
            // If the user already explicitly dismissed THIS exact signature, keep dismissed
            if (savedSig === sig) {
              setIsDismissed(true);
            } else {
              // Fresh or updated batch of pages needing scan: un-dismiss so it's noticeable!
              setIsDismissed(false);
            }
          } else {
            setIsDismissed(false);
          }
        }
      }
    } catch (err) {
      // Quiet fail on network hiccups
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
    const pollIntervalMs = isModalOpen ? 30000 : isDismissed ? 300000 : 180000;
    const interval = setInterval(fetchData, pollIntervalMs);
    const handleVisibility = () => {
      if (!document.hidden) fetchData();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchData, isModalOpen, isDismissed]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    const sig = generateSignature(pages);
    if (sig) {
      localStorage.setItem(LOCAL_STORAGE_DISMISS_KEY, sig);
    }
  }, [pages]);

  const unDismiss = useCallback(() => {
    setIsDismissed(false);
    localStorage.removeItem(LOCAL_STORAGE_DISMISS_KEY);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const enqueueAll = useCallback(async (): Promise<number> => {
    setEnqueuing(true);
    try {
      const res = await fetch("/api/worker/small-pages-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchData();
        return data.enqueuedCount || 0;
      }
      return 0;
    } catch (err) {
      console.error("Error enqueuing small pages:", err);
      return 0;
    } finally {
      setEnqueuing(false);
    }
  }, [fetchData, workspaceId]);

  return (
    <SmallPagesScanContext.Provider
      value={{
        count,
        inQueueCount,
        pendingEnqueueCount,
        pages,
        loading,
        enqueuing,
        isDismissed,
        isModalOpen,
        dismiss,
        unDismiss,
        openModal,
        closeModal,
        enqueueAll,
        refresh: fetchData,
      }}
    >
      {children}
    </SmallPagesScanContext.Provider>
  );
}

export function useSmallPagesScan() {
  const context = useContext(SmallPagesScanContext);
  if (!context) {
    throw new Error("useSmallPagesScan must be used within a SmallPagesScanProvider");
  }
  return context;
}
