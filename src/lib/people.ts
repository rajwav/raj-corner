/**
 * People & Relationships architecture for Raj's Corner
 * 
 * Conceptual model:
 * 1. Chronology (2026, 2025, ...): All dated life events/memories/milestones.
 *    PEOPLE ARE NOT ASSIGNED TO YEARS.
 * 2. People: First-class person entities independent of dates.
 *    Each person can have related events/memories through the existing relationship system.
 *    If a person has no events yet (like Shakti), they simply appear cleanly without an "empty" state.
 * 3. Timeless: Genuinely undated life entries (excluding person entities).
 */

export interface PersonWithEvents {
  person: any;
  events: any[];
}

export interface LifeChronologicalYear {
  year: string;
  entries: any[];
}

export interface LifeSections {
  years: LifeChronologicalYear[];
  people: PersonWithEvents[];
  timeless: any[];
}

/**
 * Check whether an entry is related to a specific person entity.
 * Supports:
 * - entry.data.people includes person name/title or slug
 * - entry.data.related includes person id
 * - person.data.related includes entry id
 */
export function isEntryRelatedToPerson(entry: any, person: any): boolean {
  if (!entry || !person || entry.id === person.id) return false;

  const personTitleLower = (person.data?.title || '').toLowerCase().trim();
  const personIdLower = (person.id || '').toLowerCase().trim();
  const personSlugMatch = personIdLower.replace(/ /g, '-');

  // 1. entry.data.people matches person title or ID
  const peopleList: string[] = entry.data?.people || [];
  const inPeople = peopleList.some((p: string) => {
    if (!p) return false;
    const pl = p.toLowerCase().trim();
    return pl === personTitleLower || pl === personIdLower || pl.replace(/ /g, '-') === personSlugMatch;
  });
  if (inPeople) return true;

  // 2. entry.data.related matches person ID
  const relatedList: string[] = entry.data?.related || [];
  const inRelated = relatedList.some((r: string) => {
    if (!r) return false;
    const rl = r.toLowerCase().trim();
    return rl === personIdLower || rl === personSlugMatch;
  });
  if (inRelated) return true;

  // 3. person's own related list includes entry ID
  const personRelatedList: string[] = person.data?.related || [];
  const inPersonRelated = personRelatedList.some((r: string) => {
    if (!r) return false;
    const rl = r.toLowerCase().trim();
    return rl === entry.id.toLowerCase().trim();
  });
  if (inPersonRelated) return true;

  return false;
}

/**
 * Retrieve all entries connected to a person, sorted chronologically (newest first).
 */
export function getEntriesForPerson(person: any, allEntries: any[]): any[] {
  const matches = allEntries.filter(e => isEntryRelatedToPerson(e, person));
  
  return matches.sort((a, b) => {
    if (a.data?.date && b.data?.date) {
      return new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
    }
    if (a.data?.date) return -1;
    if (b.data?.date) return 1;
    return (a.data?.title || '').localeCompare(b.data?.title || '');
  });
}

/**
 * Build the directory of people with their related events.
 * The person list is completely independent of dates and years.
 * If a person has no events yet, events is empty [] and no empty-state is displayed.
 */
export function buildPeopleDirectory(allEntries: any[]): PersonWithEvents[] {
  const peopleEntries = allEntries.filter(e => e.data?.type === 'person');

  const result: PersonWithEvents[] = peopleEntries.map(person => {
    const events = getEntriesForPerson(person, allEntries);
    return {
      person,
      events
    };
  });

  // Sort: people with events first, then alphabetically by title
  result.sort((a, b) => {
    if (a.events.length > 0 && b.events.length === 0) return -1;
    if (b.events.length > 0 && a.events.length === 0) return 1;
    return (a.person.data?.title || '').localeCompare(b.person.data?.title || '');
  });

  return result;
}

/**
 * Build the conceptual Life world sections:
 * 1. Chronology (2026, 2025, ...): All dated non-person entries from that year
 * 2. People: All people entities with their associated events (independent of dates/years)
 * 3. Timeless: Genuinely undated non-person entries
 */
export function buildLifeSections(lifeEntries: any[], allEntries: any[]): LifeSections {
  // Non-person entries
  const nonPersonEntries = lifeEntries.filter(e => e.data?.type !== 'person');

  // 1. Chronology: dated non-person entries grouped by year
  const datedEntries = nonPersonEntries.filter(e => Boolean(e.data?.date));
  datedEntries.sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  const yearMap = new Map<string, any[]>();
  for (const entry of datedEntries) {
    const year = new Date(entry.data.date).getFullYear().toString();
    if (!yearMap.has(year)) {
      yearMap.set(year, []);
    }
    yearMap.get(year)!.push(entry);
  }

  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b.localeCompare(a));
  const years: LifeChronologicalYear[] = sortedYears.map(year => ({
    year,
    entries: yearMap.get(year) || []
  }));

  // 2. People: all person entities with their related events
  const people = buildPeopleDirectory(allEntries);

  // 3. Timeless: genuinely undated non-person entries
  const timeless = nonPersonEntries.filter(e => !e.data?.date);

  return {
    years,
    people,
    timeless
  };
}
