import { entries, placeSlug } from './universe';

export interface ResolvedMention {
  mention: string;
  type: 'entry' | 'place' | 'unknown';
  entryType?: string;
  id?: string;
  name?: string;
  url?: string;
}

export async function resolveMention(mentionText: string): Promise<ResolvedMention> {
  const cleanMention = mentionText.replace(/^@/, '');
  const all = await entries();
  
  // 1. Try finding an entry by title or id (case-insensitive)
  const cleanLower = cleanMention.toLowerCase();
  const entryMatch = all.find(e => e.data.title.toLowerCase() === cleanLower || e.id.toLowerCase() === cleanLower);
  if (entryMatch) {
    return {
      mention: mentionText,
      type: 'entry',
      entryType: entryMatch.data.type,
      id: entryMatch.id,
      name: entryMatch.data.title,
      url: `/entry/${entryMatch.id}/`
    };
  }

  // 2. Try finding a place
  const places = [...new Set(all.map(x => x.data.location).filter(Boolean))];
  const placeMatch = places.find(p => String(p).toLowerCase() === cleanMention.toLowerCase());
  
  if (placeMatch) {
    return {
      mention: mentionText,
      type: 'place',
      name: String(placeMatch),
      url: `/places/${placeSlug(String(placeMatch))}/`
    };
  }

  // 3. Unresolved
  return {
    mention: mentionText,
    type: 'unknown'
  };
}

export async function parseMentionsInText(text: string): Promise<ResolvedMention[]> {
  const regex = /@([a-zA-Z0-9_-]+)/g;
  const matches = [...text.matchAll(regex)];
  const results: ResolvedMention[] = [];
  
  for (const match of matches) {
    const resolved = await resolveMention(match[1]);
    results.push(resolved);
  }
  
  return results;
}
