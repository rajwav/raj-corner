import { getCollection } from 'astro:content';

export const worlds = [
  ['life', 'Life', 'Memories, people, milestones, and the little things that make up a life.', 'sand'],
  ['travel', 'Travel', 'Trips, routes, future pin-drops, and the things noticed on the way.', 'coral'],
  ['interests', 'Things I like', 'Cars, music, space, books, chess, and temporary obsessions.', 'lime'],
  ['making', 'The workbench', 'Ideas, experiments, projects, and things I am learning how to make.', 'sky'],
  ['archive', 'The archive', 'Every page, photograph, note, and fragment—filed but never finished.', 'night'],
  ['me', 'Me, right now', 'A living snapshot, a life list, and plans still waiting for their day.', 'coral'],
] as const;

const typeWorld: Record<string, string> = {
  memory:'life', person:'life', milestone:'life', dream:'life', goal:'life', note:'life',
  travel:'travel', trip:'travel', place:'travel', photo:'travel',
  car:'interests', music:'interests', book:'interests', movie:'interests', anime:'interests', series:'interests', space:'interests', chess:'interests', game:'interests', sport:'interests', fitness:'interests', run:'interests', workout:'interests', challenge:'interests', technology:'interests', obsession:'interests', collection:'interests',
  experiment:'making', project:'making', idea:'making', thought:'making',
};

export const worldForType = (type: string) => typeWorld[type] ?? 'archive';
export const entryWorld = (entry: any) => entry?.data?.world || entry?.world || (entry?.data?.type ? worldForType(entry.data.type) : (entry?.type ? worldForType(entry.type) : 'archive'));
export const placeSlug = (place: string) => place.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function entries() { return (await getCollection('entries')).sort((a,b) => Number(b.data.date ?? 0) - Number(a.data.date ?? 0)); }
export const niceDate = (date?: Date) => date ? date.toLocaleDateString('en', {month:'short', year:'numeric'}) : 'Undated';
