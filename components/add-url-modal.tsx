"use client";

import React, { createContext, useContext, useState } from "react";
import { AddUrlForm } from "./add-url-form";
import { PlusCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
      <Dialog open={isOpen} onOpenChange={(open) => !open && closeAddUrlModal()}>
        <DialogContent className="max-w-xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Add Brand
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Enter a website, store link, or Meta Ad Library URL to start tracking
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Form */}
          <AddUrlForm
            onSuccess={() => {
              setTimeout(() => {
                closeAddUrlModal();
              }, 1200);
            }}
          />
        </DialogContent>
      </Dialog>
    </AddUrlModalContext.Provider>
  );
}
