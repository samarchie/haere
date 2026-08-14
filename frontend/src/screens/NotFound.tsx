import { ChevronLeft, MapPinOff } from "lucide-react";
import { NetworkBackdrop } from "../components/NetworkBackdrop";
import { Button } from "../components/ui/button";
import { useDocumentHead } from "../lib/useDocumentHead";
import { navigate } from "../router";

export function NotFound() {
  useDocumentHead({
    title: "Page not found",
    description: "This page doesn't exist, or it's moved.",
    path: "/404",
    noindex: true,
  });
  return (
    <div className="relative mx-auto flex w-full max-w-[920px] items-center justify-center">
      <NetworkBackdrop />
      <div className="relative z-[1] w-full max-w-[440px] rounded-2xl border border-kotare-grey bg-surface-card p-8 text-center shadow-xl shadow-kotare-blue/10 sm:p-10">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-kotare-blue/[0.08]">
          <MapPinOff className="h-6 w-6 text-kotare-blue" />
        </div>
        <div className="mb-2 font-mono text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          404
        </div>
        <h1 className="mb-3 text-[22px] font-bold leading-tight tracking-tight text-ink">
          This stop isn't on the route
        </h1>
        <p className="mx-auto mb-7 max-w-[32ch] text-[13.5px] leading-relaxed text-ink-soft">
          The page you're looking for doesn't exist, or it's moved. Head back
          and check your address instead.
        </p>
        <Button className="mx-auto" onClick={() => navigate("landing")}>
          <ChevronLeft className="h-4 w-4" />
          Back to haere
        </Button>
      </div>
    </div>
  );
}
