"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Workspace } from "@/types";
import { WORKSPACE_COOKIE_NAME } from "@/lib/workspace-constants";

export interface WorkspaceDeletionReview {
  workspace: Workspace;
  isDeletable: boolean;
  blockReason: string | null;
  stats: {
    pageCount: number;
    productCount: number;
    domainCount: number;
    discoveryRunsCount: number;
    notificationsCount: number;
  };
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (data: {
    name: string;
    countryCode: string;
    currency: string;
    currencySymbol: string;
    flag: string;
    description?: string;
  }) => Promise<Workspace>;
  updateWorkspace: (
    id: string,
    data: Partial<Workspace>
  ) => Promise<Workspace>;
  deleteWorkspace: (id: string, confirmName: string) => Promise<void>;
  getWorkspaceDeletionReview: (id: string) => Promise<WorkspaceDeletionReview>;
  refreshWorkspaces: () => Promise<void>;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  editingWorkspace: Workspace | null;
  setEditingWorkspace: (w: Workspace | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal control
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);

  // Fetch workspaces & active workspace from API
  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load workspaces");
      const data = await res.json();
      const list: Workspace[] = data.workspaces || [];
      const active: Workspace = data.activeWorkspace;

      setWorkspaces(list);
      if (active) {
        setActiveWorkspace(active);
        // Ensure cookie is in sync
        document.cookie = `${WORKSPACE_COOKIE_NAME}=${active.id}; path=/; max-age=31536000; SameSite=Lax`;
      } else if (list.length > 0) {
        const def = list.find((w) => w.isDefault) || list[0];
        setActiveWorkspace(def);
        document.cookie = `${WORKSPACE_COOKIE_NAME}=${def.id}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch (err) {
      console.error("[WorkspaceProvider] Failed to fetch workspaces:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  // Switch workspace
  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const target = workspaces.find((w) => w.id === workspaceId);
      if (!target) return;

      // Update cookie
      document.cookie = `${WORKSPACE_COOKIE_NAME}=${target.id}; path=/; max-age=31536000; SameSite=Lax`;
      setActiveWorkspace(target);

      // Dispatch global event for listeners
      window.dispatchEvent(
        new CustomEvent("workspace-changed", { detail: { workspace: target } })
      );

      // Refresh server components & page data
      router.refresh();
    },
    [workspaces, router]
  );

  // Create new workspace
  const createWorkspace = useCallback(
    async (data: {
      name: string;
      countryCode: string;
      currency: string;
      currencySymbol: string;
      flag: string;
      description?: string;
    }): Promise<Workspace> => {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workspace");
      }

      const resData = await res.json();
      const newWorkspace: Workspace = resData.workspace;

      // Reload workspaces
      await refreshWorkspaces();

      // Automatically switch to the newly created workspace
      await switchWorkspace(newWorkspace.id);

      return newWorkspace;
    },
    [refreshWorkspaces, switchWorkspace]
  );

  // Update existing workspace
  const updateWorkspace = useCallback(
    async (id: string, data: Partial<Workspace>): Promise<Workspace> => {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update workspace");
      }

      const resData = await res.json();
      await refreshWorkspaces();

      if (activeWorkspace?.id === id) {
        setActiveWorkspace(resData.workspace);
      }

      return resData.workspace;
    },
    [refreshWorkspaces, activeWorkspace]
  );

  // Get strict deletion pre-flight review
  const getWorkspaceDeletionReview = useCallback(
    async (id: string): Promise<WorkspaceDeletionReview> => {
      const res = await fetch(`/api/workspaces?id=${encodeURIComponent(id)}&review=true`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load deletion review");
      }

      const data = await res.json();
      return data.review;
    },
    []
  );

  // Strictly confirmed delete workspace
  const deleteWorkspace = useCallback(
    async (id: string, confirmName: string) => {
      const res = await fetch(`/api/workspaces?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete workspace");
      }

      await refreshWorkspaces();

      // If active workspace was deleted, switch to default
      if (activeWorkspace?.id === id) {
        const remaining = workspaces.filter((w) => w.id !== id);
        const def = remaining.find((w) => w.isDefault) || remaining[0];
        if (def) {
          await switchWorkspace(def.id);
        }
      }
    },
    [refreshWorkspaces, activeWorkspace, workspaces, switchWorkspace]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        isLoading,
        switchWorkspace,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        getWorkspaceDeletionReview,
        refreshWorkspaces,
        isCreateModalOpen,
        setIsCreateModalOpen,
        editingWorkspace,
        setEditingWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
