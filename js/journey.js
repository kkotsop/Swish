// The player's journey: a level that grows with practice, a weekly streak with rest weeks, and the milestones worth
// celebrating. Pure functions over the saved sessions (no DOM, no storage), so it is unit tested and never drifts out
// of sync with history. They come from the practice log (one entry per analysed video), which clearing the scores leaves alone.

/** Levels, by videos counted (at most PER_WEEK a week count, so regular practice beats one big upload). */
export const LADDER = [
  { name: 'Noobie', at: 1 }, { name: 'Rookie', at: 2 }, { name: 'Hooper', at: 4 }, { name: 'Baller', at: 7 },
  { name: 'Shooter', at: 11 }, { name: 'All-Star', at: 17 }, { name: 'Elite', at: 26 }, // Elite is about 6 months at one video a week
];
export const PER_WEEK = 3;
/** Rest weeks: one is earned for every EVERY active weeks in a row, at most MAX held; a missed week uses one automatically. */
export const REST = { EVERY: 4, MAX: 2 };

const WEEK_MS = 7 * 24 * 3600 * 1000;
/** Week number (Monday to Sunday, local time). Worked out at local noon so a daylight-saving change cannot shift it. */
export function weekIndex(ts) {
  const d = new Date(ts);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Math.round(d.getTime() / WEEK_MS);
}

export function rankFor(counted) {
  let index = -1;
  LADDER.forEach((l, i) => { if (counted >= l.at) index = i; });
  const cur = LADDER[index] || null, next = LADDER[index + 1] || null;
  const base = cur ? cur.at : 0;
  return {
    index, name: cur ? cur.name : null, next: next ? next.name : null,
    toNext: next ? next.at - counted : 0,
    frac: next ? (counted - base) / (next.at - base) : 1,
  };
}

/** sessions: [{ ts }]. Returns the level, streak, rest weeks and the last `span` weeks for the strip. */
export function journey(sessions, now = Date.now(), span = 8) {
  const counts = new Map();
  for (const s of sessions) { const w = weekIndex(s.ts); counts.set(w, (counts.get(w) || 0) + 1); }
  const cur = weekIndex(now);
  const total = sessions.length;
  let counted = 0;
  for (const c of counts.values()) counted += Math.min(PER_WEEK, c);

  const states = new Map();
  let streak = 0, best = 0, run = 0, rest = 0, restEarned = 0;
  const first = counts.size ? Math.min(...counts.keys()) : cur;
  for (let w = first; w <= cur; w++) {
    const c = counts.get(w) || 0;
    if (c > 0) {
      streak++; run++; best = Math.max(best, streak);
      if (run % REST.EVERY === 0 && rest < REST.MAX) { rest++; restEarned++; }
      states.set(w, 'active');
    } else if (w === cur) {
      states.set(w, 'current'); // this week is not over yet, so it cannot break anything
    } else if (rest > 0) {
      rest--; states.set(w, 'rest'); // the streak survives but does not grow
    } else {
      streak = 0; run = 0; states.set(w, 'missed');
    }
  }
  const weeks = [];
  for (let w = cur - span + 1; w <= cur; w++) weeks.push({ index: w, count: counts.get(w) || 0, state: states.get(w) || 'empty', current: w === cur });
  const thisWeekCount = counts.get(cur) || 0;
  // thisWeekCounted / capped / ignored let the screens say why a level has not moved: videos past PER_WEEK in a week do not count.
  return { total, counted, ignored: total - counted, rank: rankFor(counted), streak, best, restHeld: rest, restEarned, weeks, thisWeekCount, thisWeekCounted: Math.min(PER_WEEK, thisWeekCount), capped: thisWeekCount >= PER_WEEK };
}

/**
 * What changed when a session was added. Big moments (first, fifth, rankUp) get a full-screen celebration; the
 * medium ones (weekInRow, restEarned) a line on the last report page.
 */
export function milestones(before, after) {
  const ev = {};
  if (before.total === 0 && after.total >= 1) ev.first = true;
  if (before.total < 5 && after.total >= 5) ev.fifth = true;
  if (after.rank.index > before.rank.index) ev.rankUp = { from: before.rank.name, to: after.rank.name };
  if (before.thisWeekCount === 0 && after.thisWeekCount > 0 && after.streak >= 2) ev.weekInRow = { n: after.streak };
  if (after.restEarned > before.restEarned) ev.restEarned = true;
  ev.big = !!(ev.first || ev.fifth || ev.rankUp);
  return ev;
}
