export default function MobileDataList({ rows, columns, primary = ["title", "is_published", "actions"], rowKey = "id" }) {
  const main = columns.filter(column => primary.includes(column.accessor));
  const more = columns.filter(column => !primary.includes(column.accessor));
  const value = (column, row) => column.render ? column.render(row) : row[column.accessor];
  return <ul className="kms-mobile-data-list" aria-label="Daftar ringkas">{rows.map(row => <li key={row[rowKey]}>
    {main.map(column => <div key={column.accessor} className={`kms-mobile-data-${column.accessor}`}>{value(column, row)}</div>)}
    {more.length > 0 && <details><summary>Rincian tambahan</summary><dl>{more.map(column => <div key={column.accessor}><dt>{column.header}</dt><dd>{value(column, row)}</dd></div>)}</dl></details>}
  </li>)}</ul>;
}
