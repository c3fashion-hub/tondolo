import { useId, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextField({ label, hint, error, id, ...rest }: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className="tn-field">
      <label className="tn-field-label" htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        className="tn-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />
      {error ? <span id={errorId} className="tn-field-error">{error}</span> : null}
      {hint ? <em id={hintId} className="tn-field-hint">{hint}</em> : null}
    </div>
  );
}
