// src/lib/errorMessage.ts
// Surface a usable message from anything thrown. supabase-js returns
// PostgrestError-shaped plain objects (NOT Error instances), so the common
// `e instanceof Error ? e.message : fallback` pattern collapses every
// Postgres `RAISE EXCEPTION` to the generic fallback string. This helper
// also reads `.message` off plain objects so the real reason surfaces.
//
// Usage:
//   } catch (e) {
//     setErr(errorMessage(e, 'Could not assign.'))
//   }
//
// Behavior:
//   - Error instance     → e.message
//   - { message: '...' } → that message
//   - everything else    → fallback
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m.length > 0) return m
  }
  return fallback
}
