import { apiFetch } from './api';

// Callers retain their own loading state, abort checks, and URL lifecycle.
export async function fetchProtectedAssetBlob(fileName, signal, errorMessage) {
  const response = await apiFetch(`/api/assets/media/${encodeURIComponent(fileName)}`, {
    auth: true,
    signal,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(errorMessage);
  return response.blob();
}
