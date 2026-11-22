/**
 * Data accuracy audit: cross-checks people lifecycle against event references.
 *
 * Why a script instead of manual review: the dataset has 416 profiles and 5227
 * event shards; range violations are exactly the class of defect a machine can
 * prove without historical judgement, so they are extracted mechanically and
 * only ambiguous cases are escalated to human review.
 *
 * Output: .tmp-audit/data-accuracy.json (machine readable) plus an ASCII summary
 * on stdout, because the Windows console cannot print CJK reliably.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const profilesDir = path.join(root, 'public/people/profiles');
const eventsDir = path.join(root, 'public/events');
const outDir = path.join(root, '.tmp-audit');
fs.mkdirSync(outDir, { recursive: true });

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const profiles = [];
for (const file of fs.readdirSync(profilesDir)) {
  if (!file.endsWith('.json') || file === 'index.json') continue;
  const profile = readJson(path.join(profilesDir, file));
  if (profile && profile.personId) profiles.push(profile);
}

const report = {
  generatedAt: new Date().toISOString(),
  profileCount: profiles.length,
  invertedLife: [],
  pointOutsideLife: [],
  deathMentionMismatch: [],
  duplicateDeathMention: [],
  figureOutsideLife: [],
};

const DEATH_WORDS = ['去世', '驾崩', '逝世', '病逝', '被杀', '遇害', '阵亡', '死亡'];

for (const profile of profiles) {
  const { personId, name, birth, death } = profile;
  if (typeof birth === 'number' && typeof death === 'number' && death < birth) {
    report.invertedLife.push({ personId, name, birth, death });
  }
  for (const [index, point] of (profile.points ?? []).entries()) {
    const year = point?.year;
    if (typeof year !== 'number') continue;
    if (typeof birth === 'number' && year < birth) {
      report.pointOutsideLife.push({ personId, name, index, kind: 'before-birth', year, birth, title: point.title });
    }
    if (typeof death === 'number' && year > death) {
      report.pointOutsideLife.push({ personId, name, index, kind: 'after-death', year, death, title: point.title });
    }
  }
}

const nameToProfile = new Map();
for (const profile of profiles) {
  if (profile.name) nameToProfile.set(profile.name, profile);
  if (profile.nameEn) nameToProfile.set(profile.nameEn, profile);
}

const eventFiles = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.json'));
for (const file of eventFiles) {
  let shard;
  try {
    shard = readJson(path.join(eventsDir, file));
  } catch {
    continue;
  }
  const shardYear = typeof shard.year === 'number' ? shard.year : Number.parseInt(file, 10);
  if (!Number.isFinite(shardYear)) continue;
  for (const event of shard.events ?? []) {
    const text = `${event.title ?? ''}\n${event.description ?? ''}`;
    const figures = event.key_figures ?? [];
    for (const figure of figures) {
      const profile = nameToProfile.get(figure);
      if (!profile) continue;
      const { birth, death } = profile;
      if (typeof birth === 'number' && shardYear < birth) {
        report.figureOutsideLife.push({ eventId: event.id, file, shardYear, figure, personId: profile.personId, kind: 'before-birth', birth });
      }
      if (typeof death === 'number' && shardYear > death) {
        report.figureOutsideLife.push({ eventId: event.id, file, shardYear, figure, personId: profile.personId, kind: 'after-death', death });
      }
    }
    for (const word of DEATH_WORDS) {
      if (!text.includes(word)) continue;
      for (const profile of profiles) {
        if (!profile.name || !text.includes(profile.name)) continue;
        if (typeof profile.death !== 'number') continue;
        if (shardYear === profile.death) continue;
        report.deathMentionMismatch.push({
          eventId: event.id,
          file,
          shardYear,
          personId: profile.personId,
          name: profile.name,
          word,
          recordedDeath: profile.death,
        });
      }
    }
  }
}

const seen = new Map();
for (const hit of report.deathMentionMismatch) {
  const key = `${hit.personId}|${hit.shardYear}`;
  if (seen.has(key)) continue;
  seen.set(key, true);
}
for (const profile of profiles) {
  const years = new Set(
    report.deathMentionMismatch.filter((h) => h.personId === profile.personId).map((h) => h.shardYear),
  );
  if (years.size > 1) {
    report.duplicateDeathMention.push({ personId: profile.personId, name: profile.name, years: [...years].sort((a, b) => a - b) });
  }
}

fs.writeFileSync(path.join(outDir, 'data-accuracy.json'), JSON.stringify(report, null, 2), 'utf8');

const summary = {
  profiles: report.profileCount,
  events: eventFiles.length,
  invertedLife: report.invertedLife.length,
  pointOutsideLife: report.pointOutsideLife.length,
  figureOutsideLife: report.figureOutsideLife.length,
  deathMentionMismatch: report.deathMentionMismatch.length,
  duplicateDeathMention: report.duplicateDeathMention.length,
};
console.log(JSON.stringify(summary, null, 2));
