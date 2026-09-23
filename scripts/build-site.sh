#!/usr/bin/env bash
# Assemble the GitHub Pages site into $1 (default _site): the static pages in
# site/, privacy.html rendered from PRIVACY.md, and a freshly fetched
# models.json. A Pages deploy replaces the whole site, so everything served
# at https://ai-analyzer.arlo-ai.app/ has to be built here.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${1:-_site}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp site/index.html site/404.html site/style.css site/icon.png "$OUT/"

npx --yes marked@18 -i PRIVACY.md -o "$OUT/privacy.body.html"
node -e '
  const fs = require("fs");
  const [template, body, out] = process.argv.slice(1);
  fs.writeFileSync(out, fs.readFileSync(template, "utf8").replace("<!-- PRIVACY -->", fs.readFileSync(body, "utf8")));
' site/privacy.template.html "$OUT/privacy.body.html" "$OUT/privacy.html"
rm "$OUT/privacy.body.html"

# Fails (and so fails the deploy) when OpenRouter's answer looks broken.
node --experimental-strip-types scripts/fetch-openrouter-pricing.ts --json "$OUT/models.json" --no-ts
