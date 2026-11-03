import { execSync } from "node:child_process";

import { MINILEND_DIR } from "../../playwright.config";

/** Starts every run from the original demo data (the app's own `npm run reset`). */
export default function globalSetup(): void {
  execSync("npm run reset", { cwd: MINILEND_DIR, stdio: "ignore" });
}
