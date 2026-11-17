import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Load every variable from .env into process.env so server code can read
// secrets like SUPABASE_SERVICE_ROLE_KEY during local development. Only
// VITE_-prefixed variables are ever bundled into the browser code.
const serverEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
for (const [key, value] of Object.entries(serverEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  server: { port: 8080 },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    // src/server.ts wraps the server so crashes show the branded error page.
    tanstackStart({ server: { entry: "server" } }),
    // Builds for whichever host it runs on (Vercel is detected automatically).
    nitro(),
    viteReact(),
  ],
});
