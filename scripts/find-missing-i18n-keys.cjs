// Extract all t() translation keys from source and find missing ones in JSON
// Tracks the default namespace per file via useTranslation('ns')
const fs = require('fs');
const path = require('path');

function findFiles(dir, ext) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'locales') {
      results = results.concat(findFiles(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

const srcDir = path.join(__dirname, '..', 'src');
const files = findFiles(srcDir, '.tsx').concat(findFiles(srcDir, '.ts'));

// Pattern for useTranslation('ns')
const nsPattern = /useTranslation\(['"`]([a-zA-Z0-9_]+)['"`]\)/;
// Pattern for t('key') or t('ns:key')
const tPattern = /t\(['"`]([a-zA-Z0-9_.:]+)['"`]/g;
// Also catch template literals t(`common:status.${...}`)
const tTemplatePattern = /t\(`([a-zA-Z0-9_.:]+)\$\{/g;

// Collect keys with their resolved namespace
const byNamespace = {};

function addKey(ns, k) {
  if (!byNamespace[ns]) byNamespace[ns] = new Set();
  byNamespace[ns].add(k);
}

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');

  // Find default namespace
  const nsMatch = nsPattern.exec(content);
  const defaultNs = nsMatch ? nsMatch[1] : 'common';

  // Extract t() calls
  let match;
  tPattern.lastIndex = 0;
  while ((match = tPattern.exec(content)) !== null) {
    const key = match[1];
    if (key.includes(':')) {
      const [ns, k] = key.split(':');
      addKey(ns, k);
    } else {
      addKey(defaultNs, key);
    }
  }

  // Extract template literal t() calls
  tTemplatePattern.lastIndex = 0;
  while ((match = tTemplatePattern.exec(content)) !== null) {
    const key = match[1];
    if (key.includes(':')) {
      const [ns, k] = key.split(':');
      // Add the prefix (without the ${...} part)
      addKey(ns, k);
    } else {
      addKey(defaultNs, key);
    }
  }
}

// Flatten existing JSON
function flatten(obj, prefix, result) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null) flatten(v, key, result);
    else result[key] = v;
  }
  return result;
}

// Load existing JSON files and find missing keys
const enDir = path.join(srcDir, 'locales', 'en');
let totalMissing = 0;
for (const ns of Object.keys(byNamespace).sort()) {
  const jsonPath = path.join(enDir, ns + '.json');
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch {}

  const flat = flatten(existing, '', {});
  const missing = [];
  for (const k of [...byNamespace[ns]].sort()) {
    if (!(k in flat)) missing.push(k);
  }

  if (missing.length > 0) {
    totalMissing += missing.length;
    console.log(`\n=== MISSING in ${ns}.json (${missing.length} keys) ===`);
    for (const k of missing) console.log(`  ${k}`);
  }
}
console.log(`\nTotal missing: ${totalMissing}`);
