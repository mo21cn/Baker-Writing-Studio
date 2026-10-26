import { useEffect, useState } from "react";

export const BRAND_LOGO_STORAGE_KEY = "r2md-brand-logo";
const BRAND_LOGO_EVENT = "baker:brand-logo-changed";
const DEFAULT_LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

function readStoredLogo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(BRAND_LOGO_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function hasCustomBrandLogo(): boolean {
  return readStoredLogo() !== null;
}

/**
 * Persist a user-supplied logo (data URL) or clear it. The store is
 * localStorage because a Tauri rebuild should not be needed to change a
 * brand mark; the bundle ships a default at `public/brand/logo.png`.
 */
export function writeBrandLogo(dataUrl: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (dataUrl) window.localStorage.setItem(BRAND_LOGO_STORAGE_KEY, dataUrl);
    else window.localStorage.removeItem(BRAND_LOGO_STORAGE_KEY);
  } catch {
    // Quota exceeded: keep the default rather than break the shell.
    return;
  }
  window.dispatchEvent(new Event(BRAND_LOGO_EVENT));
}

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "brand-logo-image" }: BrandLogoProps) {
  const [src, setSrc] = useState<string>(() => readStoredLogo() ?? DEFAULT_LOGO);

  useEffect(() => {
    const sync = () => setSrc(readStoredLogo() ?? DEFAULT_LOGO);
    window.addEventListener(BRAND_LOGO_EVENT, sync);
    return () => window.removeEventListener(BRAND_LOGO_EVENT, sync);
  }, []);

  return <img className={className} src={src} alt="Baker Writing Studio" draggable={false} />;
}
