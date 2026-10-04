/**
 * Things I Like (Cabinet of Curiosities) architecture for Raj's Corner
 * 
 * Defines the 11 top-level categories:
 * 1. MUSIC
 * 2. CARS
 * 3. SPACE
 * 4. BOOKS
 * 5. GAMES (includes Chess)
 * 6. SPORTS
 * 7. FITNESS (includes Running & Gym)
 * 8. CHALLENGES
 * 9. MOVIES & ANIME
 * 10. TECHNOLOGY
 * 11. TEMPORARY OBSESSIONS
 */

export interface CategoryDefinition {
  id: string;
  name: string;
  shortDesc: string;
  accent: 'lime' | 'coral' | 'sky' | 'sand' | 'night';
  badge: string;
}

export const INTEREST_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'music',
    name: 'Music',
    shortDesc: 'Records and tracks attached to places, evenings, and memory.',
    accent: 'lime',
    badge: 'Listening Shelf'
  },
  {
    id: 'cars',
    name: 'Cars',
    shortDesc: 'Engineering, proportions, and machines built with uncompromising soul.',
    accent: 'sand',
    badge: 'Machines & Lines'
  },
  {
    id: 'space',
    name: 'Space',
    shortDesc: 'The universe is probably the most ridiculous thing I’m interested in.',
    accent: 'night',
    badge: 'Cosmic Extremes'
  },
  {
    id: 'books',
    name: 'Books',
    shortDesc: 'Technical foundations, ideas that reshape perspective, and pages worth returning to.',
    accent: 'sand',
    badge: 'Reading & Study'
  },
  {
    id: 'games',
    name: 'Games',
    shortDesc: 'Tactics, quick rounds with friends, and games that test patience.',
    accent: 'coral',
    badge: 'Play & Tactics'
  },
  {
    id: 'sports',
    name: 'Sports',
    shortDesc: 'Games played under open skies, tournaments watched, and sports waiting to be tried.',
    accent: 'sky',
    badge: 'Athletic Pursuits'
  },
  {
    id: 'fitness',
    name: 'Fitness',
    shortDesc: 'Kilometers logged on the road and iron moved in the gym. Built for quick tracking.',
    accent: 'lime',
    badge: 'Running & Training'
  },
  {
    id: 'challenges',
    name: 'Challenges',
    shortDesc: 'Intentional missions against friction, complacency, and time.',
    accent: 'coral',
    badge: 'Active Missions'
  },
  {
    id: 'movies-anime',
    name: 'Movies & Anime',
    shortDesc: 'Cinema, serial storytelling, and animations that left an imprint.',
    accent: 'sand',
    badge: 'Screen & Story'
  },
  {
    id: 'technology',
    name: 'Technology',
    shortDesc: 'Tools, machines, and software I am curious about, build with, and explore.',
    accent: 'sky',
    badge: 'Tools & Silicon'
  },
  {
    id: 'temporary-obsessions',
    name: 'Temporary Obsessions',
    shortDesc: 'Currently in the replacement stage. Something meaningful will take this spot soon. Stay tuned.',
    accent: 'night',
    badge: 'Living Spotlight'
  }
];

/**
 * Determine which category an entry belongs to.
 */
export function getCategoryForEntry(entry: any): string {
  const cat = entry.data?.category?.toLowerCase().trim();
  const type = entry.data?.type?.toLowerCase().trim();

  if (cat) {
    if (cat === 'music') return 'music';
    if (cat === 'cars' || cat === 'car') return 'cars';
    if (cat === 'space') return 'space';
    if (cat === 'books' || cat === 'book') return 'books';
    if (cat === 'games' || cat === 'game' || cat === 'chess') return 'games';
    if (cat === 'sports' || cat === 'sport') return 'sports';
    if (cat === 'fitness' || cat === 'running' || cat === 'gym') return 'fitness';
    if (cat === 'challenges' || cat === 'challenge') return 'challenges';
    if (cat === 'movies-anime' || cat === 'movie' || cat === 'anime' || cat === 'series' || cat === 'film') return 'movies-anime';
    if (cat === 'technology' || cat === 'tech') return 'technology';
    if (cat === 'temporary-obsessions' || cat === 'obsession') return 'temporary-obsessions';
  }

  // Fallback to type
  if (type === 'music') return 'music';
  if (type === 'car') return 'cars';
  if (type === 'space') return 'space';
  if (type === 'book') return 'books';
  if (type === 'chess' || type === 'game') return 'games';
  if (type === 'sport') return 'sports';
  if (type === 'fitness' || type === 'run' || type === 'workout') return 'fitness';
  if (type === 'challenge') return 'challenges';
  if (type === 'movie' || type === 'anime' || type === 'series') return 'movies-anime';
  if (type === 'technology') return 'technology';
  if (type === 'obsession') return 'temporary-obsessions';

  return 'technology';
}

