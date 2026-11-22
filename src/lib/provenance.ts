import { YEAR_MAX } from '@/config';
import type { PersonProfile, WarIndexItem, WarProfile } from '@/types';

/**
 * Runtime degradation policy for model-generated content.
 *
 * Nothing in `public/` is rewritten: the cards ask these helpers what may be
 * shown, so restoring the old behaviour is a matter of reverting this module
 * and the call sites.
 */

export type EvidenceLevel = 'R0' | 'R1' | 'R2' | 'R3';
export type DisputeLevel = 'C0' | 'C1' | 'C2' | 'C3';

export interface Provenance {
  evidence: EvidenceLevel;
  dispute: DisputeLevel;
}

export type LifespanStatus = 'deceased' | 'living' | 'unknown';
export type AppraisalStance = 'supporter' | 'critic' | 'objective';

export const APPRAISAL_STANCES: readonly AppraisalStance[] = [
  'supporter',
  'critic',
  'objective',
];

/**
 * `death: null` means "living" for 11 people and "lifespan unknown" for 4
 * (Laozi, Euclid, Shi Nai'an, Guan Hanqing). The schema cannot tell them
 * apart and the profiles are not rewritten, so living people are listed
 * explicitly here — the least invasive option. Add new living profiles to
 * this set (or give them a real death year) so their appraisal stays hidden.
 */
export const LIVING_PERSON_IDS: ReadonlySet<string> = new Set([
  'noam-chomsky',
  'wole-soyinka',
  'jane-goodall',
  'bob-dylan',
  'paul-mccartney',
  'orhan-pamuk',
  'vladimir-putin',
  'bill-gates',
  'tim-berners-lee',
  'mo-yan',
  'linus-torvalds',
]);

/**
 * Conflicts still running in the dataset year.
 *
 * The shipped index pins these to 2023, short of `YEAR_MAX`, so the year test
 * below cannot catch them. One entry is a Chinese literal because that is what
 * the index carries; renaming it would mean touching `public/`.
 */
export const ONGOING_WAR_IDS: ReadonlySet<string> = new Set([
  'israel-gaza-conflict',
  'yemen_civil_war_houthi_conflict',
  '叙利亚内战',
]);

function countSources(sources: unknown): { total: number; linked: number } {
  if (!Array.isArray(sources)) return { total: 0, linked: 0 };
  let linked = 0;
  for (const source of sources) {
    if (typeof source === 'string') {
      if (/^https?:\/\//i.test(source.trim())) linked += 1;
      continue;
    }
    if (source && typeof source === 'object') {
      const url = (source as { url?: unknown }).url;
      if (typeof url === 'string' && url.trim()) linked += 1;
    }
  }
  return { total: sources.length, linked };
}

/** R0 = 2+ links, R1 = 1 link, R2 = named sources only, R3 = none. */
export function evidenceLevel(sources: unknown): EvidenceLevel {
  const { total, linked } = countSources(sources);
  if (total === 0) return 'R3';
  if (linked >= 2) return 'R0';
  if (linked === 1) return 'R1';
  return 'R2';
}

export function lifespanStatus(
  person: { personId?: string; death: number | null } | null | undefined,
): LifespanStatus {
  if (!person) return 'unknown';
  if (typeof person.death === 'number') return 'deceased';
  return person.personId && LIVING_PERSON_IDS.has(person.personId) ? 'living' : 'unknown';
}

export function isLivingPerson(profile: PersonProfile | null): boolean {
  return lifespanStatus(profile) === 'living';
}

export function isOngoingWar(
  war: Pick<WarIndexItem, 'warId' | 'endYear'> | null | undefined,
): boolean {
  if (!war) return false;
  if (war.warId && ONGOING_WAR_IDS.has(war.warId)) return true;
  return typeof war.endYear === 'number' && war.endYear >= YEAR_MAX;
}

export function personProvenance(profile: PersonProfile | null): Provenance {
  const status = lifespanStatus(profile);
  const dispute: DisputeLevel =
    status === 'living'
      ? 'C2'
      : profile?.evaluation || profile?.quotes
        ? 'C1'
        : 'C0';
  return {
    evidence: evidenceLevel((profile as (PersonProfile & { sources?: unknown }) | null)?.sources),
    dispute,
  };
}

export function warProvenance(
  war: Pick<WarIndexItem, 'warId' | 'endYear'> | null,
  profile: WarProfile | null,
): Provenance {
  return {
    evidence: evidenceLevel(profile?.sources),
    dispute: isOngoingWar(war ?? profile) ? 'C3' : 'C1',
  };
}
