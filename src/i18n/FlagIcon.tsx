import type { Locale } from "./types";

/** Drapeaux SVG (pas d’emoji) — fiables sur Android et Apple. */
export function FlagIcon({
  locale,
  className,
  title,
}: {
  locale: Locale;
  className?: string;
  title?: string;
}) {
  if (locale === "fr") {
    return (
      <svg
        className={className}
        viewBox="0 0 3 2"
        width="22"
        height="15"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : "presentation"}
      >
        {title ? <title>{title}</title> : null}
        <rect width="1" height="2" x="0" fill="#002395" />
        <rect width="1" height="2" x="1" fill="#fff" />
        <rect width="1" height="2" x="2" fill="#ed2939" />
      </svg>
    );
  }

  // English — Union Jack simplifié (SVG, pas emoji)
  return (
    <svg
      className={className}
      viewBox="0 0 60 30"
      width="22"
      height="15"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : "presentation"}
    >
      {title ? <title>{title}</title> : null}
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}
