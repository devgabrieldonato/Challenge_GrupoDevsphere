import { useId } from "react";

/** Campo de formulário acessível: label ligado ao input e erro anunciado por aria-describedby. */
export default function TextField({ label, error, hint, multiline = false, ...props }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const Tag = multiline ? "textarea" : "input";
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <Tag id={id} className="field" aria-invalid={error ? "true" : undefined} aria-describedby={describedBy} {...props} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
