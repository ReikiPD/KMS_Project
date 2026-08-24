const cleanSelection = (value) => String(value || "").trim().replace(/\s+/g, " ");

export const normalizeSearchSelections = (values, maxItems = 8) => {
  const source = Array.isArray(values) ? values : values ? [values] : [];
  const unique = new Map();

  source.forEach((value) => {
    const cleaned = cleanSelection(value);
    if (!cleaned) return;
    const key = cleaned.toLocaleLowerCase("id-ID");
    if (!unique.has(key)) unique.set(key, cleaned);
  });

  return [...unique.values()].slice(0, maxItems);
};

export const searchSelectionsToQuery = (values) =>
  normalizeSearchSelections(values).join(" ").trim();

export const queryToSearchSelections = (query) => {
  const cleaned = cleanSelection(query);
  return cleaned ? [cleaned] : [];
};

export const normalizeSearchOption = (option) => {
  const value = cleanSelection(option?.value ?? option?.label ?? option);
  const label = cleanSelection(option?.label ?? option?.value ?? option);
  return value && label ? { ...((typeof option === "object" && option) || {}), label, value } : null;
};
