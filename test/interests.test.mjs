import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  INTEREST_CATEGORIES,
  getCategoryForEntry,
  buildInterestRooms,
  calculateRunningPersonalBests,
  calculateGymRecords,
  AUTHORITATIVE_RUNNING_BASELINE,
  AUTHORITATIVE_GYM_BASELINE,
  parseDurationToSeconds,
  formatSecondsToTime,
  formatPace
} from '../src/lib/interests.ts';
import { evaluateAccess, isFitnessResource } from '../src/lib/access-control/policy.ts';

describe('Things I Like — Cabinet of Curiosities Architecture', () => {
  it('1. Exactly 11 top-level categories exist in the exact required order', () => {
    const expectedIds = [
      'music',
      'cars',
      'space',
      'books',
      'games',
      'sports',
      'fitness',
      'challenges',
      'movies-anime',
      'technology',
      'temporary-obsessions'
    ];
    assert.strictEqual(INTEREST_CATEGORIES.length, 11);
    assert.deepStrictEqual(INTEREST_CATEGORIES.map(c => c.id), expectedIds);
  });

  it('2. Chess is strictly routed into GAMES, not as a top-level category', () => {
    const chessEntry = { data: { type: 'chess', title: 'Chess' } };
    assert.strictEqual(getCategoryForEntry(chessEntry), 'games');

    const gameEntry = { data: { type: 'game', title: 'COD Mobile' } };
    assert.strictEqual(getCategoryForEntry(gameEntry), 'games');
  });

  it('3. Running and Gym workouts are strictly routed into FITNESS', () => {
    const runEntry = { data: { type: 'run', title: 'Morning 5K' } };
    assert.strictEqual(getCategoryForEntry(runEntry), 'fitness');

    const gymEntry = { data: { type: 'workout', title: 'Heavy Chest & Triceps' } };
    assert.strictEqual(getCategoryForEntry(gymEntry), 'fitness');

    const fitnessEntry = { data: { type: 'fitness', title: 'Track Session' } };
    assert.strictEqual(getCategoryForEntry(fitnessEntry), 'fitness');
  });

  it('4. Sports is distinct from Games', () => {
    const cricketEntry = { data: { type: 'sport', title: 'Cricket' } };
    assert.strictEqual(getCategoryForEntry(cricketEntry), 'sports');
  });

  it('5. Baseline running records match authoritative user-confirmed numbers', () => {
    // When no detailed run entries exist yet, authoritative records are shown
    const pbs = calculateRunningPersonalBests([]);
    assert.strictEqual(pbs.fastest1k, '3:58');
    assert.strictEqual(pbs.fastest5k, '23:45');
    assert.strictEqual(pbs.fastest10k, '58:57');
    assert.strictEqual(pbs.longestRun, '15 km');
    assert.strictEqual(pbs.totalDisplay, '200+ km');
    assert.strictEqual(pbs.totalDistance, 200);
    assert.strictEqual(pbs.totalRuns, 0);
  });

  it('6. Dynamic Running engine updates automatically when a future run beats existing records', () => {
    const futureRuns = [
      {
        data: {
          type: 'run',
          distance: 5.0,
          duration: '22:30', // beats 23:45
          splits: ['4:30', '4:30', '4:30', '4:30', '4:30']
        }
      },
      {
        data: {
          type: 'run',
          distance: 1.0,
          duration: '3:45', // beats 3:58
        }
      },
      {
        data: {
          type: 'run',
          distance: 10.0,
          duration: '55:00', // beats 58:57
        }
      },
      {
        data: {
          type: 'run',
          distance: 18.5, // beats 15 km
          duration: '2:00:00',
        }
      }
    ];

    const pbs = calculateRunningPersonalBests(futureRuns);
    assert.strictEqual(pbs.fastest1k, '3:45'); // updated
    assert.strictEqual(pbs.fastest5k, '22:30'); // updated
    assert.strictEqual(pbs.fastest10k, '55:00'); // updated
    assert.strictEqual(pbs.longestRun, '18.5 km'); // updated
    assert.strictEqual(pbs.totalRuns, 4);
    assert.strictEqual(pbs.totalDistance, 234.5); // 200 + 5 + 1 + 10 + 18.5
    assert.strictEqual(pbs.totalDisplay, '234.5 km');
  });

  it('7. Gym baseline records match authoritative user-confirmed numbers (Deadlift 150kg, Bench Press 75kg)', () => {
    const records = calculateGymRecords([]);
    assert.strictEqual(records.length, 2);

    const deadlift = records.find(r => r.name.toLowerCase() === 'deadlift');
    assert(deadlift);
    assert.strictEqual(deadlift.maxWeight, 150);

    const bench = records.find(r => r.name.toLowerCase() === 'bench press');
    assert(bench);
    assert.strictEqual(bench.maxWeight, 75);
  });

  it('8. Dynamic Gym engine updates automatically when future workouts exceed baseline', () => {
    const futureWorkouts = [
      {
        id: 'gym-future-1',
        data: {
          type: 'workout',
          date: new Date('2026-11-01'),
          exercises: [
            { name: 'Deadlift', weight: 160, reps: 2 }, // beats 150 kg
            { name: 'Overhead Press', weight: 60, reps: 5 } // new exercise
          ]
        }
      }
    ];

    const records = calculateGymRecords(futureWorkouts);
    assert.strictEqual(records.length, 3);

    const deadlift = records.find(r => r.name.toLowerCase() === 'deadlift');
    assert(deadlift);
    assert.strictEqual(deadlift.maxWeight, 160);
    assert.strictEqual(deadlift.repsAtMax, 2);
    assert.strictEqual(deadlift.entryId, 'gym-future-1');

    const bench = records.find(r => r.name.toLowerCase() === 'bench press');
    assert(bench);
    assert.strictEqual(bench.maxWeight, 75); // preserved baseline

    const ohp = records.find(r => r.name.toLowerCase() === 'overhead press');
    assert(ohp);
    assert.strictEqual(ohp.maxWeight, 60);
  });

  it('9. Fitness and Interests content is PUBLIC by default for unauthenticated visitors', async () => {
    // Check helper
    assert.strictEqual(isFitnessResource({ path: '/entry/run-morning', type: 'run' }), true);
    assert.strictEqual(isFitnessResource({ path: '/entry/gym-chest', type: 'workout' }), true);
    assert.strictEqual(isFitnessResource({ path: '/entry/track-session', category: 'fitness' }), true);
    assert.strictEqual(isFitnessResource({ path: '/entry/my-book', type: 'book' }), false);

    // Unauthenticated access evaluation on fitness entry without explicit visibility -> allowed (public)
    const runAccess = await evaluateAccess({
      path: '/entry/run-morning',
      type: 'run',
      world: 'interests',
      category: 'fitness'
    }, null);
    assert.strictEqual(runAccess.allowed, true);
    assert.strictEqual(runAccess.visibility, 'public');

    const gymAccess = await evaluateAccess({
      path: '/entry/gym-chest',
      type: 'workout',
      world: 'interests',
      category: 'fitness'
    }, null);
    assert.strictEqual(gymAccess.allowed, true);
    assert.strictEqual(gymAccess.visibility, 'public');

    // Interests world entries (like books, cars, etc.) default to public
    const bookAccess = await evaluateAccess({
      path: '/entry/some-book-note',
      type: 'book',
      world: 'interests'
    }, null);
    assert.strictEqual(bookAccess.allowed, true);
    assert.strictEqual(bookAccess.visibility, 'public');

    // Non-interests entry (e.g. in life world) remains private by default
    const lifeAccess = await evaluateAccess({
      path: '/entry/some-life-memory',
      type: 'memory',
      world: 'life'
    }, null);
    assert.strictEqual(lifeAccess.allowed, false);

    // Explicit private override on fitness or interests entry is respected
    const explicitPrivateRun = await evaluateAccess({
      path: '/entry/run-secret',
      type: 'run',
      world: 'interests',
      visibility: 'private'
    }, null);
    assert.strictEqual(explicitPrivateRun.allowed, false);
  });
});
