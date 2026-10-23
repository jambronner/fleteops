"use client";

import { useCallback, useMemo, useState } from "react";

export function useDirtyFormRegistry() {
  const [dirtyForms, setDirtyForms] = useState<Record<string, true>>({});

  const setFormDirty = useCallback((formId: string, dirty: boolean) => {
    setDirtyForms((current) => {
      const alreadyDirty = Boolean(current[formId]);

      if (dirty === alreadyDirty) {
        return current;
      }

      if (dirty) {
        return {
          ...current,
          [formId]: true,
        };
      }

      const next = { ...current };
      delete next[formId];
      return next;
    });
  }, []);

  const clearAllDirty = useCallback(() => {
    setDirtyForms({});
  }, []);

  const hasDirtyForms = useMemo(() => Object.keys(dirtyForms).length > 0, [dirtyForms]);

  return {
    dirtyForms,
    hasDirtyForms,
    setFormDirty,
    clearAllDirty,
  };
}
