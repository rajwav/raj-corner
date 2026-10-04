import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const entrySchema = z.object({
  title: z.string(),
  type: z.enum([
    'memory', 'travel', 'trip', 'photo', 'place', 'car', 'music', 'book', 'movie', 'anime', 'space', 'chess',
    'experiment', 'project', 'idea', 'thought', 'person', 'milestone', 'dream', 'goal', 'collection', 'note',
    'game', 'sport', 'fitness', 'run', 'workout', 'challenge', 'series', 'technology', 'obsession'
  ]),
  world: z.enum(['life', 'travel', 'interests', 'making', 'archive']).optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  date: z.coerce.date().optional(),
  location: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  mood: z.array(z.string()).default([]),
  audio: z.string().optional(),
  link: z.string().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
  related: z.array(z.string()).default([]),
  people: z.array(z.string()).default([]),
  cover: z.string().optional(),
  featured: z.boolean().default(false),
  status: z.enum(['past', 'now', 'future']).default('past'),
  accent: z.enum(['coral', 'sky', 'lime', 'night', 'sand']).default('sand'),
  // Lightweight metadata fields for Things I Like
  make: z.string().optional(),
  model: z.string().optional(),
  generation: z.string().optional(),
  specs: z.record(z.string(), z.any()).optional(),
  distance: z.number().optional(),
  duration: z.string().optional(),
  pace: z.string().optional(),
  splits: z.array(z.string()).optional(),
  exercises: z.array(z.object({
    name: z.string(),
    sets: z.number().optional(),
    reps: z.number().optional(),
    weight: z.number().optional(),
    notes: z.string().optional()
  })).optional(),
  readingStatus: z.string().optional(),
  sportStatus: z.string().optional(),
  watchStatus: z.string().optional(),
  mediaType: z.string().optional(),
  platform: z.string().optional(),
  goal: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  progress: z.string().optional(),
  // Omitted visibility is deliberately private. `public` must be written in
  // frontmatter by the owner, so existing content never becomes public by
  // accident when the access policy changes.
  visibility: z.enum(['public', 'private', 'absolute_private']).optional(),
  allowRequests: z.boolean().default(true),
  presentation: z.object({
    layout: z.object({
      mode: z.enum(['default', 'editorial', 'centered', 'split', 'immersive']).optional()
    }).optional(),
    title: z.object({ size: z.string().optional(), align: z.string().optional(), font: z.string().optional() }).optional(),
    description: z.object({ size: z.string().optional(), align: z.string().optional(), font: z.string().optional() }).optional(),
    story: z.object({ size: z.string().optional(), width: z.string().optional() }).optional(),
    cover: z.object({ size: z.string().optional(), align: z.string().optional(), treatment: z.string().optional(), alt: z.string().optional(), caption: z.string().optional() }).optional()
  }).optional(),
});
const entries = defineCollection({ loader: glob({ pattern:'**/*.md', base:'./src/content/entries' }), schema: entrySchema });
const currently = defineCollection({ loader: glob({ pattern:'**/*.md', base:'./src/content/currently' }), schema: z.object({ updated:z.coerce.date(), listening:z.string().optional(), learning:z.string().optional(), reading:z.string().optional(), watching:z.string().optional(), building:z.string().optional(), thinking:z.string().optional(), wanting:z.string().optional(), planning:z.string().optional(), obsessed:z.string().optional() }) });
const lifeLists = defineCollection({ loader: glob({ pattern:'**/*.md', base:'./src/content/lifeLists' }), schema: z.object({ updated:z.coerce.date(), done:z.array(z.string()).default([]), next:z.array(z.string()).default([]), someday:z.array(z.string()).default([]) }) });
export const collections = { entries, currently, lifeLists };
