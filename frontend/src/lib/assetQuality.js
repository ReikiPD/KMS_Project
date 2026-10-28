export const getAssetQuality = ({ formData, hasThumbnail = false, hasFile = false }) => {
  const checks = [
    ["Judul", Boolean(formData.title?.trim())],
    ["Kategori", Boolean(formData.category_id)],
    ["Unit kerja", Boolean(formData.work_unit_id)],
    ["Thumbnail", hasThumbnail],
    ["File utama", hasFile],
  ];
  const completed = checks.filter(([, complete]) => complete).length;
  return { checks, completed, total: checks.length, complete: completed === checks.length };
};
