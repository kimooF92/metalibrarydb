"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ScrapedProduct } from "@/types";
import { findProductInCollection, preserveCarouselContext } from "@/lib/carousel-grouping";

interface UseProductDetailsModalParams {
  products: ScrapedProduct[];
}

export function useProductDetailsModal({ products }: UseProductDetailsModalParams) {
  const [selectedProduct, setSelectedProduct] = useState<ScrapedProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const detailRequestIdRef = useRef(0);

  const preserveKnownCarouselContext = useCallback(
    (detailedProduct: ScrapedProduct, productId: string) => {
      const sourceProduct = findProductInCollection(products, productId);
      return preserveCarouselContext(detailedProduct, sourceProduct || detailedProduct);
    },
    [products]
  );

  // Recently inspected products tracking (session-based)
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("recently_viewed_products");
      if (stored) {
        setRecentlyViewedIds(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Check for deep-linked product ID (?id=... or ?productId=...) on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id") || params.get("productId");
    if (idParam) {
      const requestId = ++detailRequestIdRef.current;
      fetch(`/api/products?id=${encodeURIComponent(idParam)}`)
        .then((res) => res.json())
        .then((data) => {
          if (
            requestId === detailRequestIdRef.current &&
            data.success &&
            data.products &&
            data.products.length > 0
          ) {
            const sourceProduct = findProductInCollection(products, idParam);
            setSelectedProduct(
              preserveCarouselContext(data.products[0], sourceProduct || data.products[0])
            );
            setIsModalOpen(true);
          }
        })
        .catch((err) => console.error("[Products Page] Deep-link product fetch error:", err));
    }
  // The follow-up products effect below repairs context when the feed arrives later.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A deep link can resolve before the paginated product feed. Re-attach its
  // bundle context once the matching grouped product is available locally.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id") || params.get("productId");
    if (!idParam) return;

    const sourceProduct = findProductInCollection(products, idParam);
    if (!sourceProduct) return;

    setSelectedProduct((previous) =>
      previous?.id === idParam
        ? preserveCarouselContext(previous, sourceProduct)
        : sourceProduct
    );
    setIsModalOpen(true);
  }, [products]);

  // Popstate listener for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get("id") || params.get("productId");
      if (idParam) {
        const requestId = ++detailRequestIdRef.current;
        const found = findProductInCollection(products, idParam);
        if (found) {
          setSelectedProduct(found);
          setIsModalOpen(true);
        } else {
          fetch(`/api/products?id=${encodeURIComponent(idParam)}`)
            .then((res) => res.json())
            .then((data) => {
              if (
                requestId === detailRequestIdRef.current &&
                data.success &&
                data.products &&
                data.products.length > 0
              ) {
                setSelectedProduct(preserveKnownCarouselContext(data.products[0], idParam));
                setIsModalOpen(true);
              }
            })
            .catch((err) => console.error("[Products Page] Popstate product fetch error:", err));
        }
      } else {
        detailRequestIdRef.current += 1;
        setIsModalOpen(false);
        setSelectedProduct(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [products, preserveKnownCarouselContext]);

  // Continuous sync between active modal state and URL address bar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (isModalOpen && selectedProduct?.id) {
      if (url.searchParams.get("id") !== selectedProduct.id) {
        url.searchParams.set("id", selectedProduct.id);
        window.history.replaceState(null, "", url.toString());
      }
    } else if (!isModalOpen) {
      if (url.searchParams.has("id") || url.searchParams.has("productId")) {
        url.searchParams.delete("id");
        url.searchParams.delete("productId");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [isModalOpen, selectedProduct]);

  const handleViewDetails = useCallback(async (product: ScrapedProduct) => {
    const requestId = ++detailRequestIdRef.current;
    setSelectedProduct(product);
    setIsModalOpen(true);

    setRecentlyViewedIds((prev) => {
      const updated = [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 40);
      try {
        sessionStorage.setItem("recently_viewed_products", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("id", product.id);
      window.history.replaceState(null, "", url.toString());
    }
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(product.id)}&details=true`);
      const json = await res.json();
      const detailedProduct = json.products?.[0];
      if (requestId === detailRequestIdRef.current && res.ok && detailedProduct) {
        setSelectedProduct(preserveCarouselContext(detailedProduct, product));
      }
    } catch {
      // Keep lean product card available if detail loading fails
    }
  }, []);

  const handleCloseDetailsModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedProduct(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("id") || url.searchParams.has("productId")) {
        url.searchParams.delete("id");
        url.searchParams.delete("productId");
        window.history.pushState({}, "", url.toString());
      }
    }
  }, []);

  // Modal sequential navigation
  const currentProductIndex = selectedProduct
    ? products.findIndex(
        (p) =>
          p.id === selectedProduct.id ||
          Boolean(p.carouselItems?.some((item) => item.id === selectedProduct.id))
      )
    : -1;

  const handleNavigatePrev = useCallback(() => {
    if (currentProductIndex > 0) {
      handleViewDetails(products[currentProductIndex - 1]);
    }
  }, [currentProductIndex, products, handleViewDetails]);

  const handleNavigateNext = useCallback(() => {
    if (currentProductIndex >= 0 && currentProductIndex < products.length - 1) {
      handleViewDetails(products[currentProductIndex + 1]);
    }
  }, [currentProductIndex, products, handleViewDetails]);

  return {
    selectedProduct,
    setSelectedProduct,
    isModalOpen,
    setIsModalOpen,
    recentlyViewedIds,
    handleViewDetails,
    handleCloseDetailsModal,
    currentProductIndex,
    handleNavigatePrev,
    handleNavigateNext,
  };
}

