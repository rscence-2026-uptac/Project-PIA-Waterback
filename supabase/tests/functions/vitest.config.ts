import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Edge Functions import zod as the Deno specifier "npm:zod@4.6.5"; point it at the repo's zod 4 (shared-types' copy).
const zod4 = fileURLToPath(new URL("../../../packages/shared-types/node_modules/zod", import.meta.url));
export default defineConfig({
  resolve: { alias: [{ find: /^npm:zod@.*$/, replacement: zod4 }] },
  test: { include: ["*.test.ts"], testTimeout: 20000 },
});
