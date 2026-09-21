"use client";

import {
  Building2,
  Radio,
  Server,
  MessageCircle,
  Phone,
  ExternalLink,
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Advertiser Network Intelligence (Tunisia COD)
          </h4>
          {network?.hasShadowNetwork && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold border border-purple-500/20 flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse text-purple-500" />
              <span>Shadow Network Detected ({network.totalConnectedPages} Pages)</span>
            </span>
          )}
        </div>
      </div>

      {loadingNetwork ? (
        <div className="py-4 text-center text-xs text-slate-400">
          Scanning advertiser network & contact fingerprints...
        </div>
      ) : network ? (
        <div className="space-y-3">
          {/* Network Fingerprint Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
            {/* Store Platform */}
            <div className="flex items-center gap-2.5">
              <Server className="w-4 h-4 text-purple-500 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Store Platform</span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase">
                  {network.storePlatform === "youcan"
                    ? "🛍️ YouCan.shop"
                    : network.storePlatform === "woocommerce"
                    ? "🌐 WooCommerce"
                    : network.storePlatform === "shopify"
                    ? "🟢 Shopify"
                    : network.storePlatform === "custom_cod"
                    ? "⚡ Custom COD Form"
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
                    <span className="text-[10px] font-normal text-slate-400">({network.formattedWhatsApps[0].operator})</span>
                  </a>
                ) : network.formattedPhones?.length > 0 ? (
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {network.formattedPhones[0].formatted}{" "}
                    <span className="text-[10px] font-normal text-slate-400">({network.formattedPhones[0].operator})</span>
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
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Meta Pixel ID</span>
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
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Connected Facebook Pages in this Scaling Network ({network.connectedPages.length} Page{network.connectedPages.length === 1 ? "" : "s"}, {network.totalNetworkAds} Total Ads):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {network.connectedPages.map((pg: any) => (
                  <div
                    key={pg.pageId}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                        {pg.pageName}
                      </span>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                        {pg.activeAdsCount} active ad{pg.activeAdsCount === 1 ? "" : "s"}
                      </span>
                    </div>
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
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
