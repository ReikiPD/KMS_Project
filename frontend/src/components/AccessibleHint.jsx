import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function AccessibleHint({ title, children, className = "" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const [position, setPosition] = useState(null);
  useEffect(() => {
    if (!open) { setPosition(null); return; }
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    setPosition({ position: "fixed", width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), ...(rect.top > window.innerHeight / 2 ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) });
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  return <span className={`kms-accessible-hint ${className}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <span ref={anchor} role="button" tabIndex={0} aria-label={title} aria-expanded={open} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}
      onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setOpen(true); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>{children}</span>
    {open && position && createPortal(<span className="kms-hint-bubble" style={position} role="tooltip" id={id}>{title}</span>, document.body)}
  </span>;
}
