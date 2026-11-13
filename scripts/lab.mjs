import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(new URL("../node_modules/vite/package.json", import.meta.url))) {
  const install = spawn("npm", ["install"], { stdio: "inherit", shell: false });
  const code = await new Promise((resolve) => install.on("exit", resolve));
  if (code !== 0) process.exit(code ?? 1);
}

const dev = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "44731", "--strictPort"], {
  stdio: "inherit",
  shell: false,
});
dev.on("exit", (code) => process.exit(code ?? 0));
