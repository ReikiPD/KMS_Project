const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const uploadUrl = (fileName) =>
  fileName ? `${API_BASE_URL}/uploads/${encodeURIComponent(fileName)}` : null;

export const avatarUrl = (value) => {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : uploadUrl(value);
};

export const inputValue = (value) =>
  typeof value === "string" ? value : value?.target?.value || "";

export const currentUser = () => {
  try {
    return JSON.parse(window.localStorage.getItem("kms_user") || "null");
  } catch {
    return null;
  }
};

const authHeaders = () => {
  const token = window.localStorage.getItem("kms_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const apiFetch = (path, { auth = false, headers, ...options } = {}) =>
  fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(auth ? authHeaders() : {}),
      ...headers,
    },
  });

export const apiUpload = (path, { method = "POST", auth = false, headers = {}, body, signal, onProgress } = {}) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open(method, apiUrl(path));
  Object.entries({ ...(auth ? authHeaders() : {}), ...headers }).forEach(([key, value]) => request.setRequestHeader(key, value));
  request.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100), event);
  });
  request.addEventListener("load", () => {
    let data = {};
    try { data = JSON.parse(request.responseText || "{}"); } catch { data = { error: request.responseText }; }
    resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, data: data || {} });
  });
  request.addEventListener("error", () => reject(new Error("Koneksi ke server terputus saat mengunggah file")));
  request.addEventListener("abort", () => reject(new DOMException("Unggahan dibatalkan", "AbortError")));
  if (signal) {
    if (signal.aborted) request.abort();
    else signal.addEventListener("abort", () => request.abort(), { once: true });
  }
  request.send(body);
});
