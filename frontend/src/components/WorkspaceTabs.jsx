import { useId } from "react";

export default function WorkspaceTabs({ items, value, onChange, label, className = "" }) {
  const id = useId();
  return <div className={`kms-workspace-tabs ${className}`} role="tablist" aria-label={label}>{items.map(([key, text], index) => <button
    type="button" role="tab" key={key} id={`${id}-${key}`} aria-selected={value === key} tabIndex={value === key ? 0 : -1}
    onClick={() => onChange(key)} onKeyDown={event => {
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowRight" ? (index + 1) % items.length : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length : null;
      if (next == null) return;
      event.preventDefault(); onChange(items[next][0]); document.getElementById(`${id}-${items[next][0]}`)?.focus();
    }}>{text}</button>)}</div>;
}
