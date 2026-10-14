"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UserRole } from "@/lib/auth";

export interface Permissions {
  canEditProduct: boolean;
  canViewAnalytics: boolean;
  canAddTrackedPage: boolean;
  canDelete: boolean;
  canAccessSettings: boolean;
  canAccessIntelligence: boolean;
}

export interface AuthContextType {
  role: UserRole;
  isAdmin: boolean;
  isStaff: boolean;
  permissions: Permissions;
  isLoading: boolean;
  refreshAuth: () => Promise<void>;
}

const defaultPermissions: Permissions = {
  canEditProduct: true,
  canViewAnalytics: true,
  canAddTrackedPage: true,
  canDelete: true,
  canAccessSettings: true,
  canAccessIntelligence: true,
};

const staffPermissions: Permissions = {
  canEditProduct: true,
  canViewAnalytics: false,
  canAddTrackedPage: true,
  canDelete: false,
  canAccessSettings: false,
  canAccessIntelligence: false,
};

const AuthContext = createContext<AuthContextType>({
  role: "admin",
  isAdmin: true,
  isStaff: false,
  permissions: defaultPermissions,
  isLoading: false,
  refreshAuth: async () => {},
});

export function AuthProvider({
  children,
  initialRole = "admin",
}: {
  children: React.ReactNode;
  initialRole?: UserRole;
}) {
  const [role, setRole] = useState<UserRole>(() => {
    if (initialRole && (initialRole === "staff" || initialRole === "admin")) {
      return initialRole;
    }
    if (typeof window !== "undefined") {
      try {
        const match = document.cookie.match(/(?:^|;\s*)ad_tracker_role=([^;]+)/);
        if (match && (match[1] === "staff" || match[1] === "admin")) {
          return match[1] as UserRole;
        }
        const saved = localStorage.getItem("ad_tracker_role");
        if (saved === "staff" || saved === "admin") {
          return saved as UserRole;
        }
      } catch {}
    }
    return "admin";
  });

  const [permissions, setPermissions] = useState<Permissions>(() => {
    const isInitialStaff = (initialRole === "staff") ||
      (typeof window !== "undefined" && (document.cookie.includes("ad_tracker_role=staff") || localStorage.getItem("ad_tracker_role") === "staff"));
    return isInitialStaff ? staffPermissions : defaultPermissions;
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.role) {
          setRole(data.role);
          try {
            localStorage.setItem("ad_tracker_role", data.role);
            document.cookie = `ad_tracker_role=${data.role}; path=/; max-age=2592000; SameSite=Lax`;
          } catch {}
          if (data.permissions) {
            setPermissions(data.permissions);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load auth status:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const value: AuthContextType = {
    role,
    isAdmin: role === "admin",
    isStaff: role === "staff",
    permissions,
    isLoading,
    refreshAuth: fetchStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
