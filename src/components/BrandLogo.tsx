const DEFAULT_LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

interface BrandLogoProps {
  className?: string;
}

/**
 * The product mark is fixed artwork shipped in `public/brand/logo.png`.
 * Replacing it at runtime was removed on purpose: a custom mark made
 * screenshots and support conversations harder to recognise, and the
 * build already carries the one logo the product uses.
 */
export function BrandLogo({ className = "brand-logo-image" }: BrandLogoProps) {
  return <img className={className} src={DEFAULT_LOGO} alt="Baker 写作工作台" draggable={false} />;
}
