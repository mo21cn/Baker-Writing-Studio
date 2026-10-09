type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "brand-logo-mark" }: BrandLogoProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="currentColor" />
      <g fill="#ffffff">
        <ellipse cx="22" cy="24" rx="9" ry="9" />
        <ellipse cx="42" cy="24" rx="9" ry="9" />
        <ellipse cx="32" cy="20" rx="11" ry="11" />
        <rect x="20" y="29" width="24" height="5" rx="1" />
        <rect x="17" y="34" width="30" height="9" rx="2" />
      </g>
      <path
        d="M26 50 q3 4 6 0 q3 4 6 0"
        stroke="#ffffff"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandWordmark() {
  return (
    <span className="brand-wordmark">
      <span className="brand-wordmark-strong">Baker</span>
      {' '}
      <span className="brand-wordmark-light">Writing Studio</span>
    </span>
  );
}