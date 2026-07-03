/**
 * Fix China territorial integrity in polity GeoJSON files.
 *
 * 1. Removes "Republic of China" entries from 1950 onwards (Taiwan as separate polity)
 * 2. Merges Taiwan's geometry into all PRC entries for overlapping time periods
 * 3. Backs up originals before modifying
 *
 * Usage:  node scripts/fix_china_territory.cjs
 */

const fs = require('fs');
const path = require('path');

const POLITIES_DIR = 'public/ne/polities';
const TARGET_FILES = ['polities_1900_2000.json', 'polities_2000_2100.json'];
const BACKUP_SUFFIX = '.backup_before_taiwan_fix';

for (const filename of TARGET_FILES) {
  const filePath = path.join(POLITIES_DIR, filename);
  if (!fs.existsSync(filePath)) continue;

  const backupPath = filePath + BACKUP_SUFFIX;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log('📦 Backed up:', filename);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const features = data.features || [];

  // Collect Taiwan geometries from ROC post-1950
  const taiwanGeoms = [];
  const rocIndices = [];
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const name = f.properties?.Name || '';
    if (name === 'Republic of China' && f.properties?.FromYear >= 1950) {
      rocIndices.push(i);
      if (f.geometry.type === 'Polygon') {
        taiwanGeoms.push(f.geometry.coordinates);
      } else if (f.geometry.type === 'MultiPolygon') {
        taiwanGeoms.push(...f.geometry.coordinates);
      }
    }
  }

  if (rocIndices.length === 0) {
    console.log('ℹ', filename, ': No ROC (Taiwan) entries');
    continue;
  }

  console.log(`📍 ${filename}: found ${rocIndices.length} ROC entries, ${taiwanGeoms.length} Taiwan geometry parts`);

  // Remove ROC entries and merge Taiwan into PRC
  const newFeatures = [];
  let mergeCount = 0;
  for (let i = 0; i < features.length; i++) {
    if (rocIndices.includes(i)) continue;
    const f = features[i];
    const name = f.properties?.Name || '';

    // Merge Taiwan into ALL PRC entries (post-1950)
    if (name === "People's Republic of China" && f.properties?.FromYear >= 1950) {
      const merged = JSON.parse(JSON.stringify(f));
      for (const geom of taiwanGeoms) {
        merged.geometry.coordinates.push(geom);
      }
      newFeatures.push(merged);
      mergeCount++;
    } else {
      newFeatures.push(f);
    }
  }

  data.features = newFeatures;
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  console.log(`💾 ${filename}: ${features.length} → ${newFeatures.length} features (${rocIndices.length} ROC removed, Taiwan merged into ${mergeCount} PRC entries)\n`);
}

console.log('✅ Done. Backups at *' + BACKUP_SUFFIX);
