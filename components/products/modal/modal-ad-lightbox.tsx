"use client";

import { Ad } from "@/types";
import { ProductCreativeModal, ProductCreativeModalProps } from "./product-creative-modal";

export { ProductCreativeModal };
export type { ProductCreativeModalProps };

export interface ModalAdLightboxProps {
  ad: Ad | null;
  onClose: () => void;
  ads?: Ad[];
  currentIndex?: number;
  onNavigateIndex?: (index: number) => void;
}

export function ModalAdLightbox({
  ad,
  onClose,
  ads,
  currentIndex,
  onNavigateIndex,
}: ModalAdLightboxProps) {
  return (
    <ProductCreativeModal
      isOpen={Boolean(ad)}
      onClose={onClose}
      ad={ad}
      ads={ads}
      currentIndex={currentIndex}
      onNavigateIndex={onNavigateIndex}
    />
  );
}
