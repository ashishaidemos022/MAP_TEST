// Custom_Questions_Brief.md §12.10b — parent-authored SVGs render via
// `<img src="data:image/svg+xml;base64,..." alt>` rather than inline DOM
// injection. Browsers in image mode disable scripting, external resource
// loading, and DOM access. Defense-in-depth on top of write-time sanitization.
//
// NEVER replace this with dangerouslySetInnerHTML for parent-authored content
// — that's the SvgFigure path, which is reserved for vetted-bank questions
// authored through our trusted pipeline.

interface SvgImageProps {
  /** Either base64-encoded SVG bytes (most common from Supabase bytea fields)
   * or a `\xHEX` Postgres bytea string. We accept both because the JS client
   * passes bytea as `\xHEX` and the MCP layer encodes/decodes via base64. */
  svg: string
  altText: string
  className?: string
  /** Optional max-width override. Defaults to full container width. */
  maxWidth?: string | number
}

function toBase64DataUrl(svg: string): string | null {
  if (!svg) return null
  // Already a base64 string?
  if (/^[A-Za-z0-9+/=]+$/.test(svg)) {
    return `data:image/svg+xml;base64,${svg}`
  }
  // Postgres bytea hex literal?
  if (svg.startsWith('\\x')) {
    const hex = svg.slice(2)
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
    }
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return `data:image/svg+xml;base64,${btoa(bin)}`
  }
  // Raw SVG XML? Encode it.
  try {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  } catch {
    return null
  }
}

export default function SvgImage({ svg, altText, className, maxWidth }: SvgImageProps) {
  const dataUrl = toBase64DataUrl(svg)
  if (!dataUrl) {
    // Render the alt text as a fallback panel so the kid still sees something
    // descriptive rather than a broken image.
    return (
      <div
        className={`overflow-hidden rounded-2xl bg-cream p-4 text-sm italic text-ink/60 ring-1 ring-cloud ${className ?? ''}`}
      >
        [figure: {altText}]
      </div>
    )
  }
  return (
    <img
      src={dataUrl}
      alt={altText}
      className={`block max-w-full rounded-2xl bg-cream p-2 ring-1 ring-cloud ${className ?? ''}`}
      style={maxWidth ? { maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth } : undefined}
      // Browsers render SVG in <img> with scripts/external-fetch/DOM disabled.
    />
  )
}
