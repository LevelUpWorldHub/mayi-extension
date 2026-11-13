import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function sampleHeaders(): Plugin {
  return {
    name: "mayi-sample-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (url.includes("/samples/lumen/")) {
          res.setHeader("tdm-reservation", "1");
          res.setHeader("tdm-policy", "https://lumen.example/privacy");
        } else if (url.includes("/samples/northwind/")) {
          res.setHeader("tdm-reservation", "0");
        } else if (url.includes("/samples/pinnacle/")) {
          res.setHeader("x-robots-tag", "noai, noimageai");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sampleHeaders()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 44731,
    strictPort: true,
  },
});
