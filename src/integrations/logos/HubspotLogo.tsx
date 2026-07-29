/** Marque HubSpot (sprocket) — usage UI connecteur. */
export default function HubspotLogo({
  size = 28,
  title = "HubSpot",
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
      <rect width="64" height="64" rx="14" fill="#FF7A59" />
      <g fill="#fff">
        <circle cx="32" cy="18" r="5.5" />
        <circle cx="32" cy="46" r="5.5" />
        <circle cx="18" cy="32" r="5.5" />
        <circle cx="46" cy="32" r="5.5" />
        <circle cx="22" cy="22" r="4" />
        <circle cx="42" cy="22" r="4" />
        <circle cx="22" cy="42" r="4" />
        <circle cx="42" cy="42" r="4" />
        <circle cx="32" cy="32" r="7" />
      </g>
    </svg>
  );
}
