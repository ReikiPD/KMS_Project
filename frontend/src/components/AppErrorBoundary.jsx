import { Component } from "react";
import { AlertTriangle, Copy, Home, RefreshCw } from "lucide-react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorCode: "" };
  }

  static getDerivedStateFromError() {
    return { hasError: true, errorCode: `KMS-${Date.now().toString(36).toUpperCase()}` };
  }

  componentDidCatch(error, info) {
    console.error("KMS UI error:", error, info);
  }

  copyErrorCode = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(this.state.errorCode).catch(() => undefined);
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="kms-error-boundary" role="alert">
        <section className="kms-error-boundary-card">
          <span className="kms-error-boundary-icon" aria-hidden="true"><AlertTriangle size={30} /></span>
          <p className="kms-admin-section-eyebrow">Pemulihan aplikasi</p>
          <h1>Tampilan belum dapat dimuat</h1>
          <p>Aplikasi mengalami kendala pada bagian ini. Data yang telah tersimpan tetap aman.</p>
          <div className="kms-error-reference">
            <span>Kode referensi</span>
            <strong>{this.state.errorCode}</strong>
            <button type="button" onClick={this.copyErrorCode} aria-label="Salin kode error"><Copy size={16} /></button>
          </div>
          <div className="kms-error-actions">
            <button type="button" className="kms-error-button kms-error-button--secondary" onClick={() => window.location.assign("/")}><Home size={17} /> Kembali ke beranda</button>
            <button type="button" className="kms-error-button" onClick={() => window.location.reload()}><RefreshCw size={17} /> Coba lagi</button>
          </div>
        </section>
      </main>
    );
  }
}
