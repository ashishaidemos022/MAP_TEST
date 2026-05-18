// src/components/parent/tests/SourceMixSlider.tsx
// Custom-% slider, shown only when source_mix === 'mixed'.
export function SourceMixSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="mt-2 block text-sm">
      <span className="text-ink/70">Custom %: {value}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  )
}
