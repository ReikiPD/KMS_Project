const formatPercent = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);

export default function MediaCompositionChart({ items = [], centerLabel = "Total", valueFormatter = (value) => value }) {
  const normalized = items.map((item) => ({ ...item, value: Math.max(0, Number(item.value) || 0) }));
  const total = normalized.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const segments = normalized.map((item) => {
    const start = total ? cursor / total * 100 : 0;
    cursor += item.value;
    const end = total ? cursor / total * 100 : 0;
    return `${item.color} ${start}% ${end}%`;
  });
  const background = total ? `conic-gradient(${segments.join(", ")})` : "var(--color-bg-tertiary, #e8eef5)";

  return <div className="kms-media-composition">
    <div className="kms-media-donut" style={{ background }} role="img" aria-label={`Komposisi media, total ${valueFormatter(total)}`}>
      <div className="kms-media-donut-center"><strong>{valueFormatter(total)}</strong><span>{centerLabel}</span></div>
    </div>
    <ul className="kms-media-composition-legend">
      {normalized.map((item) => {
        const percent = total ? item.value / total * 100 : 0;
        return <li key={item.key || item.label}>
          <span className="kms-media-legend-dot" style={{ background: item.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1"><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span>
          <span className="kms-media-legend-value"><strong>{formatPercent(percent)}%</strong><small>{valueFormatter(item.value)}</small></span>
        </li>;
      })}
    </ul>
  </div>;
}
