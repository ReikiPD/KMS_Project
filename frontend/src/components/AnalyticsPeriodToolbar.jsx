import { useEffect, useState } from "react";
import { Alert, Button, CardPlain, TextField, SelectDropdown } from "@idds/react";
import { CalendarDays } from "lucide-react";
import { ANALYTICS_PERIOD_OPTIONS } from "../lib/analyticsPeriods";

export default function AnalyticsPeriodToolbar({ period, customDates, onPeriodChange, onDatesChange, onApply, error, description = "Berlaku pada seluruh angka, grafik, dan peringkat di halaman ini." }) {
  const [draftPeriod, setDraftPeriod] = useState(period);
  const [rangeError, setRangeError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => setDraftPeriod(period), [period]);

  const selectPeriod = value => {
    setDraftPeriod(value);
    setRangeError("");
    // Opening the date picker must not fetch results with an unapplied range.
    if (value !== "custom") onPeriodChange(value);
  };

  const applyRange = () => {
    const [start, end] = customDates;
    const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!validDay(start) || !validDay(end) || start > end || end > today) { setRangeError("Isi tanggal mulai dan akhir yang valid, berurutan, dan tidak melewati hari ini."); return; }
    if ((Date.parse(end) - Date.parse(start)) / 86400000 > 365) { setRangeError("Rentang tanggal maksimal satu tahun."); return; }
    setRangeError(""); onApply();
  };

  return <CardPlain className="kms-admin-surface kms-admin-period-toolbar mb-5">
    <div className="kms-analytics-period-row">
      <div className="kms-analytics-period-heading">
        <span className="kms-admin-metric-icon" aria-hidden="true"><CalendarDays size={21} /></span>
        <div><h2>Periode analitik</h2><p>{description}</p></div>
      </div>
      <SelectDropdown className="kms-analytics-period-select" label="Tampilkan data untuk" options={ANALYTICS_PERIOD_OPTIONS} selected={draftPeriod} onSelect={selectPeriod} searchable={false} showPreviewValue={false} mandatorySelected indicator="check" />
    </div>
    {draftPeriod === "custom" && <div className="kms-analytics-custom-range">
      <div><div className="kms-analytics-date-fields">
        <TextField type="date" label="Dari tanggal" value={customDates[0] || ""} max={customDates[1] || today} onChange={value => { setRangeError(""); onDatesChange([typeof value === "string" ? value : value.target.value, customDates[1]]); }} showClearButton={false} />
        <TextField type="date" label="Sampai tanggal" value={customDates[1] || ""} min={customDates[0] || undefined} max={today} onChange={value => { setRangeError(""); onDatesChange([customDates[0], typeof value === "string" ? value : value.target.value]); }} showClearButton={false} />
      </div><p className="mt-2 text-xs text-content-secondary">Rentang maksimal satu tahun hingga hari ini. Pilih Terapkan untuk memperbarui data.</p></div>
      <Button hierarchy="primary" onClick={applyRange}>Terapkan</Button>
    </div>}
    {(rangeError || error) && <Alert className="mt-4" variant="critical" title="Periode belum diterapkan" message={rangeError || error} />}
  </CardPlain>;
}
