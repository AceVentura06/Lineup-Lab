// After a build, stamp index.html with a short hash of the chart bundle so browsers
// fetch the new version instead of a cached old one (the ?v= on the islands.js/css links).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const hash = createHash("sha256")
  .update(readFileSync(here("../../assets/charts/islands.js")))
  .update(readFileSync(here("../../assets/charts/islands.css")))
  .digest("hex")
  .slice(0, 10);

const page = here("../../index.html");
const before = readFileSync(page, "utf8");
const after = before.replace(/(assets\/charts\/islands\.(?:js|css)\?v=)[\w-]+/g, `$1${hash}`);
if (after !== before) writeFileSync(page, after);
console.log(`chart bundle ${hash}${after === before ? " (index.html already current)" : " stamped into index.html"}`);
