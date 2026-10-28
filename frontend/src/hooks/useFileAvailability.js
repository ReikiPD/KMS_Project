import { useEffect, useState } from "react";

const initialState = { status: "idle", message: "" };

export default function useFileAvailability(fileUrl) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!fileUrl) {
      setState(initialState);
      return undefined;
    }

    const controller = new AbortController();
    setState({ status: "checking", message: "" });

    fetch(fileUrl, {
      method: "HEAD",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok) {
          // Content-Length of the same HEAD request; absent for chunked responses.
          const size = Number(response.headers.get("content-length"));
          setState({ status: "available", message: "", size: Number.isFinite(size) && size > 0 ? size : null });
          return;
        }

        setState({
          status: response.status === 404 ? "missing" : "error",
          message: response.status === 404
            ? "File tidak ditemukan pada penyimpanan server. Hubungi pengelola untuk memulihkan file unggahan."
            : `File belum dapat diakses oleh server (HTTP ${response.status}).`,
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", message: "Koneksi ke file gagal. Periksa layanan penyimpanan dan coba kembali." });
        }
      });

    return () => controller.abort();
  }, [fileUrl]);

  return state;
}
