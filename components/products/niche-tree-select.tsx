"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Search,
  X,
  Sparkles,
  Cpu,
  Home,
  Shirt,
  Dumbbell,
  Wrench,
  Baby,
  Package,
  Layers,
} from "lucide-react";
import { NICHE_TAXONOMY, NicheDefinition, SubNicheDefinition } from "@/lib/niches-taxonomy";

const ICON_MAP: Record<string, React.ElementType> = {
  Sparkles,
  Cpu,
  Home,
  Shirt,
  Dumbbell,
  Wrench,
  Baby,
  Package,
};

export interface NicheCountItem {
  category: string;
  subCategory: string | null;
  count: number;
}

export interface NicheTreeSelectProps {
  selectedNiches: string[];
  onChangeNiches: (niches: string[]) => void;
  selectedSubNiches: string[];
  onChangeSubNiches: (subNiches: string[]) => void;
  nicheCounts?: NicheCountItem[];
  className?: string;
}

export function NicheTreeSelect({
  selectedNiches,
  onChangeNiches,
  selectedSubNiches,
  onChangeSubNiches,
  nicheCounts = [],
  className = "",
}: NicheTreeSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNiches, setExpandedNiches] = useState<Record<string, boolean>>({});

  // Compute count lookup maps
  const { categoryTotalMap, subCategoryTotalMap } = useMemo(() => {
    const catMap: Record<string, number> = {};
    const subMap: Record<string, number> = {};

    for (const item of nicheCounts) {
      const cat = item.category?.toLowerCase() || "";
      catMap[cat] = (catMap[cat] || 0) + item.count;

      if (item.subCategory) {
        const sub = item.subCategory.toLowerCase();
        subMap[sub] = (subMap[sub] || 0) + item.count;
      }
    }

    return { categoryTotalMap: catMap, subCategoryTotalMap: subMap };
  }, [nicheCounts]);

  const toggleExpand = (nicheId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNiches((prev) => ({
      ...prev,
      [nicheId]: !prev[nicheId],
    }));
  };

  const isNicheSelected = (niche: NicheDefinition) => {
    return selectedNiches.includes(niche.id) || selectedNiches.includes(niche.dbCategory);
  };

  const isSubNicheSelected = (sub: SubNicheDefinition, parentSelected: boolean) => {
    return parentSelected || selectedSubNiches.includes(sub.id) || selectedSubNiches.includes(sub.label);
  };

  const handleNicheToggle = (niche: NicheDefinition) => {
    const isSelected = isNicheSelected(niche);
    const subNicheIds = niche.subNiches.map((s) => s.id);
    const subNicheLabels = niche.subNiches.map((s) => s.label);

    if (isSelected) {
      // Unselect niche and all its sub-niches
      onChangeNiches(selectedNiches.filter((c) => c !== niche.id && c !== niche.dbCategory));
      onChangeSubNiches(selectedSubNiches.filter((s) => !subNicheIds.includes(s) && !subNicheLabels.includes(s)));
    } else {
      // Select niche by its canonical URL-safe slug
      const cleaned = selectedNiches.filter((c) => c !== niche.id && c !== niche.dbCategory);
      onChangeNiches([...cleaned, niche.id]);
      // Remove specific sub-niches belonging to this niche since the whole niche is now active
      onChangeSubNiches(selectedSubNiches.filter((s) => !subNicheIds.includes(s) && !subNicheLabels.includes(s)));
    }
  };

  const handleSubNicheToggle = (niche: NicheDefinition, sub: SubNicheDefinition) => {
    const parentSelected = isNicheSelected(niche);
    const isSubActive = selectedSubNiches.includes(sub.id) || selectedSubNiches.includes(sub.label);

    const subIds = niche.subNiches.map((s) => s.id);
    const subLabels = niche.subNiches.map((s) => s.label);

    if (parentSelected) {
      // Parent was selected (meaning all). Now switching to selective sub-niches:
      // Remove parent, select all OTHER sub-niches in this category except the clicked one
      const allOtherSubs = niche.subNiches
        .filter((s) => s.id !== sub.id)
        .map((s) => s.id);
      onChangeNiches(selectedNiches.filter((c) => c !== niche.id && c !== niche.dbCategory));
      const cleanedSubs = selectedSubNiches.filter((s) => !subIds.includes(s) && !subLabels.includes(s));
      onChangeSubNiches(Array.from(new Set([...cleanedSubs, ...allOtherSubs])));
      return;
    }

    if (isSubActive) {
      onChangeSubNiches(selectedSubNiches.filter((s) => s !== sub.id && s !== sub.label));
    } else {
      const nextSubs = [...selectedSubNiches.filter((s) => s !== sub.label), sub.id];
      // Check if all sub-niches for this category are now selected
      const allSelected = niche.subNiches.every(
        (s) => nextSubs.includes(s.id) || nextSubs.includes(s.label)
      );
      if (allSelected) {
        // Upgrade to full parent niche selection
        const cleaned = selectedNiches.filter((c) => c !== niche.id && c !== niche.dbCategory);
        onChangeNiches([...cleaned, niche.id]);
        onChangeSubNiches(nextSubs.filter((s) => !subIds.includes(s) && !subLabels.includes(s)));
      } else {
        onChangeSubNiches(nextSubs);
      }
    }
  };

  // Filter taxonomy when user searches
  const filteredTaxonomy = useMemo(() => {
    if (!searchTerm.trim()) return NICHE_TAXONOMY;
    const query = searchTerm.toLowerCase();

    return NICHE_TAXONOMY.filter((niche) => {
      const nicheMatch = niche.label.toLowerCase().includes(query) || niche.dbCategory.toLowerCase().includes(query);
      const subMatch = niche.subNiches.some((sub) => sub.label.toLowerCase().includes(query));
      return nicheMatch || subMatch;
    });
  }, [searchTerm]);

  const hasSearch = searchTerm.trim().length > 0;

  return (
    <div className={`space-y-2 text-xs ${className}`}>
      {/* Search Niche Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter niches & sub-niches..."
          className="w-full bg-background text-foreground text-xs rounded-lg pl-8 pr-7 py-1.5 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium transition-colors"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Niches Tree List */}
      <div className="space-y-1">
        {filteredTaxonomy.map((niche) => {
          const Icon = ICON_MAP[niche.icon] || Layers;
          const isParentSelected = isNicheSelected(niche);
          const activeSubNiches = niche.subNiches.filter(
            (s) => selectedSubNiches.includes(s.id) || selectedSubNiches.includes(s.label)
          );
          const isPartiallySelected = !isParentSelected && activeSubNiches.length > 0;
          const isExpanded = hasSearch || !!expandedNiches[niche.id];

          // Compute count
          let nicheCount = categoryTotalMap[niche.dbCategory.toLowerCase()] || 0;

          return (
            <div key={niche.id} className="rounded-lg overflow-hidden transition-colors">
              {/* Parent Row */}
              <div
                className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors ${
                  isParentSelected
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold"
                    : isPartiallySelected
                    ? "bg-accent/60 text-foreground font-medium"
                    : "hover:bg-accent/50 text-foreground/80 hover:text-foreground"
                }`}
                onClick={() => handleNicheToggle(niche)}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {/* Expand Chevron */}
                  <button
                    type="button"
                    onClick={(e) => toggleExpand(niche.id, e)}
                    className="p-0.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                    aria-label="Toggle sub-niches"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Custom Checkbox */}
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                      isParentSelected
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                        : isPartiallySelected
                        ? "bg-indigo-600/30 border-indigo-500 text-indigo-600 dark:text-indigo-300"
                        : "border-border group-hover:border-indigo-400 bg-background"
                    }`}
                  >
                    {isParentSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    {isPartiallySelected && <div className="w-1.5 h-1.5 bg-indigo-600 dark:bg-indigo-400 rounded-[1px]" />}
                  </div>

                  <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate text-xs">{niche.label}</span>
                </div>

                {/* Count Badge */}
                {nicheCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums text-muted-foreground bg-muted shrink-0 ml-1.5">
                    {nicheCount}
                  </span>
                )}
              </div>

              {/* Sub-niches List */}
              {isExpanded && (
                <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l-2 border-border/40 ml-3.5 my-0.5 animate-in fade-in duration-150">
                  {niche.subNiches.map((sub) => {
                    const isSubSelected = isSubNicheSelected(sub, isParentSelected);

                    // Sub-niche count
                    let subCount = 0;
                    for (const dbVal of sub.dbValues) {
                      subCount += subCategoryTotalMap[dbVal.toLowerCase()] || 0;
                    }

                    return (
                      <div
                        key={sub.id}
                        className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer select-none transition-colors text-[11px] ${
                          isSubSelected
                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium"
                            : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => handleSubNicheToggle(niche, sub)}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <div
                            className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 transition-all ${
                              isSubSelected
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-border bg-background"
                            }`}
                          >
                            {isSubSelected && <Check className="w-2 h-2 stroke-[3]" />}
                          </div>
                          <span className="truncate">{sub.label}</span>
                        </div>

                        {subCount > 0 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full font-semibold tabular-nums text-muted-foreground/80 bg-muted/60 shrink-0 ml-1">
                            {subCount}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
