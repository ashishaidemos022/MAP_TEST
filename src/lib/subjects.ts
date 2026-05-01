import type { Subject } from './types'

// Single source of truth for subject labels and emojis. Used by Home,
// ParentSettings, History, the Custom Tests builder, and any future surface.
export const SUBJECTS: { key: Subject; label: string; emoji: string }[] = [
  { key: 'math', label: 'Math', emoji: '➕' },
  { key: 'reading', label: 'Reading', emoji: '📖' },
  { key: 'language', label: 'Language', emoji: '✏️' },
]

export function subjectMeta(s: Subject): { label: string; emoji: string } {
  const m = SUBJECTS.find((x) => x.key === s)
  return m ? { label: m.label, emoji: m.emoji } : { label: s, emoji: '•' }
}
