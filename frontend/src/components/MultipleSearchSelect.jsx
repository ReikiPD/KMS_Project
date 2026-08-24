import { useState } from "react";
import { SelectDropdown } from "@idds/react";
import { Search } from "lucide-react";
import { normalizeSearchOption, normalizeSearchSelections } from "../lib/search";

const noRemoteSearch = () => undefined;

export default function MultipleSearchSelect({
  label,
  selected = [],
  onSelect,
  options = [],
  placeholder = "Ketik lalu pilih kata kunci",
  helperText = "Pilih beberapa kata kunci untuk mempersempit hasil pencarian.",
  onSearch,
  loading = false,
  disabled = false,
  maxItems = 8,
  className = "",
  containerRef,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSelected = normalizeSearchSelections(selected, maxItems);
  const selectedKeys = new Set(normalizedSelected.map((value) => value.toLocaleLowerCase("id-ID")));
  const normalizedOptions = [];
  const optionKeys = new Set();

  options.forEach((option) => {
    const normalizedOption = normalizeSearchOption(option);
    if (!normalizedOption) return;
    const key = normalizedOption.value.toLocaleLowerCase("id-ID");
    if (optionKeys.has(key)) return;
    optionKeys.add(key);
    normalizedOptions.push(normalizedOption);
  });

  normalizedSelected.forEach((value) => {
    const key = value.toLocaleLowerCase("id-ID");
    if (!optionKeys.has(key)) normalizedOptions.unshift({ label: value, value });
  });

  const normalizedTerm = searchTerm.trim().toLocaleLowerCase("id-ID");
  const visibleOptions = normalizedOptions.filter((option) => {
    if (!normalizedTerm) return true;
    return [option.label, option.value, option.group, option.description]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("id-ID").includes(normalizedTerm));
  });
  const optionsWithGroups = visibleOptions.map((option, index) => ({
    ...option,
    isGroupStart: Boolean(option.group) && option.group !== visibleOptions[index - 1]?.group,
  }));

  const handleSelect = (values) => {
    const nextValues = normalizeSearchSelections(values, maxItems);
    onSelect?.(nextValues);
  };

  return (
    <div ref={containerRef} className={`kms-multiple-search ${className}`.trim()}>
      <SelectDropdown
        label={label}
        options={optionsWithGroups}
        selected={normalizedSelected}
        onSelect={handleSelect}
        onSearch={onSearch || noRemoteSearch}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder={placeholder}
        prefixNode={<Search size={17} />}
        multiple
        searchable
        canCustomValue
        indicator="check"
        loading={loading}
        width="100%"
        panelHeight={320}
        selectionTitle="Kriteria pencarian"
        panelClassName="kms-multiple-search-panel"
        renderOptionLabel={(option) => (
          <span className="kms-multiple-search-option">
            {option.isGroupStart && <span className="kms-multiple-search-group">{option.group}</span>}
            <span className="kms-multiple-search-option-main">
              {option.icon && <span className="kms-multiple-search-option-icon" aria-hidden="true">{option.icon}</span>}
              <span className="min-w-0">
                <strong className="kms-multiple-search-option-label">{option.label}</strong>
                {option.description && <small className="kms-multiple-search-option-description">{option.description}</small>}
              </span>
            </span>
          </span>
        )}
        disabled={disabled}
        emptyState="Ketik kata kunci baru untuk menambahkannya"
      />
      {helperText && (
        <p className="mt-1.5 text-xs leading-5 text-content-secondary">
          {normalizedSelected.length
            ? `${normalizedSelected.length} kriteria dipilih. ${helperText}`
            : helperText}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {selectedKeys.size} kriteria pencarian dipilih
      </span>
    </div>
  );
}
