import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function resolveDevProxyTarget(): string {
  const configuredHost = process.env.HOST?.trim();
  const port = Number(process.env.PORT ?? 3000);
  const targetHost =
    configuredHost && !["0.0.0.0", "::"].includes(configuredHost) ? configuredHost : "127.0.0.1";
  return `http://${targetHost}:${port}`;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      "/api": {
        target: resolveDevProxyTarget(),
        changeOrigin: true,
      },
    },
  },
});
