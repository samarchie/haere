import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidthClassName?: string;
}

// Exit must finish before unmount, and must match the slowest exit
// transition below (backdrop and dialog both settle within 150ms on close).
const EXIT_DURATION_MS = 150;

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-[420px]",
}: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  // Stay mounted through the exit transition instead of vanishing on the
  // same frame `open` flips false — entered toggles first so the dialog
  // has a from-state to transition out of, then unmount follows once that
  // transition has had time to finish.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const timeout = setTimeout(() => setMounted(false), EXIT_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: non-interactive backdrop; Escape-to-close handled by document-level listener
    <div
      ref={backdropRef}
      data-testid="modal-backdrop"
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 transition-opacity duration-150 motion-reduce:transition-none ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: non-interactive container; click only distinguishes backdrop-vs-content */}
      <dialog
        open
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxWidthClassName} rounded-xl bg-surface-card p-6 shadow-xl border-0 transition-[opacity,transform] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:!translate-y-0 motion-reduce:!scale-100 ${
          entered
            ? "translate-y-0 scale-100 opacity-100 duration-200"
            : "translate-y-2 scale-[0.97] opacity-0 duration-150"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="sd-focus rounded-md p-1 text-ink-soft transition-colors duration-150 hover:bg-kotare-grey/25 hover:text-ink"
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
