"use client";

import { useState } from "react";

import { formatIsoDateForField, parseRegionalDateInput } from "@/lib/dates";

type RegionalDateInputProps = {
  locale: string;
  label: string;
  name?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChangeValue?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      invalid: "Use day/month/year.",
      placeholder: "dd/mm/yyyy",
    };
  }

  return {
    invalid: "Usa día/mes/año.",
    placeholder: "dd/mm/yyyy",
  };
}

export function RegionalDateInput({
  locale,
  label,
  name,
  defaultValue,
  value,
  onChangeValue,
  required = false,
  disabled = false,
}: RegionalDateInputProps) {
  const copy = copyForLocale(locale);
  const isControlled = typeof value !== "undefined";
  const initialValue = isControlled ? value ?? "" : defaultValue ?? "";
  const [displayValue, setDisplayValue] = useState(() => formatIsoDateForField(initialValue));
  const [hiddenValue, setHiddenValue] = useState(initialValue);
  const [error, setError] = useState("");

  function setResolvedValue(nextValue: string) {
    if (!isControlled) {
      setHiddenValue(nextValue);
    }

    onChangeValue?.(nextValue);
  }

  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {name ? <input name={name} type="hidden" value={isControlled ? value ?? "" : hiddenValue} /> : null}
      <input
        className="rounded-xl border border-line px-3 py-2.5"
        disabled={disabled}
        inputMode="numeric"
        onBlur={(event) => {
          const trimmedValue = event.currentTarget.value.trim();

          if (!trimmedValue) {
            setDisplayValue("");
            setResolvedValue("");
            setError("");
            event.currentTarget.setCustomValidity("");
            return;
          }

          const parsedValue = parseRegionalDateInput(trimmedValue);

          if (!parsedValue) {
            setError(copy.invalid);
            event.currentTarget.setCustomValidity(copy.invalid);
            event.currentTarget.reportValidity();
            return;
          }

          setDisplayValue(formatIsoDateForField(parsedValue));
          setResolvedValue(parsedValue);
          setError("");
          event.currentTarget.setCustomValidity("");
        }}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setDisplayValue(nextValue);
          setError("");
          event.currentTarget.setCustomValidity("");

          if (!nextValue.trim()) {
            setResolvedValue("");
            return;
          }

          const parsedValue = parseRegionalDateInput(nextValue);

          if (parsedValue) {
            setResolvedValue(parsedValue);
            return;
          }

          setResolvedValue("");
        }}
        placeholder={copy.placeholder}
        pattern="(\d{1,2}(?:\.|/|-)\d{1,2}(?:\.|/|-)\d{4}|\d{4}-\d{2}-\d{2})"
        required={required}
        title={copy.invalid}
        value={displayValue}
      />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </label>
  );
}
