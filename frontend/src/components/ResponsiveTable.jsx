import { Children, Fragment, isValidElement, useLayoutEffect, useRef, useState } from "react";
import useMediaQuery from "../hooks/useMediaQuery";

// Reuse the actual cells and their handlers: mobile must not introduce a second
// permission/action implementation or omit information from the desktop table.
function elements(children) {
  return Children.toArray(children).flatMap(child => isValidElement(child)
    ? child.type === Fragment ? elements(child.props.children) : [child]
    : []);
}

export default function ResponsiveTable({ children, primary = [0], summary = [], label = "Daftar data", minTableWidth = 720, ...props }) {
  const phone = useMediaQuery("(max-width: 767px)");
  const tablet = useMediaQuery("(max-width: 1199px)");
  const wrapper = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(Infinity);
  useLayoutEffect(() => {
    const node = wrapper.current;
    const measure = () => setAvailableWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const compact = phone || (tablet && availableWidth < minTableWidth);
  if (!compact) return <div ref={wrapper} className="kms-responsive-table"><table {...props}>{children}</table></div>;
  const sections = elements(children);
  const head = sections.find(section => section.type === 'thead');
  const body = sections.find(section => section.type === 'tbody');
  const headings = elements(elements(head?.props.children)[0]?.props.children);
  const rows = elements(body?.props.children);
  return <div ref={wrapper} className="kms-responsive-table"><ul className="kms-responsive-rows" aria-label={label}>
    {rows.map((row, rowIndex) => {
      const cells = elements(row.props.children);
      const actions = headings.findIndex(cell => cell.props.children === 'Aksi');
      const visible = new Set([...primary, ...summary, actions]);
      const details = cells.map((cell, i) => ({ cell, i })).filter(({ i }) => !visible.has(i));
      return <li key={row.key ?? rowIndex}>
        <div className="kms-responsive-row-title">{primary.map(i => <div key={i}>{cells[i]?.props.children}</div>)}</div>
        {summary.map(i => <div key={i} className="kms-responsive-row-status">{cells[i]?.props.children}</div>)}
        {details.length > 0 && <details><summary>Rincian</summary><dl>{details.map(({ cell, i }) => <div key={i}><dt>{headings[i]?.props.children || headings[i]?.props['aria-label']}</dt><dd>{cell.props.children}</dd></div>)}</dl></details>}
        {actions >= 0 && <div className="kms-responsive-row-actions">{cells[actions]?.props.children}</div>}
      </li>;
    })}
  </ul></div>;
}
