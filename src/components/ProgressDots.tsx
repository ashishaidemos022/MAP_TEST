export type DotState = 'correct' | 'wrong' | 'current' | 'pending'

export default function ProgressDots({
  states,
  active,
  onSelect,
}: {
  states: DotState[]
  active: number
  onSelect?: (i: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {states.map((state, i) => {
        const isActive = i === active
        const ring = isActive
          ? 'ring-2 ring-sky ring-offset-2 ring-offset-cream'
          : ''
        if (state === 'pending' && !isActive) {
          return (
            <span
              key={i}
              aria-hidden
              className="block h-2 w-2 rounded-full bg-cloud"
            />
          )
        }
        const tone =
          state === 'correct'
            ? 'bg-leaf text-white'
            : state === 'wrong'
              ? 'bg-berry text-white'
              : 'bg-sun text-ink'
        const sym = state === 'correct' ? '✓' : state === 'wrong' ? '✗' : ''
        const clickable = !!onSelect && state !== 'pending'
        const className = `inline-grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold leading-none transition-all ${tone} ${ring}`
        if (clickable) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect!(i)}
              aria-label={`Question ${i + 1}: ${state}`}
              className={className}
            >
              {sym}
            </button>
          )
        }
        return (
          <span key={i} aria-hidden className={className}>
            {sym}
          </span>
        )
      })}
    </div>
  )
}
