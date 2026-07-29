import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { perplexityResearchProxy } from "./scripts/perplexityProxy";
import { openaiRecommendProxy } from "./scripts/openaiProxy";
import { inviteUserProxy } from "./scripts/inviteUserProxy";
import { hubspotProxy } from "./scripts/hubspotProxy";

export default defineConfig(({ mode }) => {
  // Expose API keys to the Vite Node process (proxies only).
  const env = loadEnv(mode, process.cwd(), "");
  if (env.PERPLEXITY_API_KEY) {
    process.env.PERPLEXITY_API_KEY = env.PERPLEXITY_API_KEY;
  }
  if (env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }
  if (env.OPENAI_MODEL) {
    process.env.OPENAI_MODEL = env.OPENAI_MODEL;
  }
  if (env.OPENAI_INSECURE_TLS) {
    process.env.OPENAI_INSECURE_TLS = env.OPENAI_INSECURE_TLS;
  }
  if (env.PERPLEXITY_INSECURE_TLS) {
    process.env.PERPLEXITY_INSECURE_TLS = env.PERPLEXITY_INSECURE_TLS;
  }
  if (env.VITE_SUPABASE_URL) {
    process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
  }
  if (env.VITE_SUPABASE_ANON_KEY) {
    process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
  }
  if (env.SUPABASE_URL) {
    process.env.SUPABASE_URL = env.SUPABASE_URL;
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  }
  // Proxies Vite (HubSpot, invite…) appellent Supabase depuis Node.
  // Antivirus / proxy d’entreprise → UNABLE_TO_VERIFY_LEAF_SIGNATURE / "fetch failed".
  if (
    env.SUPABASE_INSECURE_TLS === "1" ||
    env.SUPABASE_INSECURE_TLS === "true"
  ) {
    process.env.SUPABASE_INSECURE_TLS = env.SUPABASE_INSECURE_TLS;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  if (env.VITE_APP_URL) {
    process.env.VITE_APP_URL = env.VITE_APP_URL;
  }
  if (env.HUBSPOT_CLIENT_ID) {
    process.env.HUBSPOT_CLIENT_ID = env.HUBSPOT_CLIENT_ID;
  }
  if (env.HUBSPOT_CLIENT_SECRET) {
    process.env.HUBSPOT_CLIENT_SECRET = env.HUBSPOT_CLIENT_SECRET;
  }
  if (env.HUBSPOT_TOKEN_SECRET) {
    process.env.HUBSPOT_TOKEN_SECRET = env.HUBSPOT_TOKEN_SECRET;
  }
  if (env.HUBSPOT_REDIRECT_URI) {
    process.env.HUBSPOT_REDIRECT_URI = env.HUBSPOT_REDIRECT_URI;
  }
  if (env.HUBSPOT_WEBHOOK_SKIP_VERIFY) {
    process.env.HUBSPOT_WEBHOOK_SKIP_VERIFY = env.HUBSPOT_WEBHOOK_SKIP_VERIFY;
  }

  return {
    plugins: [
      react(),
      perplexityResearchProxy(),
      openaiRecommendProxy(),
      inviteUserProxy(),
      hubspotProxy(),
    ],
    server: {
      port: 5173,
      open: true,
    },
  };
});
