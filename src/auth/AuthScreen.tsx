import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import LanguageSwitcher from "../i18n/LanguageSwitcher";
import { useT } from "../i18n/LocaleContext";

export default function AuthScreen() {
  const { configured, signIn, resetPassword } = useAuth();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const err = await signIn(email, password);
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t("auth.forgotNeedEmail"));
      return;
    }
    setBusy(true);
    try {
      const err = await resetPassword(email);
      if (err) setError(err);
      else setInfo(t("auth.forgotSent"));
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <img
              src="/logos/logo.png"
              alt="DBR — Daily Business Review"
              className="auth-logo"
            />
          </div>
          <LanguageSwitcher className="auth-lang" />
          <p className="muted">{t("auth.configHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <img
            src="/logos/logo.png"
            alt="DBR — Daily Business Review"
            className="auth-logo"
          />
        </div>

        <LanguageSwitcher className="auth-lang" />

        <h2 className="auth-title">{t("auth.loginTitle")}</h2>

        <label>
          {t("auth.email")}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {t("auth.password")}
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <div className="auth-forgot-row">
          <button
            type="button"
            className="linkish auth-forgot"
            disabled={busy}
            onClick={() => void handleForgotPassword()}
          >
            {t("auth.forgot")}
          </button>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
        {info ? <p className="auth-info">{info}</p> : null}

        <button type="submit" className="primary-cta" disabled={busy}>
          {busy ? "…" : t("auth.signIn")}
        </button>
      </form>
    </div>
  );
}
