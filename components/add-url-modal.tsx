"use client";

import React, { createContext, useContext, useState } from "react";
import { AddUrlForm } from "./add-url-form";
import { X, PlusCircle } from "lucide-react";

interface AddUrlModalContextType {
  isOpen: boolean;
  openAddUrlModal: () => void;
  closeAddUrlModal: () => void;
}

const AddUrlModalContext = createContext<AddUrlModalContextType>({
  isOpen: false,
  openAddUrlModal: () => {},
  closeAddUrlModal: () => {},
});

export function useAddUrlModal() {
  return useContext(AddUrlModalContext);
}

export function AddUrlModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openAddUrlModal = () => setIsOpen(true);
  const closeAddUrlModal = () => setIsOpen(false);

  return (
    <AddUrlModalContext.Provider value={{ isOpen, openAddUrlModal, closeAddUrlModal }}>
      {children}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeAddUrlModal}
        >
          <div
            className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                    Add Brand
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter a website, store link, or Meta Ad Library URL to start tracking
                  </p>
                </div>
              </div>
              <button
                onClick={closeAddUrlModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <AddUrlForm
              onSuccess={() => {
                setTimeout(() => {
                  closeAddUrlModal();
                }, 1200);
              }}
            />
          </div>
        </div>
      )}
    </AddUrlModalContext.Provider>
  );
}