export interface InterestRoom {
  category: CategoryDefinition;
  entries: any[];
}

/**
 * Group entries across the 11 Cabinet of Curiosities rooms.
 */
export function buildInterestRooms(interestEntries: any[]): InterestRoom[] {
  const map = new Map<string, any[]>();
  for (const cat of INTEREST_CATEGORIES) {
    map.set(cat.id, []);
  }

  for (const entry of interestEntries) {
    const catId = getCategoryForEntry(entry);
    if (map.has(catId)) {
      map.get(catId)!.push(entry);
    }
  }

  return INTEREST_CATEGORIES.map(cat => ({
    category: cat,
    entries: map.get(cat.id) || []
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Running & Fitness Metrics Engine (Dynamic Personal Bests)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Running & Fitness Metrics Engine (Dynamic Personal Bests)
// ─────────────────────────────────────────────────────────────────────────────

export interface RunningPersonalBests {
  fastest1k: string;
  fastest5k: string;
  fastest10k: string;
  longestRun: string;
  fastestPace: string;
  totalDistance: number;
  totalDisplay: string;
  totalRuns: number;
}

export function parseDurationToSeconds(duration?: string | number): number {
  if (!duration) return 0;
  if (typeof duration === 'number') return duration;
  const parts = duration.toString().trim().split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(duration) || 0;
}

export function formatSecondsToTime(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '—';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatPace(paceSeconds: number): string {
  if (!paceSeconds || isNaN(paceSeconds) || paceSeconds <= 0) return '—';
  const mins = Math.floor(paceSeconds / 60);
  const secs = Math.round(paceSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')} /km`;
}

/**
 * Authoritative user-confirmed personal records.
 * Treat as ground truth baseline; dynamically updated whenever a new genuine run
 * or workout exceeds these benchmarks.
 */
export const AUTHORITATIVE_RUNNING_BASELINE = {
  fastest1kSeconds: parseDurationToSeconds('3:58'), // 3:58 -> 238s
  fastest5kSeconds: parseDurationToSeconds('23:45'), // 23:45 -> 1425s
  fastest10kSeconds: parseDurationToSeconds('58:57'), // 58:57 -> 3537s
  longestRunKm: 15.0,
  baselineTotalDistanceKm: 200.0,
  bestPaceSeconds: Math.round(1425 / 5), // 285s -> 4:45 /km (derived from 23:45 5K)
};

export const AUTHORITATIVE_GYM_BASELINE: GymExerciseRecord[] = [
  {
    name: 'Deadlift',
    maxWeight: 150,
    repsAtMax: 1,
    dateStr: 'Personal Record',
    entryId: ''
  },
  {
    name: 'Bench Press',
    maxWeight: 75,
    repsAtMax: 1,
    dateStr: 'Personal Record',
    entryId: ''
  }
];

/**
 * Automatically calculate personal bests comparing genuine recorded runs
 * against authoritative user baselines.
 */
export function calculateRunningPersonalBests(runEntries: any[] = []): RunningPersonalBests {
  const runs = (runEntries || []).filter(e => {
    const isRun = e.data?.type === 'run' || e.data?.subcategory === 'running' || (e.data?.distance && e.data?.distance > 0);
    return isRun && (e.data?.distance || e.data?.duration);
  });

  let min1kSeconds = AUTHORITATIVE_RUNNING_BASELINE.fastest1kSeconds;
  let min5kSeconds = AUTHORITATIVE_RUNNING_BASELINE.fastest5kSeconds;
  let min10kSeconds = AUTHORITATIVE_RUNNING_BASELINE.fastest10kSeconds;
  let maxDistance = AUTHORITATIVE_RUNNING_BASELINE.longestRunKm;
  let minPaceSeconds = AUTHORITATIVE_RUNNING_BASELINE.bestPaceSeconds;
  let recordedDistance = 0;

  for (const run of runs) {
    const dist = Number(run.data?.distance || 0);
    const durSec = parseDurationToSeconds(run.data?.duration);
    recordedDistance += dist;

    if (dist > maxDistance) {
      maxDistance = dist;
    }

    if (dist > 0 && durSec > 0) {
      const paceSec = durSec / dist;
      if (paceSec < minPaceSeconds) {
        minPaceSeconds = paceSec;
      }

      // Check splits for fastest 1k if present
      if (Array.isArray(run.data?.splits) && run.data.splits.length > 0) {
        for (const sp of run.data.splits) {
          const spSec = parseDurationToSeconds(sp);
          if (spSec > 0 && spSec < min1kSeconds) {
            min1kSeconds = spSec;
          }
        }
      } else if (dist >= 0.95 && dist <= 1.05 && durSec < min1kSeconds) {
        min1kSeconds = durSec;
      }

      // 5k
      if (dist >= 4.9) {
        const est5k = (paceSec * 5);
        if (est5k < min5kSeconds) {
          min5kSeconds = est5k;
        }
      }

      // 10k
      if (dist >= 9.8) {
        const est10k = (paceSec * 10);
        if (est10k < min10kSeconds) {
          min10kSeconds = est10k;
        }
      }
    }
  }

  const totalDistance = Math.round((AUTHORITATIVE_RUNNING_BASELINE.baselineTotalDistanceKm + recordedDistance) * 10) / 10;
  const totalDisplay = recordedDistance > 0 ? `${totalDistance} km` : '200+ km';

  return {
    fastest1k: formatSecondsToTime(min1kSeconds),
    fastest5k: formatSecondsToTime(min5kSeconds),
    fastest10k: formatSecondsToTime(min10kSeconds),
    longestRun: `${maxDistance} km`,
    fastestPace: formatPace(minPaceSeconds),
    totalDistance,
    totalDisplay,
    totalRuns: runs.length
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gym Metrics Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface GymExerciseRecord {
  name: string;
  maxWeight: number;
  repsAtMax: number;
  dateStr: string;
  entryId: string;
}

export function calculateGymRecords(gymEntries: any[] = []): GymExerciseRecord[] {
  const workouts = (gymEntries || []).filter(e => {
    return e.data?.type === 'workout' || e.data?.subcategory === 'gym' || (Array.isArray(e.data?.exercises) && e.data.exercises.length > 0);
  });

  const recordMap = new Map<string, GymExerciseRecord>();

  // Seed with authoritative confirmed baseline records
  for (const b of AUTHORITATIVE_GYM_BASELINE) {
    recordMap.set(b.name.toLowerCase(), { ...b });
  }

  for (const w of workouts) {
    const list = w.data?.exercises || [];
    const dateStr = w.data?.date ? new Date(w.data.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    
    for (const ex of list) {
      if (!ex.name) continue;
      const cleanName = ex.name.trim();
      const key = cleanName.toLowerCase();
      const weight = Number(ex.weight || 0);
      const reps = Number(ex.reps || 0);

      const existing = recordMap.get(key) || (key.includes('deadlift') ? recordMap.get('deadlift') : (key.includes('bench') ? recordMap.get('bench press') : undefined));
      if (!existing || weight > existing.maxWeight || (weight === existing.maxWeight && reps > existing.repsAtMax)) {
        recordMap.set(key, {
          name: cleanName,
          maxWeight: weight,
          repsAtMax: reps || 1,
          dateStr: dateStr || 'Logged Session',
          entryId: w.id
        });
      }
    }
  }

  return Array.from(recordMap.values()).sort((a, b) => b.maxWeight - a.maxWeight);
}
