"use client";

import { useCallback, useEffect } from "react";

type UseUnsavedChangesGuardArgs = {
  isDirty: boolean;
  message: string;
};

function shouldIgnoreAnchorNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return true;
  }

  if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return true;
  }

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
    return true;
  }

  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(anchor.href, window.location.href);

  return currentUrl.href === nextUrl.href;
}

export function useUnsavedChangesGuard({ isDirty, message }: UseUnsavedChangesGuardArgs) {
  const confirmIfNeeded = useCallback(() => {
    if (!isDirty) {
      return true;
    }

    return window.confirm(message);
  }, [isDirty, message]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");

      if (!(anchor instanceof HTMLAnchorElement) || shouldIgnoreAnchorNavigation(event, anchor)) {
        return;
      }

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isDirty, message]);

  return {
    confirmIfNeeded,
  };
}
