"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export function useLogout() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      try {
        localStorage.removeItem("app_user_settings");
      } catch {}
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, router]);

  return { logout, isLoggingOut };
}
