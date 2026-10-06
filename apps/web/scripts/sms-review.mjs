// Writes sms-review.csv for the Filipino/Waray native-speaker check.
// Run from apps/web:  node scripts/sms-review.mjs
import { createServer } from "vite";
import { writeFileSync } from "node:fs";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { smsReviewCsv, checkSmsTemplates } = await server.ssrLoadModule("/src/copy/sms.ts");
writeFileSync("sms-review.csv", smsReviewCsv());
const bad = checkSmsTemplates().filter((c) => !c.fits || !c.gsm7);
console.log(`sms-review.csv written. ${bad.length} template(s) over 160 chars or outside GSM-7.`);
if (bad.length) console.table(bad);
await server.close();