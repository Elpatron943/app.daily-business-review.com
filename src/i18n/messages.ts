import type { Locale } from "./types";

/** Clés de traduction de la coque UI (étendre au fil des écrans). */
export type MessageKey =
  | "nav.group.view"
  | "nav.group.data"
  | "nav.dashboard"
  | "nav.map"
  | "nav.entreprises"
  | "nav.contacts"
  | "nav.opportunites"
  | "nav.accountPlans"
  | "nav.group.modules"
  | "nav.ai_phone_script"
  | "nav.ai_email_script"
  | "nav.aria"
  | "sidebar.signOut"
  | "sidebar.team"
  | "sidebar.settings"
  | "role.admin"
  | "role.user"
  | "auth.loginTitle"
  | "auth.email"
  | "auth.password"
  | "auth.signIn"
  | "auth.forgot"
  | "auth.forgotNeedEmail"
  | "auth.forgotSent"
  | "auth.configHint"
  | "auth.loading"
  | "auth.profileRequired"
  | "auth.profileHint"
  | "reset.title"
  | "reset.newPassword"
  | "reset.confirm"
  | "reset.save"
  | "reset.cancel"
  | "reset.done"
  | "reset.openApp"
  | "reset.minLength"
  | "reset.mismatch"
  | "lang.fr"
  | "lang.en"
  | "lang.switch"
  | "map.pickAccount"
  | "billing.readonly";

const fr: Record<MessageKey, string> = {
  "nav.group.view": "Vue",
  "nav.group.data": "Données en entrée",
  "nav.dashboard": "Dashboard",
  "nav.map": "Cartographie",
  "nav.entreprises": "Entreprises",
  "nav.contacts": "Contacts",
  "nav.opportunites": "Opportunités",
  "nav.accountPlans": "Account plans",
  "nav.group.modules": "Modules optionnels",
  "nav.ai_phone_script": "Script téléphonique IA",
  "nav.ai_email_script": "Script E-mailing IA",
  "nav.aria": "Navigation principale",
  "sidebar.signOut": "Déconnexion",
  "sidebar.team": "Équipe",
  "sidebar.settings": "Settings",
  "role.admin": "Admin",
  "role.user": "Commercial",
  "auth.loginTitle": "Connexion",
  "auth.email": "E-mail",
  "auth.password": "Mot de passe",
  "auth.signIn": "Se connecter",
  "auth.forgot": "Mot de passe oublié ?",
  "auth.forgotNeedEmail":
    "Indique ton e-mail pour réinitialiser le mot de passe.",
  "auth.forgotSent":
    "Si un compte existe pour cet e-mail, un lien de réinitialisation vient d’être envoyé.",
  "auth.configHint":
    "La connexion n’est pas disponible pour le moment. Réessaie plus tard ou contacte ton administrateur.",
  "auth.loading": "Chargement de la session…",
  "auth.profileRequired": "Profil requis",
  "auth.profileHint":
    "Ton profil n’est pas encore prêt. Déconnecte-toi puis reconnecte-toi, ou contacte ton administrateur.",
  "reset.title": "Nouveau mot de passe",
  "reset.newPassword": "Nouveau mot de passe",
  "reset.confirm": "Confirmer",
  "reset.save": "Enregistrer",
  "reset.cancel": "Annuler",
  "reset.done": "Mot de passe mis à jour. Tu peux continuer dans l’application.",
  "reset.openApp": "Ouvrir DBR",
  "reset.minLength": "Le mot de passe doit contenir au moins 6 caractères.",
  "reset.mismatch": "Les mots de passe ne correspondent pas.",
  "lang.fr": "Français",
  "lang.en": "English",
  "lang.switch": "Langue",
  "map.pickAccount": "Choisir le compte à cartographier",
  "billing.readonly": "Abonnement en lecture seule",
};

const en: Record<MessageKey, string> = {
  "nav.group.view": "View",
  "nav.group.data": "Input data",
  "nav.dashboard": "Dashboard",
  "nav.map": "Map",
  "nav.entreprises": "Companies",
  "nav.contacts": "Contacts",
  "nav.opportunites": "Opportunities",
  "nav.accountPlans": "Account plans",
  "nav.group.modules": "Optional modules",
  "nav.ai_phone_script": "AI phone script",
  "nav.ai_email_script": "AI email script",
  "nav.aria": "Main navigation",
  "sidebar.signOut": "Sign out",
  "sidebar.team": "Team",
  "sidebar.settings": "Settings",
  "role.admin": "Admin",
  "role.user": "Sales",
  "auth.loginTitle": "Sign in",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.forgot": "Forgot password?",
  "auth.forgotNeedEmail": "Enter your email to reset your password.",
  "auth.forgotSent":
    "If an account exists for this email, a reset link has been sent.",
  "auth.configHint":
    "Sign-in is unavailable right now. Try again later or contact your administrator.",
  "auth.loading": "Loading session…",
  "auth.profileRequired": "Profile required",
  "auth.profileHint":
    "Your profile isn’t ready yet. Sign out and back in, or contact your administrator.",
  "reset.title": "New password",
  "reset.newPassword": "New password",
  "reset.confirm": "Confirm",
  "reset.save": "Save",
  "reset.cancel": "Cancel",
  "reset.done": "Password updated. You can continue in the app.",
  "reset.openApp": "Open DBR",
  "reset.minLength": "Password must be at least 6 characters.",
  "reset.mismatch": "Passwords do not match.",
  "lang.fr": "French",
  "lang.en": "English",
  "lang.switch": "Language",
  "map.pickAccount": "Choose the account to map",
  "billing.readonly": "Subscription is read-only",
};

export const messages: Record<Locale, Record<MessageKey, string>> = {
  fr,
  en,
};
