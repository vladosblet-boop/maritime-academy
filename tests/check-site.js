const fs = require("fs");
const path = require("path");

const site = path.join(__dirname, "..", "_site");
const pages = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) pages.push(p);
  }
})(site);

function exists(urlPath) {
  const clean = decodeURIComponent(urlPath.split("#")[0].split("?")[0]);
  if (!clean) return true;
  const target = path.join(site, clean);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
  return fs.existsSync(path.join(target, "index.html"));
}

const broken = [];
const empty = [];
let links = 0;
for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  const rel = "/" + path.relative(site, page).replace(/\\/g, "/").replace(/index\.html$/, "");
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [""])[0].replace(/<[^>]+>/g, "").trim();
  if (main.length < 40) empty.push(rel);
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    links++;
    if (!exists(m[1])) broken.push(`${rel} -> ${m[1]}`);
  }
}

console.log(`Страниц: ${pages.length}, внутренних ссылок: ${links}, битых: ${broken.length}, почти пустых страниц: ${empty.length}`);
for (const b of broken) console.log("  битая: " + b);
for (const e of empty) console.log("  пустая: " + e);
process.exitCode = broken.length || empty.length ? 1 : 0;
