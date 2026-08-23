"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Radio,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, rememberMe }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push(from);
          router.refresh();
        }, 500);
      } else {
        setError(data.error || "Authentication failed. Please verify your password.");
      }
    } catch (err: any) {
      setError("Network error. Could not connect to authentication service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-500/30 shadow-lg shadow-sky-500/10 mb-4 backdrop-blur-xl group">
          <ShieldCheck className="w-8 h-8 text-sky-400 group-hover:scale-110 transition-transform duration-300" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading">
          Meta Ad Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Private Intelligence & Automated Scraping Hub
        </p>
      </div>

      {/* Login Card */}
      <div className="relative rounded-2xl border border-border/80 bg-card/60 backdrop-blur-2xl p-7 shadow-2xl shadow-black/40 overflow-hidden">
        {/* Top subtle gradient accent */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-sky-500 to-transparent opacity-80" />

        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1">
            <Lock className="w-3.5 h-3.5" />
            <span>Secured Session Gate</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter your Master Password to access your competitor dashboards and worker queues.
          </p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300 animate-in fade-in-50 slide-in-from-top-1">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 animate-in fade-in-50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">Access granted. Redirecting to workspace...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Master Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                required
                autoFocus
                disabled={loading || success}
                className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-inner transition-all focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading || success}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading || success}
                className="w-4 h-4 rounded border-border text-sky-500 focus:ring-sky-500/30 bg-background/80"
              />
              <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Remember this device for 30 days
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim() || success}
            className="w-full relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-indigo-500 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none group"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Verifying credentials...</span>
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Redirecting...</span>
              </>
            ) : (
              <>
                <span>Unlock Workspace</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Security Trust Badges */}
        <div className="mt-6 pt-5 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground/80">
          <div className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-sky-400/80" />
            <span>HMAC-256 Signed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Edge Protected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400/80" />
            <span>HttpOnly Cookie</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-sky-500/10 via-indigo-500/10 to-purple-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-sky-500/5 blur-[100px] rounded-full pointer-events-none -z-10" />

      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Loading security gate...</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
