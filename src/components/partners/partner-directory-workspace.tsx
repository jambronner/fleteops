"use client";

import { ChevronDown, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { PartnerDirectoryShell } from "@/components/partners/partner-directory-shell";
import { WhatsappSourceReviewPanel } from "@/components/partners/whatsapp-source-review-panel";
import type { PartnerLocationRecord } from "@/lib/partners/locations";
import type { PartnerContactRecord, PartnerOrganizationRecord } from "@/lib/partners/repository";
import type { WhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";

type PartnerDirectoryWorkspaceProps = {
  locale: string;
  canManage: boolean;
  sourceReviewTitle: string;
  coverageTitle: string;
  coverageEmpty: string;
  coverageUnnamedContact: string;
  coverageGroups: {
    organizations: string;
    locations: string;
    contacts: string;
  };
  organizations: PartnerOrganizationRecord[];
  locations: PartnerLocationRecord[];
  contacts: PartnerContactRecord[];
  whatsappSources: WhatsappSourceReviewSnapshot;
};

const sourceReviewStorageKey = "whatsapp-source-review";

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      show: "Show",
      hide: "Hide",
      showSourceReview: "Show WhatsApp source review",
    };
  }

  return {
    show: "Mostrar",
    hide: "Ocultar",
    showSourceReview: "Mostrar revisión de fuentes de WhatsApp",
  };
}

export function PartnerDirectoryWorkspace({
  locale,
  canManage,
  sourceReviewTitle,
  coverageTitle,
  coverageEmpty,
  coverageUnnamedContact,
  coverageGroups,
  organizations,
  locations,
  contacts,
  whatsappSources,
}: PartnerDirectoryWorkspaceProps) {
  const copy = copyForLocale(locale);
  const [isSourceReviewOpen, setIsSourceReviewOpen] = useState(
    whatsappSources.reviewMetrics.unclaimedSources > 0,
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.location.hash === "#whatsapp-source-review") {
        setIsSourceReviewOpen(true);
        return;
      }

      const savedValue = window.localStorage.getItem(sourceReviewStorageKey);
      if (savedValue === "open") {
        setIsSourceReviewOpen(true);
      }

      if (savedValue === "closed") {
        setIsSourceReviewOpen(false);
      }
    });

    function openSourceReview(event: Event) {
      const detail = (event as CustomEvent<{ storageKey?: string }>).detail;

      if (detail?.storageKey !== sourceReviewStorageKey) {
        return;
      }

      setIsSourceReviewOpen(true);
      window.localStorage.setItem(sourceReviewStorageKey, "open");
    }

    window.addEventListener("fleteops:open-collapsible", openSourceReview);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("fleteops:open-collapsible", openSourceReview);
    };
  }, []);

  function setSourceReviewOpen(isOpen: boolean) {
    setIsSourceReviewOpen(isOpen);
    window.localStorage.setItem(sourceReviewStorageKey, isOpen ? "open" : "closed");
  }

  return (
    <div
      className={`flex min-h-[720px] flex-col gap-4 xl:min-h-0 xl:flex-1 xl:overflow-clip 2xl:grid 2xl:h-full 2xl:transition-[grid-template-columns] 2xl:duration-300 2xl:ease-out ${
        isSourceReviewOpen
          ? "2xl:grid-cols-[minmax(560px,0.82fr)_minmax(0,1.68fr)]"
          : "2xl:grid-cols-[64px_minmax(0,1fr)]"
      }`}
    >
      <div className="scroll-mt-4 min-h-0" id="whatsapp-source-review">
        <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm 2xl:h-full">
          {isSourceReviewOpen ? (
            <button
              aria-controls="whatsapp-source-review-content"
              aria-expanded="true"
              className="flex w-full flex-shrink-0 items-center justify-between gap-4 px-4 py-4 text-left sm:px-6"
              onClick={() => setSourceReviewOpen(false)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                <MessageCircle className="h-4 w-4 flex-shrink-0 text-accent" />
                <span className="truncate font-display text-xl font-semibold text-ink">
                  {sourceReviewTitle}
                </span>
              </span>
              <span className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-accent">
                {copy.hide}
                <ChevronDown className="h-4 w-4 rotate-180 2xl:hidden" />
                <ChevronLeft className="hidden h-4 w-4 2xl:block" />
              </span>
            </button>
          ) : (
            <>
              <button
                aria-controls="whatsapp-source-review-content"
                aria-expanded="false"
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-6 2xl:hidden"
                onClick={() => setSourceReviewOpen(true)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MessageCircle className="h-4 w-4 flex-shrink-0 text-accent" />
                  <span className="truncate font-display text-xl font-semibold text-ink">
                    {sourceReviewTitle}
                  </span>
                </span>
                <span className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-accent">
                  {copy.show}
                  <ChevronDown className="h-4 w-4" />
                </span>
              </button>

              <button
                aria-controls="whatsapp-source-review-content"
                aria-expanded="false"
                className="hidden h-full w-full flex-col items-center justify-start gap-3 px-2 py-5 text-accent transition hover:bg-tint 2xl:flex"
                onClick={() => setSourceReviewOpen(true)}
                title={copy.showSourceReview}
                type="button"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">{copy.showSourceReview}</span>
              </button>
            </>
          )}

          <div
            className={`${
              isSourceReviewOpen ? "block" : "hidden"
            } border-t border-line-2 px-4 pb-4 pt-0 2xl:min-h-0 2xl:flex-1 2xl:overflow-y-auto`}
            id="whatsapp-source-review-content"
          >
            <WhatsappSourceReviewPanel
              canManage={canManage}
              contacts={contacts}
              locale={locale}
              organizations={organizations}
              snapshot={whatsappSources}
            />
          </div>
        </article>
      </div>

      <div className="min-h-[520px] xl:min-h-0 xl:flex-1 xl:overflow-hidden 2xl:h-full">
        <PartnerDirectoryShell
          canManage={canManage}
          contacts={contacts}
          coverageEmpty={coverageEmpty}
          coverageGroups={coverageGroups}
          coverageTitle={coverageTitle}
          coverageUnnamedContact={coverageUnnamedContact}
          locale={locale}
          locations={locations}
          organizations={organizations}
          whatsappSources={whatsappSources}
        />
      </div>
    </div>
  );
}
