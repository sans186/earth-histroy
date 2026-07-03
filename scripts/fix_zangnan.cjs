/**
 * Fix 藏南 (South Tibet / Arunachal Pradesh) — merge into PRC from India.
 *
 * Clips the disputed territory south of the McMahon Line from India's
 * mainland polygon and merges it into all PRC entries (both files).
 *
 * Uses @turf/turf for polygon boolean operations.
 *
 * Usage:  node scripts/fix_zangnan.cjs
 */

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const POLITIES_DIR = 'public/ne/polities';
const TARGET_FILES = ['polities_1900_2000.json', 'polities_2000_2100.json'];
const BACKUP_SUFFIX = '.backup_before_zangnan_fix';

/**
 * Build a clip polygon for 藏南 from reference PRC and India features.
 *
 * Northern edge: McMahon Line from PRC boundary (~91.7E to ~97.4E, sorted W→E)
 * Southern edge: straight line at 26.7N
 * Side edges: straight vertical lines connecting the ends
 *
 * Returns a GeoJSON Polygon feature.
 */
function buildClipPolygon(prcFeature, indiaFeature) {
  // PRC mainland ring (largest ring)
  let prcMainland = null;
  let maxLen = 0;
  for (const ring of prcFeature.geometry.coordinates) {
    if (ring[0].length > maxLen) { maxLen = ring[0].length; prcMainland = ring[0]; }
  }

  // Collect McMahon Line points from PRC (91-98E, 27-30N), sort W→E
  const mcmahonPts = prcMainland
    .filter(c => c[0] >= 91.0 && c[0] <= 98.0 && c[1] >= 27.0 && c[1] <= 30.0)
    .sort((a, b) => a[0] - b[0]);

  if (mcmahonPts.length < 3) {
    console.error('  Not enough McMahon Line points found:', mcmahonPts.length);
    return null;
  }

  const first = mcmahonPts[0];
  const last = mcmahonPts[mcmahonPts.length - 1];
  const southernLat = 26.7;

  // Ring: start at western end of McMahon Line, go E along McMahon,
  // then S, then W, then N back to start (ring closes by repeating first coord)
  const ring = [
    ...mcmahonPts.map(c => [c[0], c[1]]),
    [last[0], southernLat],
    [first[0], southernLat],
    [first[0], first[1]],  // close ring
  ];

  return turf.polygon([ring]);
}

/**
 * Apply turf.difference on a MultiPolygon by processing each part separately
 * and only differencing the part that intersects with the clipper.
 */
// Wrap turf v7 calls (which take FeatureCollection)
function intersect(a, b) {
  return turf.intersect(turf.featureCollection([a, b]));
}
function diff(a, b) {
  return turf.difference(turf.featureCollection([a, b]));
}

function diffMultiPolygon(multiCoords, clipPoly) {
  const remaining = [];

  for (const part of multiCoords) {
    const poly = turf.polygon(part);
    try {
      const inter = intersect(poly, clipPoly);
      if (inter) {
        // This part intersects — subtract the clipper
        const diffed = diff(poly, clipPoly);
        if (diffed && diffed.geometry) {
          if (diffed.geometry.type === 'Polygon') {
            remaining.push(diffed.geometry.coordinates);
          } else if (diffed.geometry.type === 'MultiPolygon') {
            remaining.push(...diffed.geometry.coordinates);
          }
        }
        // If diffed is null (part fully covered), skip it entirely
      } else {
        // No intersection — keep this part as-is
        remaining.push(part);
      }
    } catch (e) {
      // On error, keep the original part
      console.warn('  diffMultiPolygon error on part:', e.message);
      remaining.push(part);
    }
  }

  if (remaining.length === 0) return null;
  if (remaining.length === 1) return { type: 'Polygon', coordinates: remaining[0] };
  return { type: 'MultiPolygon', coordinates: remaining };
}

// ── Process one file ──
function processFile(filename) {
  const filePath = path.join(POLITIES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log('File not found:', filename);
    return;
  }

  // Backup
  const backupPath = filePath + BACKUP_SUFFIX;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log('Backed up:', filename);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const features = data.features || [];

  // Reference features for building clip polygon
  const refPrc = features.find(f =>
    f.properties?.Name === "People's Republic of China" && f.properties?.FromYear >= 1960
  );
  const refIndia = features.find(f =>
    f.properties?.Name === 'Republic of India' && f.properties?.FromYear >= 1960
  );

  if (!refPrc || !refIndia) {
    console.log('No suitable PRC/India reference features in', filename);
    return;
  }

  const clipPoly = buildClipPolygon(refPrc, refIndia);
  if (!clipPoly) {
    console.log('Could not build clip polygon for', filename);
    return;
  }

  const newFeatures = [];
  let zangnanGeom = null;
  let indiaModified = 0;
  let prcModified = 0;

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const name = f.properties?.Name || '';

    // ── Republic of India: extract 藏南, then remove it ──
    if (name === 'Republic of India') {
      try {
        const indiaFull = turf.multiPolygon(f.geometry.coordinates);
        const intersected = intersect(indiaFull, clipPoly);

        if (intersected) {
          // Save 藏南 geometry (first successful extraction)
          if (!zangnanGeom) {
            zangnanGeom = intersectToMultiPolygon(intersected.geometry);
            console.log('  Extracted 藏南 geometry, type:', zangnanGeom.type, 'parts:', zangnanGeom.type === 'MultiPolygon' ? zangnanGeom.coordinates.length : 1);
          }

          // Remove 藏南 from India
          try {
            const newGeom = diffMultiPolygon(f.geometry.coordinates, clipPoly);
            if (newGeom) {
              const copy = JSON.parse(JSON.stringify(f));
              copy.geometry = newGeom;
              newFeatures.push(copy);
              indiaModified++;
            } else {
              console.warn('  diffMultiPolygon returned null for', name, f.properties?.FromYear);
              newFeatures.push(f);
            }
          } catch (e) {
            console.warn('  Difference error for', name, f.properties?.FromYear, ':', e.message);
            newFeatures.push(f);
          }
        } else {
          // No intersection — keep original India
          newFeatures.push(f);
        }
      } catch (e) {
        console.warn('  Intersect error for', name, f.properties?.FromYear, ':', e.message);
        newFeatures.push(f);
      }
      continue;
    }

    // ── PRC post-1950: merge 藏南 ──
    if (name === "People's Republic of China" && f.properties?.FromYear >= 1950 && zangnanGeom) {
      const merged = JSON.parse(JSON.stringify(f));
      if (zangnanGeom.type === 'Polygon') {
        merged.geometry.coordinates.push(zangnanGeom.coordinates);
      } else if (zangnanGeom.type === 'MultiPolygon') {
        for (const coords of zangnanGeom.coordinates) {
          merged.geometry.coordinates.push(coords);
        }
      }
      newFeatures.push(merged);
      prcModified++;
      continue;
    }

    newFeatures.push(f);
  }

  data.features = newFeatures;
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  console.log(`Saved ${filename}: ${features.length}→${newFeatures.length} features, India mod: ${indiaModified}, PRC mod: ${prcModified}`);
}

function intersectToMultiPolygon(geom) {
  if (geom.type === 'MultiPolygon') return geom;
  if (geom.type === 'Polygon') return { type: 'MultiPolygon', coordinates: [geom.coordinates] };
  return geom;
}

// ── Main ──
for (const filename of TARGET_FILES) {
  console.log('\nProcessing', filename, '...');
  processFile(filename);
}

console.log('\nDone. Backups at *' + BACKUP_SUFFIX);
