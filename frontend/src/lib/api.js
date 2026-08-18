export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

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

export const authHeaders = () => {
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
