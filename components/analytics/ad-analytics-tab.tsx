"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Flame,
  Video,
  Image as ImageIcon,
  Zap,
  Clock,
  TrendingUp,
  MessageSquare,
  Sparkles,
  Search,
  ExternalLink,
  ShieldCheck,
  Layers,
  Award,
  Type,
  ChevronRight,
} from "lucide-react";
import { KPICard } from "./kpi-card";
import { ProgressBarRow } from "./progress-bar-row";
import { LeaderboardRow } from "./leaderboard-row";

interface AdAnalyticsTabProps {
  data: any;
  isLoading: boolean;
  onRefresh: () => void;
}

export function AdAnalyticsTab({
  data,
  isLoading,
  onRefresh,
}: AdAnalyticsTabProps) {
  const [breakoutSearch, setBreakoutSearch] = useState<string>("");

  const summary = data?.summary || {};
  const cohorts: any[] = data?.longevityCohorts || [];
  const formatEfficiency: any[] = data?.formatEfficiency || [];
  const ctaPsychology = data?.ctaPsychology || { allCtas: [], scaledCtas: [] };
  const copyIntelligence = data?.copyIntelligence || { lengths: [], triggers: {} };
  const duplicationTiers: any[] = data?.duplicationTiers || [];
  const breakoutAds: any[] = data?.breakoutAds || [];
  const topAdvertisers: any[] = data?.topAdvertisers || [];

  const topScaledCTA = useMemo(() => {
    return ctaPsychology.scaledCtas?.length > 0 ? ctaPsychology.scaledCtas[0] : null;
  }, [ctaPsychology]);

  const filteredBreakoutAds = useMemo(() => {
    if (!breakoutSearch.trim()) return breakoutAds;
    const q = breakoutSearch.toLowerCase();
    return breakoutAds.filter(
      (a) =>
        (a.pageName && a.pageName.toLowerCase().includes(q)) ||
        (a.caption && a.caption.toLowerCase().includes(q)) ||
        (a.ctaText && a.ctaText.toLowerCase().includes(q))
    );
  }, [breakoutAds, breakoutSearch]);

  return (
    <div className="space-y-6">
      {/* 1. KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Total Creatives"
          value={summary.totalAds ? Number(summary.totalAds).toLocaleString() : "0"}
          icon={Layers}
          colorTheme="purple"
          badge={{
            text: `${summary.activeAds || 0} active`,
            variant: "purple",
          }}
          subtext={`Avg scale: ${summary.avgDuplication || 1} copies/ad`}
          isLoading={isLoading}
        />

        <KPICard
          title="Video Dominance"
          value={`${summary.videoSharePct ?? 0}%`}
          icon={Video}
          colorTheme="indigo"
          badge={{
            text: `${summary.videoAds || 0} videos`,
            variant: "indigo",
          }}
          subtext={`${summary.imageAds || 0} images • ${summary.carouselAds || 0} carousels`}
          isLoading={isLoading}
        />

        <KPICard
          title="Breakout Velocity"
          value={summary.breakoutAdsCount ? Number(summary.breakoutAdsCount).toLocaleString() : "0"}
          icon={Flame}
          colorTheme="amber"
          badge={{
            text: "< 7 days old",
            variant: "amber",
          }}
          subtext={`${summary.scaledAdsCount || 0} scaled ads (5+ copies)`}
          isLoading={isLoading}
        />

        <KPICard
          title="Top Scaled CTA"
          value={topScaledCTA ? topScaledCTA.name : "Shop Now"}
          icon={Zap}
          colorTheme="emerald"
          badge={{
            text: `${topScaledCTA?.sharePct || 0}% of scaled`,
            variant: "emerald",
          }}
          subtext="High-budget campaign standard"
          isLoading={isLoading}
        />
      </div>

      {/* 2. Longevity & Survival Cohorts vs Creative Format Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ad Longevity & Survival Cohorts (2 cols) */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Ad Longevity & Survival Cohorts
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Attrition & winner maturation curve
            </span>
          </div>

          <div className="space-y-3.5">
            {cohorts.map((cohort, idx) => {
              const colorClasses: Record<string, string> = {
                testing_0_3d: "bg-cyan-500",
                validation_4_7d: "bg-indigo-500",
                scaling_8_14d: "bg-emerald-500",
                winner_15_30d: "bg-amber-500",
                evergreen_30d_plus: "bg-purple-500",
                unknown: "bg-slate-400",
              };
              const color = colorClasses[cohort.key] || "bg-indigo-500";

              return (
                <div
                  key={cohort.key}
                  className="p-3 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/40 dark:bg-slate-900/30"
                >
                  <ProgressBarRow
                    label={cohort.label}
                    count={cohort.count}
                    total={summary.totalAds || 1}
                    colorClass={color}
                    subtext={`Avg ${cohort.avgDuplication} scale copies`}
                    valueLabel={
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {cohort.count} ads
                      </span>
                    }
                  />

                  {/* Cohort Health Badges */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/40 text-[10px] text-slate-500">
                    <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                      {cohort.survivalRate}% still active
                    </span>
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                      {cohort.activeCount} running now
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Creative Format & Scaling Efficiency (1 col) */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <Video className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Format Scaling Power
              </h3>
            </div>
            <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold px-2 py-0.5 rounded-full">
              Media Efficiency
            </span>
          </div>

          <div className="space-y-3.5">
            {formatEfficiency.map((fmt) => {
              const isVideo = fmt.mediaType === "video";
              const isImage = fmt.mediaType === "image";
              const color = isVideo
                ? "bg-indigo-500"
                : isImage
                ? "bg-purple-500"
                : fmt.mediaType === "carousel"
                ? "bg-pink-500"
                : "bg-slate-400";

              return (
                <div
                  key={fmt.mediaType}
                  className={`p-3 rounded-2xl border ${
                    isVideo
                      ? "border-indigo-500/30 bg-indigo-50/30 dark:bg-indigo-950/20"
                      : "border-slate-200/70 dark:border-slate-800/70 bg-white/40 dark:bg-slate-900/30"
                  }`}
                >
                  <ProgressBarRow
                    label={fmt.mediaType.toUpperCase()}
                    count={fmt.count}
                    total={summary.totalAds || 1}
                    colorClass={color}
                    icon={
                      isVideo ? (
                        <Video className="w-3.5 h-3.5 text-indigo-500" />
                      ) : isImage ? (
                        <ImageIcon className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <Layers className="w-3.5 h-3.5 text-pink-500" />
                      )
                    }
                    valueLabel={
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {fmt.count} ads
                      </span>
                    }
                  />

                  <div className="flex items-center justify-between text-[11px] font-semibold mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                    <span className="text-slate-500 dark:text-slate-400">Scale Velocity:</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                      {fmt.avgDuplication} avg copies (Max {fmt.maxDuplication})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. CTA Psychology & Hook / Copywriting Intelligence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CTA Psychology: Scaled vs All */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Top Scaled CTAs (≥ 5 Duplications)
              </h3>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
              Winning Funnels
            </span>
          </div>

          <div className="space-y-3">
            {ctaPsychology.scaledCtas?.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No scaled ads recorded for CTA breakdown.
              </div>
            ) : (
              ctaPsychology.scaledCtas.map((cta: any, idx: number) => {
                const colorClasses = [
                  "bg-emerald-500",
                  "bg-indigo-500",
                  "bg-purple-500",
                  "bg-amber-500",
                  "bg-cyan-500",
                ];
                return (
                  <div
                    key={cta.name}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30"
                  >
                    <ProgressBarRow
                      label={cta.name}
                      count={cta.count}
                      total={summary.scaledAdsCount || 1}
                      percentage={cta.sharePct}
                      colorClass={colorClasses[idx % colorClasses.length]}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Copywriting & Angle Signals */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <Type className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Copy Length & Hook Triggers
              </h3>
            </div>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full">
              Copywriting Angles
            </span>
          </div>

          <div className="space-y-3">
            {copyIntelligence.lengths?.map((len: any) => (
              <div
                key={len.tier}
                className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30"
              >
                <ProgressBarRow
                  label={len.tier}
                  count={len.count}
                  total={summary.totalAds || 1}
                  subtext={`Avg scale: ${len.avgDuplication} copies`}
                  colorClass="bg-indigo-500"
                />
              </div>
            ))}
          </div>

          {/* Trigger signals badges */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
            <div className="p-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                Promo & Discounts
              </span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                {copyIntelligence.triggers?.discountRate || 0}% of copies
              </span>
            </div>
            <div className="p-2 rounded-xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/50">
              <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">
                Urgency & Scarcity
              </span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                {copyIntelligence.triggers?.urgencyRate || 0}% of copies
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Top Breakout Scalers Leaderboard */}
      <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center space-x-2">
            <Flame className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Top Breakout Scalers (<span className="text-amber-600">≤ 7 Days Old • ≥ 3 Copies</span>)
            </h3>
            <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
              {filteredBreakoutAds.length} breakout campaigns
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search breakout brand or copy..."
              value={breakoutSearch}
              onChange={(e) => setBreakoutSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredBreakoutAds.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No breakout ads detected in the last 7 days.
            </div>
          ) : (
            filteredBreakoutAds.map((ad, idx) => (
              <LeaderboardRow
                key={ad.id}
                rank={idx + 1}
                imageUrl={ad.thumbnailStoragePath || ad.thumbnailUrl}
                mediaType={ad.mediaType}
                title={ad.pageName || "Brand"}
                subtitle={ad.caption ? ad.caption.slice(0, 75) + "..." : "Ad Creative"}
                tag={ad.ctaText || "Shop Now"}
                badge={{
                  text: `🔥 Scaled: ${ad.duplicationCount} Copies`,
                  variant: "amber",
                }}
                metrics={[
                  {
                    label: "Scale Duplications",
                    value: `${ad.duplicationCount} sets`,
                    highlight: true,
                  },
                  {
                    label: "Age",
                    value: `${ad.daysRunning || 0}d ago`,
                  },
                  {
                    label: "Media",
                    value: ad.mediaType ? ad.mediaType.toUpperCase() : "IMAGE",
                  },
                ]}
                actionUrl={`/spy?search=${encodeURIComponent(ad.pageName || ad.adArchiveId)}`}
                actionLabel="View in Spy"
              />
            ))
          )}
        </div>
      </div>

      {/* 5. Top Creative Brands Intensity */}
      <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center space-x-2">
            <Award className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Top Advertising Brands by Creative Output
            </h3>
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Ranked by unique creatives launched</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {topAdvertisers.map((brand, idx) => (
            <div
              key={brand.pageId || idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate max-w-[160px]">
                  #{idx + 1} {brand.pageName}
                </span>
                <span className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold px-1.5 py-0.5 rounded">
                  {brand.adCount} ads
                </span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between mt-1">
                <span>{brand.videoRatio}% video creatives</span>
                <span className="font-mono font-semibold">Max {brand.maxDuplication} copies</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
