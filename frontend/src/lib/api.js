const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const API_BASE_URL = configuredBaseUrl.replace(/\/$/, "");

const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const uploadUrl = (fileName) =>
  fileName ? `${API_BASE_URL}/api/assets/media/${encodeURIComponent(fileName)}` : null;

export const downloadUrl = (fileName) => {
  const mediaUrl = uploadUrl(fileName);
  return mediaUrl ? `${mediaUrl}?download=1` : null;
};

export const avatarUrl = (value) => {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : uploadUrl(value);
};

export const inputValue = (value) =>
  typeof value === "string" ? value : value?.target?.value || "";

const readCookie = (name) => document.cookie
  .split(";")
  .map((part) => part.trim())
  .find((part) => part.startsWith(`${name}=`))
  ?.slice(name.length + 1);

const csrfToken = () => decodeURIComponent(readCookie("__Host-kms_csrf") || readCookie("kms_csrf") || "");
const isUnsafeMethod = (method) => !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
const CONTEXT_STORAGE_KEY = "kms.admin-view-context";

export const accessContextOwnerKey = (user) => {
  if (user?.id) return `user:${user.id}`;
  if (user?.environmentAdmin && user?.email) return `environment:${String(user.email).toLowerCase()}`;
  return "";
};

export const clearAccessContext = () => {
  window.sessionStorage.removeItem(CONTEXT_STORAGE_KEY);
};

export const synchronizeAccessContextOwner = (user) => {
  try {
    const context = JSON.parse(window.sessionStorage.getItem(CONTEXT_STORAGE_KEY) || "null");
    if (!context) return;
    const ownerKey = accessContextOwnerKey(user);
    if (!ownerKey || context.ownerKey !== ownerKey) clearAccessContext();
  } catch {
    clearAccessContext();
  }
};

const securityHeaders = (method) => {
  const token = isUnsafeMethod(method) ? csrfToken() : "";
  return token ? { "X-CSRF-Token": token } : {};
};

const contextHeaders = (enabled = true) => {
  if (!enabled) return {};
  try {
    const context = JSON.parse(window.sessionStorage.getItem(CONTEXT_STORAGE_KEY) || "null");
    if (!context?.publicId || !context?.mode) return {};
    const headers = {
      "X-KMS-Context-User": context.publicId,
      "X-KMS-Context-Mode": context.mode,
    };
    if (context.supervisorPublicId) headers["X-KMS-Context-Supervisor"] = context.supervisorPublicId;
    return headers;
  } catch {
    return {};
  }
};

export const apiFetch = (path, { auth: _auth = false, context = true, headers, ...options } = {}) =>
  fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    headers: {
      ...securityHeaders(options.method),
      ...contextHeaders(context),
      ...headers,
    },
  }).then((response) => {
    if (response.status === 401 && path !== "/api/users/session") {
      window.dispatchEvent(new Event("kms-session-expired"));
    }
    return response;
  });

export const apiUpload = (path, { method = "POST", auth: _auth = false, context = true, headers = {}, body, signal, onProgress } = {}) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open(method, apiUrl(path));
  request.withCredentials = true;
  Object.entries({ ...securityHeaders(method), ...contextHeaders(context), ...headers }).forEach(([key, value]) => request.setRequestHeader(key, value));
  request.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100), event);
  });
  request.addEventListener("load", () => {
    let data = {};
    try { data = JSON.parse(request.responseText || "{}"); } catch { data = { error: request.responseText }; }
    if (request.status === 401) window.dispatchEvent(new Event("kms-session-expired"));
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
