import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { perplexityResearchProxy } from "./scripts/perplexityProxy";
import { openaiRecommendProxy } from "./scripts/openaiProxy";

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

  return {
    plugins: [react(), perplexityResearchProxy(), openaiRecommendProxy()],
    server: {
      port: 5173,
      open: true,
    },
  };
});
