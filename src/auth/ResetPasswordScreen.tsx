import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import LanguageSwitcher from "../i18n/LanguageSwitcher";
import { useT } from "../i18n/LocaleContext";

/** Formulaire après clic sur le lien e-mail de réinitialisation. */
export default function ResetPasswordScreen() {
  const { updatePassword, signOut, user } = useAuth();
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("reset.minLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const err = await updatePassword(password);
      if (err) setError(err);
      else setDone(true);
    } finally {
      setBusy(false);
    }
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

        <h2 className="auth-title">{t("reset.title")}</h2>
        {user?.email ? (
          <p className="muted auth-hint" style={{ textAlign: "center" }}>
            {user.email}
          </p>
        ) : null}

        {done ? (
          <>
            <p className="auth-info">{t("reset.done")}</p>
            <button
              type="button"
              className="primary-cta"
              onClick={() => window.location.assign("/")}
            >
              {t("reset.openApp")}
            </button>
          </>
        ) : (
          <>
            <label>
              {t("reset.newPassword")}
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              {t("reset.confirm")}
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>

            {error ? <p className="auth-error">{error}</p> : null}

            <button type="submit" className="primary-cta" disabled={busy}>
              {busy ? "…" : t("reset.save")}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void signOut()}
            >
              {t("reset.cancel")}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
