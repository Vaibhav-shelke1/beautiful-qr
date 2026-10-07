import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { QRCode, presetNames } from "../dist/index.js";

const out = join(fileURLToPath(new URL(".", import.meta.url)), "output");
await mkdir(out, { recursive: true });

const link = "https://github.com/beautiful-qr";

console.log("presets");
for (const name of presetNames()) {
  const qr = await QRCode.generate({ data: link, preset: name, size: 420 });
  await qr.save(`${out}/preset-${name}.png`);
  const { cm } = qr.report.estimatedMinPrintSize;
  console.log(`  ${name.padEnd(16)} ${qr.verified ? "verified" : "FAILED  "}  min print ${cm}cm`);
}

console.log("\nrepairing a design that could not scan");
const broken = await QRCode.generate({
  data: "https://example.com/promo",
  dots: { style: "dot", color: "#9CA3AF" },
  background: { color: "#D1D5DB" },
  qr: { errorCorrection: "L" },
  margin: 1,
  size: 480,
});
await broken.save(`${out}/repaired.png`);
console.log(`  verified: ${broken.verified}`);
for (const r of broken.repairs) {
  console.log(`  ${r.field}: ${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}`);
  console.log(`    ${r.why}`);
}

console.log("\ndata helpers");
const wifi = await QRCode.generate({
  data: QRCode.wifi({ ssid: "Cafe Guest", password: "latte;2026", encryption: "WPA" }),
  preset: "modern",
  size: 360,
});
await wifi.save(`${out}/wifi.png`);
console.log(`  wifi payload: ${QRCode.wifi({ ssid: "Cafe Guest", password: "latte;2026" })}`);

const card = await QRCode.generate({
  data: QRCode.vcard({ name: "Ada Lovelace", phone: "+911234567890", email: "ada@example.com" }),
  preset: "classy",
  size: 360,
});
await card.save(`${out}/vcard.png`);
console.log(`  vcard verified: ${card.verified}`);

console.log("\nsvg output");
const svg = await QRCode.generate({ data: link, preset: "modern", size: 420 });
console.log(`  ${svg.toSVG().length} bytes`);
console.log(`\nwritten to ${out}`);
