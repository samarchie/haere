import {
  AlertTriangle,
  Building2,
  EyeOff,
  Globe,
  Hexagon,
  Lock,
  MapPin,
  Route,
  Server,
} from "lucide-react";
import { useState } from "react";
import { Modal } from "./ui/modal";

interface AboutPrivacyLinksProps {
  className?: string;
}

export function AboutPrivacyLinks({
  className = "sd-focus text-[11px] text-ink-soft hover:text-ink",
}: AboutPrivacyLinksProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setAboutOpen(true)}
      >
        About this analysis
      </button>
      <button
        type="button"
        className={className}
        onClick={() => setPrivacyOpen(true)}
      >
        Privacy
      </button>

      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="About this analysis"
        maxWidthClassName="max-w-[480px]"
      >
        <div className="space-y-4 text-[13px] leading-relaxed text-ink-soft">
          <section className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                What haere does
              </h3>
              <p>
                Type in your address and the places you go, and haere shows how
                a proposed change to bus and train routes would affect those
                specific trips.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                Not an official tool
              </h3>
              <p>
                haere isn&apos;t run by your council or transport authority.
                Using it doesn&apos;t send feedback to anyone. If you want to
                have your say on the proposal, that has to be done separately
                through the official consultation.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <Route className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                How the numbers are worked out
              </h3>
              <p>
                haere works out travel times from public timetables, for both
                the current network and the proposed one. It&apos;s a model, not
                a guarantee: timetables change, and real trips can run into
                things a model can&apos;t see, like roadworks or a late bus.
                Treat the result as a solid estimate, not the final word.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <Hexagon className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                Why results come in hexagons
              </h3>
              <p>
                haere pre-calculates travel times for small hexagon-shaped zones
                across the map, not for every address. Your address gets matched
                to the hexagon it falls in, so a neighbour a few doors down will
                usually see the same numbers you do.
              </p>
            </div>
          </section>

          <p>No account is needed, and nothing you enter is sold or shared.</p>

          <p className="border-t border-kotare-grey/50 pt-3 text-[12px]">
            Technical note: routing runs on r5py, an open source transport
            router. For each trip, it checks 60 different departure times across
            your chosen time window and reports the middle value (the median),
            not a plain average. A trip only counts as changed if that shifts by
            more than two minutes. Smaller shifts are treated as modelling noise
            rather than a real difference.
          </p>
        </div>
      </Modal>
      <Modal
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="Privacy"
        maxWidthClassName="max-w-[480px]"
      >
        <div className="space-y-4 text-[13px] leading-relaxed text-ink-soft">
          <section className="flex gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                What stays on your device
              </h3>
              <p>
                Your address, the destinations you add, and any saved results
                stay in this browser&apos;s local storage. haere&apos;s own
                server never sees them.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                The one thing that leaves your browser
              </h3>
              <p>
                When you type or search for an address, that text is sent to
                Photon, a third-party address lookup service run by Komoot, so
                it can be turned into map coordinates. That&apos;s the only
                point where what you type travels further than your own browser.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <Server className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                How results reach you
              </h3>
              <p>
                Once haere has your coordinates, your browser works out which
                map hexagon they fall in and asks haere&apos;s server for that
                hexagon&apos;s slice of a pre-built results file. Your address
                is never part of that request, only a location code.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                No accounts, no tracking
              </h3>
              <p>
                There&apos;s no sign-up, no analytics, and no cookies. haere has
                no way to recognise you across visits and keeps no record of who
                ran which check. It never asks for a credit card, password, or
                any other sensitive information, and nothing you enter is sold
                or shared.
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-kotare-blue" />
            <div>
              <h3 className="mb-1 text-[13px] font-bold text-ink">
                No guarantees
              </h3>
              <p>
                haere is a personal project, not an official service, and
                it&apos;s provided as-is. There&apos;s no warranty that a result
                is accurate, complete, or current, and no guarantee it stays
                online. Don&apos;t treat it as the final word for anything that
                actually matters. Check the official timetable or your local
                transport authority instead.
              </p>
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
