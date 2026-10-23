export type SearchableSelectorKeydownInput = {
  key: string;
  isOpen: boolean;
  activeIndex: number;
  itemCount: number;
};

export type SearchableSelectorKeydownDecision = {
  handled: boolean;
  nextActiveIndex: number;
  action: "none" | "open" | "select" | "close";
};

/**
 * Resolves the keyboard behavior shared by searchable single- and multi-select
 * inputs. The caller owns state changes and option selection.
 */
export function resolveSearchableSelectorKeydown({
  key,
  isOpen,
  activeIndex,
  itemCount,
}: SearchableSelectorKeydownInput): SearchableSelectorKeydownDecision {
  const hasItems = itemCount > 0;

  if (key === "ArrowDown" || key === "ArrowUp") {
    if (!hasItems) {
      return {
        handled: true,
        nextActiveIndex: -1,
        action: isOpen ? "none" : "open",
      };
    }

    const direction = key === "ArrowDown" ? 1 : -1;
    const nextActiveIndex = !isOpen || activeIndex < 0
      ? (direction === 1 ? 0 : itemCount - 1)
      : (activeIndex + direction + itemCount) % itemCount;

    return {
      handled: true,
      nextActiveIndex,
      action: isOpen ? "none" : "open",
    };
  }

  if (!isOpen) {
    return { handled: false, nextActiveIndex: activeIndex, action: "none" };
  }

  if (key === "Home") {
    return {
      handled: true,
      nextActiveIndex: hasItems ? 0 : -1,
      action: "none",
    };
  }

  if (key === "End") {
    return {
      handled: true,
      nextActiveIndex: hasItems ? itemCount - 1 : -1,
      action: "none",
    };
  }

  if (key === "Enter") {
    return {
      handled: true,
      nextActiveIndex: activeIndex,
      action: activeIndex >= 0 && activeIndex < itemCount ? "select" : "none",
    };
  }

  if (key === "Escape") {
    return { handled: true, nextActiveIndex: -1, action: "close" };
  }

  return { handled: false, nextActiveIndex: activeIndex, action: "none" };
}
