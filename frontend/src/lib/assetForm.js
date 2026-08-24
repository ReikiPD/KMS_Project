export const ASSET_FORM_STEPS = [
  { label: "Informasi" },
  { label: "Konten" },
  { label: "Media" },
  { label: "Tinjau & simpan" },
];

export const ASSET_TYPE_OPTIONS = [
  { label: "Dokumen / Pedoman (PDF)", value: "document" },
  { label: "Video / Media", value: "video" },
];

export const ASSET_STATUS_OPTIONS = [
  { label: "Simpan sebagai Draf", value: "false" },
  { label: "Publikasikan Langsung", value: "true" },
];

export const createAssetFormData = (authorId = "") => ({
  title: "",
  asset_type: "document",
  content: "",
  category_id: null,
  work_unit_id: null,
  is_published: "false",
  video_duration_seconds: "",
  video_chapters: [],
  authorId,
});

export const assetToFormData = (asset) => ({
  title: asset.title || "",
  asset_type: asset.asset_type || "document",
  content: asset.content || "",
  category_id: asset.category_id ? String(asset.category_id) : null,
  work_unit_id: asset.work_unit_id ? String(asset.work_unit_id) : null,
  is_published: asset.is_published ? "true" : "false",
  video_duration_seconds: asset.video_duration_seconds ?? "",
  video_chapters: Array.isArray(asset.video_chapters) ? asset.video_chapters : [],
  authorId: asset.author_id ? String(asset.author_id) : "",
});

export const toSelectOptions = (items) => items.map((item) => ({
  label: item.name,
  value: String(item.id),
}));

export const staffToSelectOptions = (staff) => staff
  .filter((member) => member.role === "pegawai")
  .map((member) => ({
    label: `${member.full_name}${member.department ? ` — ${member.department}` : ""}`,
    value: String(member.id),
  }));

export const buildAssetFormPayload = (formData, thumbnailFile, mainFile) => {
  const payload = new FormData();
  const slug = formData.title
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  payload.append("title", formData.title);
  payload.append("slug", slug);
  payload.append("asset_type", formData.asset_type);
  payload.append("content", formData.content);
  payload.append("video_chapters", JSON.stringify(formData.video_chapters || []));
  payload.append("is_published", formData.is_published);

  if (formData.authorId) payload.append("authorId", formData.authorId);
  if (formData.video_duration_seconds !== "") payload.append("video_duration_seconds", formData.video_duration_seconds);
  if (formData.category_id) payload.append("category_id", formData.category_id);
  if (formData.work_unit_id) payload.append("work_unit_id", formData.work_unit_id);
  if (thumbnailFile) payload.append("thumbnail", thumbnailFile);
  if (mainFile) payload.append("file", mainFile);

  return payload;
};
