import { isModuleEnabled, type OptionalModuleId } from "./billing/optionalModules";
import { useAuth } from "./auth/AuthContext";

const MODULE_COPY: Record<
  OptionalModuleId,
  { title: string; body: string }
> = {
  ai_phone_script: {
    title: "Script téléphonique IA",
    body: "Module active. Ouvre une opportunite -> onglet « Scripts IA » pour generer un script d'appel (donnees du deal retirables + contexte libre).",
  },
  ai_email_script: {
    title: "Script E-mailing IA",
    body: "Module active. Ouvre une opportunite -> onglet « Scripts IA » pour generer une sequence d'e-mails (donnees du deal retirables + contexte libre).",
  },
};

export default function OptionalModulePage({
  moduleId,
}: {
  moduleId: OptionalModuleId;
}) {
  const { organization } = useAuth();
  const enabled = isModuleEnabled(organization?.optional_modules, moduleId);
  const copy = MODULE_COPY[moduleId];

  if (!enabled) {
    return (
      <div className="panel">
        <h1>{copy.title}</h1>
        <p className="muted">
          Module non activé pour ce compte. Contactez votre administrateur
          plateforme.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>{copy.title}</h1>
      <p className="muted">{copy.body}</p>
    </div>
  );
}
