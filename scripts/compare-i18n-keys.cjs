// Compare EN and AR JSON files to find keys that exist in EN but not AR (or vice versa)
const fs = require('fs');
const path = require('path');

const enDir = path.join(__dirname, '..', 'src', 'locales', 'en');
const arDir = path.join(__dirname, '..', 'src', 'locales', 'ar');

function flatten(obj, prefix, result) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null) flatten(v, key, result);
    else result[key] = v;
  }
  return result;
}

const files = fs.readdirSync(enDir).filter(f => f.endsWith('.json'));
let totalMissing = 0;

for (const file of files) {
  const enContent = JSON.parse(fs.readFileSync(path.join(enDir, file), 'utf8'));
  const arPath = path.join(arDir, file);

  if (!fs.existsSync(arPath)) {
    console.log(`\n=== ${file}: AR file missing! ===`);
    totalMissing++;
    continue;
  }

  const arContent = JSON.parse(fs.readFileSync(arPath, 'utf8'));
  const enFlat = flatten(enContent, '', {});
  const arFlat = flatten(arContent, '', {});

  const missingInAr = Object.keys(enFlat).filter(k => !(k in arFlat));
  const missingInEn = Object.keys(arFlat).filter(k => !(k in enFlat));

  if (missingInAr.length > 0 || missingInEn.length > 0) {
    console.log(`\n=== ${file} ===`);
    if (missingInAr.length > 0) {
      console.log(`  Missing in AR (${missingInAr.length}):`);
      for (const k of missingInAr) console.log(`    - ${k}`);
      totalMissing += missingInAr.length;
    }
    if (missingInEn.length > 0) {
      console.log(`  Missing in EN (${missingInEn.length}):`);
      for (const k of missingInEn) console.log(`    - ${k}`);
      totalMissing += missingInEn.length;
    }
  }
}

console.log(`\nTotal mismatches: ${totalMissing}`);
