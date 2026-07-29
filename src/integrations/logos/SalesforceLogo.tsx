/** Marque Salesforce (nuage) — usage UI connecteur. */
export default function SalesforceLogo({
  size = 28,
  title = "Salesforce",
}: {
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="64" height="64" rx="14" fill="#00A1E0" />
      <path
        fill="#fff"
        d="M26.2 24.8c1.3-2.4 3.8-4 6.7-4 2.2 0 4.2.9 5.6 2.4 1.4-1 3.1-1.6 5-1.6 4.4 0 8 3.4 8.2 7.7v.3c2.3.7 4 2.8 4 5.3 0 3.1-2.5 5.6-5.6 5.6H22.8c-3.8 0-6.9-3-6.9-6.8 0-3.2 2.2-5.9 5.2-6.6.3-2.6 1.8-4.8 4.1-6.1.3-.2.6-.2.9-.2.1 0 .1 0 0 0z"
      />
    </svg>
  );
}
