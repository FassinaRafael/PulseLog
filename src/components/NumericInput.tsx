import React, { useState } from 'react';

interface NumericInputProps {
  value: number;
  onCommit: (value: number) => void;
  mode: 'decimal' | 'numeric';
  min?: number;
  max?: number;
  formatValue?: (value: number) => string;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}

function sanitizeRawInput(raw: string, mode: 'decimal' | 'numeric'): string {
  if (mode === 'numeric') {
    return raw.replace(/[^\d]/g, '');
  }
  const normalized = raw.replace(',', '.').replace(/[^\d.]/g, '');
  const dotIdx = normalized.indexOf('.');
  if (dotIdx === -1) return normalized;
  return (
    normalized.slice(0, dotIdx + 1) +
    normalized.slice(dotIdx + 1).replace(/\./g, '')
  );
}

/**
 * Input numérico com estado local durante o foco para permitir limpar
 * o campo com Backspace sem forçar `0` / `0.0` durante a digitação.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onCommit,
  mode,
  min = 0,
  max,
  formatValue,
  className,
  ariaLabel,
  placeholder,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const formattedExternal = formatValue ? formatValue(value) : String(value);

  const clampValue = (num: number): number => {
    let clamped = Math.max(min, num);
    if (max !== undefined) {
      clamped = Math.min(max, clamped);
    }
    return clamped;
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setDraft(formattedExternal);
    setIsFocused(true);
    const target = e.currentTarget;
    window.requestAnimationFrame(() => {
      target.select();
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitizeRawInput(e.target.value, mode);
    setDraft(cleaned);

    if (cleaned === '' || cleaned.endsWith('.')) {
      return;
    }

    const parsed =
      mode === 'numeric' ? parseInt(cleaned, 10) : parseFloat(cleaned);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      onCommit(clampValue(parsed));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '.') {
      return;
    }
    const parsed =
      mode === 'numeric' ? parseInt(trimmed, 10) : parseFloat(trimmed);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      onCommit(clampValue(parsed));
    }
  };

  return (
    <input
      type="text"
      inputMode={mode}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={isFocused ? draft : formattedExternal}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
};
