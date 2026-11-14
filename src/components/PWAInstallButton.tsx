import { useEffect, useState } from "react";
import { Check, Download, ExternalLink, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface PWAInstallButtonProps {
  variant?: "primary" | "subtle";
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildDesktopLauncherHtml(appUrl: string): string {
  const safeHref = escapeHtmlAttr(appUrl);
  const safeJsonUrl = JSON.stringify(appUrl);

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0;url=${safeHref}" />
  <title>Asaw AI</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23090B10'/%3E%3Cpath d='M32 12L50 50H41.5L37.8 41.5H26.2L22.5 50H14L32 12ZM32 23.5L28.5 34H35.5L32 23.5Z' fill='%2300A2FF'/%3E%3C/svg%3E" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #090B10; color: #F8FAFC; padding: 24px; }
    .card { width: 100%; max-width: 400px; background: #11151E; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 24px; text-align: center; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 13px; color: #94A3B8; line-height: 1.5; margin-bottom: 18px; }
    a { display: inline-block; width: 100%; background: #00A2FF; color: #06101B; text-decoration: none; font-weight: 700; font-size: 14px; padding: 11px 16px; border-radius: 10px; }
    a:hover { background: #33B5FF; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Asaw AI</h1>
    <p>Membuka Asaw AI — Asisten Layar &amp; Auto-Coach Game...</p>
    <a href="${safeHref}">Buka Asaw AI Sekarang</a>
  </div>
  <script>
    window.location.replace(${safeJsonUrl});
  </script>
</body>
</html>`;
}

export function PWAInstallButton({
  variant = "subtle",
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } =
    usePWAInstall();
  const [downloadedNotice, setDownloadedNotice] = useState(false);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 7000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  if (isInstalled) {
    return null;
  }

  const currentUrl =
    typeof window !== "undefined" ? window.location.href : "/";
  const appLaunchUrl =
    typeof window !== "undefined" ? `${window.location.origin}/` : "/";

  const triggerDirectDownload = () => {
    const html = buildDesktopLauncherHtml(appLaunchUrl);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Asaw-AI.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);

    setDownloadedNotice(true);
    setShowToast(true);
    window.setTimeout(() => setDownloadedNotice(false), 3000);
  };

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    triggerDirectDownload();
  };

  const buttonClass =
    variant === "primary"
      ? "inline-flex items-center gap-2 rounded-lg bg-[#00A2FF] px-4 py-2 text-xs font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] whitespace-nowrap shrink-0"
      : "inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0";

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClass}>
        {downloadedNotice ? (
          <>
            <Check className="h-3.5 w-3.5" />
            <span>Terunduh!</span>
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            <span>Download Aplikasi</span>
          </>
        )}
      </button>

      {showToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-[#00A2FF]/40 bg-[#11151E] px-3.5 py-2.5 text-xs text-slate-200 shadow-2xl"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold text-white">Asaw-AI.html terunduh</p>
            <p className="text-[11px] leading-relaxed text-slate-300">
              {isIOS
                ? "Buka file hasil unduhan, atau di Safari tekan Bagikan → Tambahkan ke Layar Utama."
                : "Klik 2x file Asaw-AI.html untuk langsung membuka aplikasi di komputer."}
            </p>
            {isInIframe && (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00A2FF] hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Atau pasang via Tab Penuh</span>
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowToast(false)}
            aria-label="Tutup notifikasi unduhan"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
