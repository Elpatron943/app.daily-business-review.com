import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

export default function AuthScreen() {
  const { configured, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const err = await signIn(email, password);
      if (err) setError(err);
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
          <p className="muted">
            Ajoute <code>VITE_SUPABASE_URL</code> et{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env.local</code>,
            puis relance <code>npm run dev</code>.
          </p>
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

        <h2 className="auth-title">Connexion</h2>

        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit" className="primary-cta" disabled={busy}>
          {busy ? "…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
