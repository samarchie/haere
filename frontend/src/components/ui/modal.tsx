import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <dialog
        open
        aria-label={title}
        className="w-full max-w-[420px] rounded-xl bg-surface-card p-6 shadow-xl border-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="sd-focus rounded-md p-1 text-ink-soft hover:bg-kotare-grey/25 hover:text-ink"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}
