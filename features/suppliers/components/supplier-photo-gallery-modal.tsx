"use client";

import { useState, useEffect, useCallback } from "react";
import { Supplier, SupplierPhoto } from "@/types";
import { X, ExternalLink, Download, Copy, Loader2, Calendar, Images, Check } from "lucide-react";

interface SupplierPhotoGalleryModalProps {
  supplier: Supplier | null;
  isOpen: boolean;
  onClose: () => void;
  showToast: (type: "success" | "error" | "info", message: string) => void;
}

export function SupplierPhotoGalleryModal({
  supplier,
  isOpen,
  onClose,
  showToast,
}: SupplierPhotoGalleryModalProps) {
  const [photos, setPhotos] = useState<SupplierPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<SupplierPhoto | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    if (!supplier) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/photos?limit=80`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPhotos(data.photos || []);
      } else {
        showToast("error", "Failed to load supplier photos.");
      }
    } catch {
      showToast("error", "Error connecting to photo service.");
    } finally {
      setLoading(false);
    }
  }, [supplier, showToast]);

  useEffect(() => {
    if (isOpen && supplier) {
      fetchPhotos();
      setSelectedPhoto(null);
    }
  }, [isOpen, supplier, fetchPhotos]);

  if (!isOpen || !supplier) return null;

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast("success", "Photo link copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[88vh] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {supplier.name} — Photos Gallery
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {photos.length} Photos
              </span>
            </div>
            {supplier.lastAlbumTitle && (
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                Album: {supplier.lastAlbumTitle}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs">Loading photos...</p>
            </div>
          ) : photos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Images className="w-10 h-10 opacity-30" />
              <p className="text-sm font-semibold">No photos found for this supplier.</p>
              <p className="text-xs text-slate-500">Run a "Check Now" scan to scrape the latest product album.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800/80 hover:border-indigo-500 transition-all cursor-pointer shadow-xs"
                >
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || "Supplier product photo"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(photo.photoUrl, photo.id);
                        }}
                        title="Copy image link"
                        className="p-1 rounded bg-black/60 text-white hover:bg-black/90 transition-colors"
                      >
                        {copiedId === photo.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>

                    {photo.caption && (
                      <p className="text-[10px] text-white line-clamp-2 leading-tight">
                        {photo.caption}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lightbox Fullview Modal when a photo is clicked */}
        {selectedPhoto && (
          <div
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-3xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex flex-col shadow-2xl"
            >
              <div className="p-3 border-b border-slate-800 flex items-center justify-between text-white text-xs">
                <span className="font-semibold truncate">
                  {selectedPhoto.albumTitle || supplier.name}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={selectedPhoto.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[11px]"
                  >
                    <ExternalLink className="w-3 h-3" /> Full Res
                  </a>
                  <button
                    onClick={() => setSelectedPhoto(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 flex items-center justify-center bg-black/60 overflow-hidden">
                <img
                  src={selectedPhoto.photoUrl}
                  alt={selectedPhoto.caption || "Full resolution photo"}
                  className="max-h-[65vh] max-w-full object-contain rounded-lg"
                />
              </div>

              {selectedPhoto.caption && (
                <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-slate-300 text-xs leading-relaxed max-h-24 overflow-y-auto">
                  {selectedPhoto.caption}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

