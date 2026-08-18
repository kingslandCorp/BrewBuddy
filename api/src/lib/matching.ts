// Brew Buddies — matching engine
//
// Group size scales UP with participant count: small groups get pairs,
// large groups get tables of 3 or 4. This keeps the number of concurrent
// meeting slots manageable for big organizations while pairs stay intimate
// for small friend groups. See docs/api-design.md for the full rationale.

export interface Participant {
  id: string;
  name: string;
  email: string;
}

export interface BuiltGroup {
  participantIds: string[];
  sizeReason: 'standard' | 'odd_remainder' | 'large_group_pod';
}

/**
 * Decide the target table size for a round.
 * orgOverride lets an admin force a size (e.g. always pairs, or always
 * tables of 4 for a big all-hands event).
 */
export function determineGroupSize(participantCount: number, orgOverride?: number | null): number {
  if (orgOverride && orgOverride >= 2 && orgOverride <= 6) return orgOverride;
  if (participantCount <= 11) return 2;
  if (participantCount <= 39) return 3;
  return 4;
}

/**
 * Fisher–Yates shuffle, seeded by a simple penalty pass that pushes
 * recently-matched pairs apart before the random shuffle runs. This is a
 * pragmatic approximation of a full weighted-matching solver — enough to
 * satisfy "don't repeat the same pair within N rounds" for real-world
 * group sizes (dozens to low hundreds of people).
 */
function shuffleAvoidingRecentPairs(
  participants: Participant[],
  recentPairs: Set<string>
): Participant[] {
  const pool = [...participants];

  // Standard Fisher–Yates shuffle for the base randomness.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Local repair pass: if two adjacent people in the shuffled order have
  // met recently, try swapping one of them a short distance away.
  const pairKey = (a: string, b: string) => [a, b].sort().join('::');

  for (let i = 0; i < pool.length - 1; i++) {
    if (recentPairs.has(pairKey(pool[i].id, pool[i + 1].id))) {
      for (let j = i + 2; j < pool.length; j++) {
        if (!recentPairs.has(pairKey(pool[i].id, pool[j].id))) {
          [pool[i + 1], pool[j]] = [pool[j], pool[i + 1]];
          break;
        }
      }
    }
  }

  return pool;
}

/**
 * Build the tables for a round. Never leaves a lone person in a group of 1
 * — any remainder folds into the previous group instead.
 */
export function buildGroups(
  participants: Participant[],
  targetSize: number,
  recentPairs: Set<string> = new Set()
): BuiltGroup[] {
  if (participants.length < 2) return [];

  const shuffled = shuffleAvoidingRecentPairs(participants, recentPairs);
  const groups: BuiltGroup[] = [];

  for (let i = 0; i < shuffled.length; i += targetSize) {
    const chunk = shuffled.slice(i, i + targetSize);
    groups.push({
      participantIds: chunk.map((p) => p.id),
      sizeReason: chunk.length === targetSize ? 'standard' : 'odd_remainder',
    });
  }

  // Fold a lone leftover into the previous group rather than leaving a
  // group of 1. If the previous group is already at the 4-person cap
  // (e.g. 41 people at targetSize 4 leaves a remainder of 1), merging
  // would overflow it to 5 — borrow one member from it instead so both
  // groups land in [2,4].
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.participantIds.length === 1) {
    const prev = groups[groups.length - 2];
    if (prev.participantIds.length < 4) {
      prev.participantIds.push(...last.participantIds);
      prev.sizeReason = 'large_group_pod';
      groups.pop();
    } else {
      const borrowed = prev.participantIds.pop()!;
      last.participantIds.push(borrowed);
      last.sizeReason = 'odd_remainder';
      prev.sizeReason = 'odd_remainder';
    }
  }

  return groups;
}

/** Every unordered pair within a group, for writing to match_history. */
export function pairsWithinGroup(participantIds: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < participantIds.length; i++) {
    for (let j = i + 1; j < participantIds.length; j++) {
      pairs.push([participantIds[i], participantIds[j]]);
    }
  }
  return pairs;
}
