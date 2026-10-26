const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "src", "content");
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".md")) files.push(p);
  }
})(root);

const slugs = new Set();
const refs = [];
const badTitles = [];
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const titleLine = lines.find((l) => l.startsWith("title:"));
  const title = titleLine ? titleLine.slice(6).trim() : "";
  if (title.includes(": ") && !title.startsWith('"')) badTitles.push(path.relative(root, file));
  const slugLine = lines.find((l) => l.startsWith("slug:"));
  const slug = slugLine.slice(5).trim();
  slugs.add(slug);
  for (const key of ["prerequisites", "related"]) {
    const line = lines.find((l) => l.startsWith(key + ":"));
    if (!line) continue;
    const inner = line.slice(line.indexOf("[") + 1, line.lastIndexOf("]"));
    for (const r of inner.split(",").map((x) => x.trim()).filter(Boolean)) {
      refs.push({ from: slug, to: r, key });
    }
  }
}

const missing = refs.filter((r) => !slugs.has(r.to));
console.log(`Статей: ${slugs.size}, ссылок: ${refs.length}, битых: ${missing.length}`);
for (const m of missing) console.log(`  ${m.from} -> ${m.to} (${m.key})`);
if (badTitles.length) {
  console.log(`Заголовки с двоеточием без кавычек: ${badTitles.length}`);
  for (const f of badTitles) console.log(`  ${f}`);
}
process.exitCode = missing.length || badTitles.length ? 1 : 0;
