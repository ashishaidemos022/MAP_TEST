# Adaptive Picker — Stretch Cap → Frustration Guard

**Status:** Design approved 2026-05-03 (decision: option C with last-3-wrong trigger).

## Problem

The math/language adaptive picker enforces a *count-based* stretch cap: at most 20% of a session's questions (5 of 25, 8 of 40) may be drawn from above the student's `start_band`. Once that quota is exhausted, every subsequent target band — even one that `decideBand` would legitimately set to `start_band + 1` or `+ 2` — is clamped back to `start_band` for the rest of the test.

Real diagnostic from session `616356bf` (language, 22/25 correct, start `181_190`):

```
Picks  6-7  → 191_200  (kid keeps acing → step up)
Picks  8-10 → 201_210  (ceiling reached, all correct)
Picks 11-25 → 181_190  (stretch quota exhausted; engine forced back to start
                        for 15 picks even though kid kept getting them right)
```

The kid was crushing the ceiling band and got pushed back to start_band for the bulk of the test. The ceiling clamp (`start_band + 2`) was already doing its job; the count-based cap was redundant for failing kids and harmful for high performers.

## Goal

Allow high performers to stay at `ceil_band` for as long as their performance justifies it, while still protecting struggling kids from a session full of too-hard questions.

## Design — Frustration Guard

Replace the count-based stretch cap with a *performance-based* guard:

> If the student's last 3 above-`start_band` picks (with answers recorded) were *all wrong*, force the next target band back to `start_band`. Otherwise, let `decideBand` and the `ceil_band` clamp do their job.

This protects against the specific failure mode the cap was designed for — the engine pushing a kid further into stretch despite repeated wrong answers — without artificially limiting kids who keep getting stretch picks right.

### Scope

- **In scope:** `src/lib/adaptive/picker.ts` (math + language).
- **Out of scope:** `src/lib/adaptive/passagePicker.ts` (reading). Reading already uses a different cap mechanism — "≤ 1 stretch passage per session" — and has its own bug (sessions never adapt up at all) that needs separate investigation. Don't conflate.

### Algorithm change

The current logic in `picker.ts:348-382`:

```ts
const stretchCap = Math.round(planned * STRETCH_FRACTION)         // = 5 of 25
const stretchUsed = selectedDetails.filter(q => bandIndex(q.rit_band) > startIdx).length
const stretchRemaining = Math.max(0, stretchCap - stretchUsed)

// ... decideBand runs ...

if (bandIndex(targetBand) > startIdx && stretchRemaining <= 0) {
  targetBand = startBand   // ← The harmful clamp
}
```

Replaced by:

```ts
// Frustration guard: if the last 3 above-start picks were all wrong, the
// engine is pushing past the kid's actual ability. Force back to start_band
// to give them a chance to recover. If they recover, decideBand will
// naturally try to step back up — and the guard will re-evaluate.
if (bandIndex(targetBand) > startIdx && isFrustrated(selectedDetails, attempts, startIdx)) {
  targetBand = startBand
}
```

`isFrustrated` is a pure helper in `bands.ts`:

```ts
export const FRUSTRATION_WINDOW = 3

export function isFrustrated(
  picks: Array<{ id: string; rit_band: RitBand }>,   // picks already in session, in order
  attemptByQid: Map<string, boolean>,                 // qid → is_correct
  startIdx: number,
): boolean {
  const recentAboveStart: boolean[] = []
  for (let i = picks.length - 1; i >= 0 && recentAboveStart.length < FRUSTRATION_WINDOW; i--) {
    if (bandIndex(picks[i].rit_band) <= startIdx) continue
    const ans = attemptByQid.get(picks[i].id)
    if (ans === undefined) continue   // pick exists but no answer recorded yet
    recentAboveStart.push(ans)
  }
  if (recentAboveStart.length < FRUSTRATION_WINDOW) return false
  return recentAboveStart.every(a => a === false)
}
```

Key properties:
- Works on the **most recent** 3 above-start picks regardless of where they sit in the test (handles non-contiguous stretch).
- Returns `false` if fewer than 3 above-start picks have answers recorded — i.e., the engine never trips the guard during early stretch.
- Pure function. No DB. Trivially testable.

### What stays the same

- **`ceil_band` clamp** (`start_band + 2`) — still the absolute upper bound. A kid starting at `181_190` still tops out at `201_210` no matter what the guard says.
- **`floor_band` clamp** (`start_band - 2`) — unchanged.
- **`decideBand` step rules** (≥80% step up, ≤40% step down) — unchanged.
- **Warmup of 3 questions at `start_band`** — unchanged.
- **Three-tier candidate fallback** (standards_relaxed → band_step_back → wider_net) — unchanged.
- **Growth standards cap** (≤25% target / ≤40% hard cap) — unchanged. This is a different concept; the spec doesn't touch it.

### Removed
- `STRETCH_FRACTION` constant (`0.20`).
- `stretchCap`, `stretchUsed`, `stretchRemaining` locals.

### Reading (unchanged)
The reading passage picker enforces "≤ 1 stretch passage per session" — a much more conservative cap because passages bring 4-8 questions at once. That cap is fine in concept; the reading bug is that adaptation isn't happening at all (separate issue, separate fix).

## Measurement

After deploy, validate with two layers:

1. **Existing acceptance gate:** `scripts/test-adaptive-simulator.mjs 100` must still pass §6.1-§6.11. The only assertion that should change is whatever currently checks the 20% cap — replace with an assertion that "if last-3-above-start were all wrong, next pick was at start_band" (and otherwise stretch is allowed to continue indefinitely).

2. **New analytical script:** `scripts/measure-stretch-behavior.mjs` reports for the most recent N completed adaptive sessions:
   - Distribution of bands across all picks (% at start, start+1, start+2)
   - Max band reached
   - Time spent at ceil_band (consecutive picks)
   - Whether frustration guard triggered (and at which pick)
   - Final accuracy

   Run before and after the change to see the shift in band trajectories. Success looks like: high-accuracy sessions show more picks at ceil_band, more time at higher bands, fewer "snap back to start_band after pick 10" patterns.

## Future / out-of-scope

- **Cross-grade overflow (option A from the brainstorm).** If the bank for the kid's grade has gaps at ceil_band, the wider_net fallback returns 0 candidates and the picker errors. Cross-grade pulls would solve this — but only worth doing once we confirm the frustration guard alone solved the "kid stuck below ceiling" problem. Decide after measurement.
- **Reading passage picker bug.** A separate session showed 25/25 correct stuck at start_band the entire time — passage picker isn't adapting up. Needs independent investigation.
- **Pre-pick lag of 3.** The picker fires when an answer is recorded, but the next 2-3 questions are already in `question_ids` from earlier picks, so its window lags 3 questions behind the user's current position. Mathematically OK (uses most recent recorded answers), but the kid sees band-change reactions 3 questions late. Worth a UX audit, not in scope here.
