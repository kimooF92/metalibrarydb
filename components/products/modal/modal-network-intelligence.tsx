"use client";

import {
  Building2,
  Radio,
  Server,
  MessageCircle,
  Phone,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Share2,
} from "lucide-react";

interface ModalNetworkIntelligenceProps {
  network: any;
  loadingNetwork: boolean;
}

export function ModalNetworkIntelligence({
  network,
  loadingNetwork,
}: ModalNetworkIntelligenceProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Advertiser Network Intelligence (Tunisia COD)
          </h4>
        </div>

        {network && (
          <div>
            {network.hasShadowNetwork ? (
              <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold border border-purple-500/25 flex items-center gap-1.5 shadow-sm">
                <Radio className="w-3 h-3 animate-pulse text-purple-500" />
                <span>
                  Shadow Network Detected ({network.sisterPagesCount} Sister Page
                  {network.sisterPagesCount === 1 ? "" : "s"})
                </span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Independent Brand (No Shadow Network)</span>
              </span>
            )}
          </div>
        )}
      </div>

      {loadingNetwork ? (
        <div className="py-4 text-center text-xs text-slate-400">
          Scanning advertiser network & contact fingerprints...
        </div>
      ) : network ? (
        <div className="space-y-3">
          {/* Network Summary Explanation Banner (when sister pages exist) */}
          {network.hasShadowNetwork && network.networkSummary && (
            <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-start gap-2 text-xs text-purple-900 dark:text-purple-200">
              <Share2 className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Network Link Attribution:</span>
                <span>{network.networkSummary}</span>
              </div>
            </div>
          )}

          {/* Network Fingerprint Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
            {/* Store Platform */}
            <div className="flex items-center gap-2.5">
              <Server className="w-4 h-4 text-purple-500 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Store Platform
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase">
                  {network.storePlatform === "youcan"
                    ? "🛍️ YouCan.shop"
                    : network.storePlatform === "woocommerce"
                    ? "🌐 WooCommerce"
                    : network.storePlatform === "shopify"
                    ? "🟢 Shopify"
                    : network.storePlatform === "custom_cod"
                    ? "⚡ Custom COD Form"
                    : network.storePlatform === "stocki"
                    ? "📦 Stocki COD"
                    : "Standard Web"}
                </span>
              </div>
            </div>

            {/* Phone / WhatsApp Contacts */}
            <div className="flex items-center gap-2.5">
              {network.formattedWhatsApps?.length > 0 ? (
                <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
              )}
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  {network.formattedWhatsApps?.length > 0 ? "Verified WhatsApp" : "Contact Phone"}
                </span>
                {network.formattedWhatsApps?.length > 0 ? (
                  <a
                    href={`https://wa.me/${network.whatsappNumbers[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>{network.formattedWhatsApps[0].formatted}</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      ({network.formattedWhatsApps[0].operator})
                    </span>
                  </a>
                ) : network.formattedPhones?.length > 0 ? (
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {network.formattedPhones[0].formatted}{" "}
                    <span className="text-[10px] font-normal text-slate-400">
                      ({network.formattedPhones[0].operator})
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 italic">No direct phone found</span>
                )}
              </div>
            </div>

            {/* Meta Pixel ID */}
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="truncate">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Meta Pixel ID
                </span>
                {network.metaPixelIds?.length > 0 ? (
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                    {network.metaPixelIds[0]}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 italic">Hidden / Server API</span>
                )}
              </div>
            </div>
          </div>

          {/* Connected Facebook Pages in Network */}
          {network.connectedPages && network.connectedPages.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                <span>
                  {network.hasShadowNetwork
                    ? `Connected Facebook Pages in this Scaling Network (${network.totalConnectedPages} Pages, ${network.totalNetworkAds} Total Ads):`
                    : `Primary Facebook Page (${network.connectedPages[0]?.activeAdsCount || 0} Active Ads):`}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {network.connectedPages.map((pg: any) => (
                  <div
                    key={pg.pageId}
                    className={`p-3 rounded-lg border flex flex-col justify-between gap-2 transition-all ${
                      pg.isCurrentPage
                        ? "bg-slate-50/90 dark:bg-slate-900/60 border-indigo-200 dark:border-indigo-900/50"
                        : "bg-purple-500/5 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                            {pg.pageName}
                          </span>
                        </div>
                        {pg.isCurrentPage ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                            Current
                          </span>
                        ) : pg.confidence === "high" ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>High Link</span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                            Matched
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                          {pg.activeAdsCount} active ad{pg.activeAdsCount === 1 ? "" : "s"}
                        </span>
                        {pg.domains && pg.domains.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="truncate">{pg.domains[0]}</span>
                          </>
                        )}
                      </div>

                      {/* Connection Reasons */}
                      {!pg.isCurrentPage && pg.connectionReasons && pg.connectionReasons.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {pg.connectionReasons.map((reason: string, rIdx: number) => (
                            <span
                              key={rIdx}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-medium border border-purple-500/20"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-mono">ID: {pg.pageId}</span>
                      <a
                        href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=TN&view_all_page_id=${pg.pageId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        title="View in Meta Ad Library"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

