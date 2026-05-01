export default function SvgFigure({ svg, className }: { svg: string; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-cream p-4 ring-1 ring-cloud ${className ?? ''}`}
      // SVG markup is authored by trusted question generation pipeline (CLAUDE.md §4),
      // never user input — kept raw for accurate rendering of inline figures.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
