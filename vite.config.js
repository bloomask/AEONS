import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // relative base so the build works both at a domain root and under
  // a subpath like https://<user>.github.io/AEONS/
  base: "./",
  plugins: [react(), tailwindcss()],
});
