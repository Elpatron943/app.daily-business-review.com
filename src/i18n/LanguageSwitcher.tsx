import { FlagIcon } from "./FlagIcon";
import { useLocale } from "./LocaleContext";
import type { Locale } from "./types";

const OPTIONS: Locale[] = ["fr", "en"];

export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className={`lang-switcher ${className}`.trim()}
      role="group"
      aria-label={t("lang.switch")}
    >
      {OPTIONS.map((code) => {
        const active = locale === code;
        const label = t(code === "fr" ? "lang.fr" : "lang.en");
        return (
          <button
            key={code}
            type="button"
            className={`lang-switcher-btn${active ? " active" : ""}`}
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => setLocale(code)}
          >
            <FlagIcon locale={code} title={label} />
            <span className="lang-switcher-code">{code.toUpperCase()}</span>
          </button>
        );
      })}
    </div>
  );
}
