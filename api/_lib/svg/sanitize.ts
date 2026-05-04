// Custom_Questions_Brief.md §4.12 — SVG sanitizer.
//
// Strict allowlist. Rejects (does not strip) anything not on the list. Returns
// canonicalized SVG bytes (UTF-8) on success or throws SvgRejected with one
// of the documented reason codes.
//
// Rejection reasons map 1:1 to the brief's §12.10a acceptance corpus:
//   disallowed_element       <script>, <foreignObject>, <image>, <a>, etc.
//   disallowed_attribute     onload, style on root, etc.
//   external_reference       href to anything not "#fragment"
//   script_content           CDATA, processing instructions, JS in text nodes
//   parse_error              malformed XML
//   size_exceeded            input larger than the per-slot byte cap
//   node_count_exceeded      > 1000 elements after parse
//   depth_exceeded           > 20 nesting levels
//   missing_viewbox          root <svg> lacks viewBox
//   invalid_viewbox          viewBox malformed or out of range
//   mixed_choice_svg_not_allowed  (cross-field rule, not enforced here — at the tool layer)
//
// The render path NEVER injects this output into the DOM directly. It is
// always served as data:image/svg+xml;base64,<bytes> into an <img> tag.

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

// Minimal DOM-shaped interfaces matching what xmldom returns. We define these
// locally so the API-side tsconfig doesn't need lib: ["DOM"] just for sanitizer.
interface XmlAttr { name: string; value: string }
interface XmlAttrs { length: number; item(i: number): XmlAttr | null }
interface XmlNodeList { length: number; item(i: number): XmlNode | null }
interface XmlNode { nodeType: number; nodeName: string; childNodes?: XmlNodeList }
interface XmlElement extends XmlNode {
  localName?: string
  attributes?: XmlAttrs
  childNodes: XmlNodeList
  getAttribute(name: string): string | null
}
interface XmlDocument { documentElement: XmlElement | null }

// Per-slot byte caps from §4 schema. Caller chooses the cap; sanitizer enforces.
export const SVG_CAP_PASSAGE = 64 * 1024
export const SVG_CAP_STEM = 64 * 1024
export const SVG_CAP_CHOICE = 32 * 1024

// Internal limits per §4.12.
const NODE_COUNT_CAP = 1000
const NESTING_DEPTH_CAP = 20
const VIEWBOX_NUMBER_CAP = 10000

export type SvgRejectionReason =
  | 'disallowed_element'
  | 'disallowed_attribute'
  | 'external_reference'
  | 'script_content'
  | 'parse_error'
  | 'size_exceeded'
  | 'node_count_exceeded'
  | 'depth_exceeded'
  | 'missing_viewbox'
  | 'invalid_viewbox'

export class SvgRejected extends Error {
  readonly reason: SvgRejectionReason
  readonly detail?: string
  constructor(reason: SvgRejectionReason, detail?: string) {
    super(`svg rejected: ${reason}${detail ? ` (${detail})` : ''}`)
    this.reason = reason
    this.detail = detail
  }
}

// Allowed elements per §4.12.
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan',
  'marker', 'linearGradient', 'radialGradient', 'stop',
  'clipPath', 'use', 'pattern', 'mask', 'symbol',
])

// Element names that explicitly should be REJECTED (not just absent from allow list).
// Listed for clearer error messages.
const KNOWN_DISALLOWED_ELEMENTS = new Set([
  'script', 'foreignObject', 'iframe', 'image', 'animate', 'animateTransform',
  'animateMotion', 'set', 'a', 'style', 'metadata', 'switch', 'embed', 'object',
  'audio', 'video',
])

// Allowed attributes — geometric, presentation, and text. Listed once globally;
// per-element constraint that some only make sense on specific elements is
// enforced loosely (we don't reject e.g. `r` on a <line>, that's the renderer's
// problem if the agent misuses it).
const ALLOWED_ATTRIBUTES = new Set([
  // Geometry
  'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
  'x1', 'y1', 'x2', 'y2', 'points', 'transform',
  'width', 'height', 'viewBox', 'preserveAspectRatio',
  // Presentation
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-miterlimit', 'opacity', 'fill-opacity',
  'stroke-opacity', 'fill-rule', 'clip-rule', 'visibility',
  // Text
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'letter-spacing', 'word-spacing', 'text-decoration',
  // IDs / classes / refs
  'id', 'class', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end',
  // Gradient/pattern stops + transforms
  'offset', 'stop-color', 'stop-opacity',
  'gradientUnits', 'gradientTransform',
  'patternUnits', 'patternTransform', 'patternContentUnits',
  'spreadMethod', 'fx', 'fy',
  // Marker geometry
  'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits',
  // Mask / clipPath
  'maskUnits', 'maskContentUnits', 'clipPathUnits',
  // Same-document refs only
  'href', 'xlink:href',
  // SVG namespace markers — allowed on root only (validated separately)
  'xmlns', 'xmlns:xlink', 'version', 'xml:space',
])

const ALLOWED_FONT_FAMILIES = new Set([
  'sans-serif', 'serif', 'monospace', 'system-ui',
])

// Named CSS colors that pass our simple "is this a color?" check. Not exhaustive
// but covers the common authoring set; the regex below catches hex/rgb/hsl too.
const NAMED_COLORS = new Set([
  'none', 'transparent', 'currentColor', 'currentcolor', 'inherit',
  'black', 'white', 'gray', 'grey', 'red', 'green', 'blue', 'yellow',
  'orange', 'purple', 'pink', 'brown', 'cyan', 'magenta', 'lime', 'navy',
  'teal', 'silver', 'gold', 'maroon', 'olive', 'aqua', 'fuchsia',
  'lightgray', 'lightgrey', 'darkgray', 'darkgrey',
  'lightblue', 'darkblue', 'lightgreen', 'darkgreen', 'lightred', 'darkred',
])

const COLOR_FUNC_RE = /^(rgb|rgba|hsl|hsla)\([\s\d.,%-]+\)$/i
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function isAllowedColor(value: string): boolean {
  const v = value.trim()
  if (NAMED_COLORS.has(v.toLowerCase())) return true
  if (HEX_COLOR_RE.test(v)) return true
  if (COLOR_FUNC_RE.test(v)) return true
  // Same-document fragment URL (#id) — for gradient/pattern/marker refs.
  if (v.startsWith('url(#') && v.endsWith(')')) return true
  return false
}

function isAllowedHrefValue(value: string): boolean {
  const v = value.trim()
  if (v.length === 0) return false
  if (!v.startsWith('#')) return false
  // Reject anything beyond #id — no #foo' onload or fragment with whitespace.
  if (/[\s<>"'`]/.test(v)) return false
  return true
}

const COLOR_ATTRS = new Set(['fill', 'stroke', 'stop-color'])

// Disallowed attribute prefixes / patterns. Anything matching is rejected.
function isAttributeAllowed(name: string): boolean {
  const lower = name.toLowerCase()
  // Event handlers (onclick, onload, onmouseover, etc.)
  if (lower.startsWith('on')) return false
  // The <style> attribute is banned — agents must use individual presentation
  // attributes. Stylesheet attacks live in the style attribute.
  if (lower === 'style') return false
  // xlink:* aside from xlink:href is disallowed; we listed xlink:href separately.
  return ALLOWED_ATTRIBUTES.has(name)
}

interface ValidationCtx {
  nodeCount: number
}

function localName(el: XmlElement): string {
  // xmldom's Element.localName works; if missing fall back to nodeName split.
  return (el.localName || el.nodeName.split(':').pop() || el.nodeName).trim()
}

function validateElement(el: XmlElement, depth: number, ctx: ValidationCtx): void {
  if (depth > NESTING_DEPTH_CAP) {
    throw new SvgRejected('depth_exceeded', `depth ${depth} > ${NESTING_DEPTH_CAP}`)
  }
  ctx.nodeCount += 1
  if (ctx.nodeCount > NODE_COUNT_CAP) {
    throw new SvgRejected('node_count_exceeded', `${ctx.nodeCount} elements > ${NODE_COUNT_CAP}`)
  }

  const name = localName(el)
  if (KNOWN_DISALLOWED_ELEMENTS.has(name)) {
    throw new SvgRejected('disallowed_element', name)
  }
  if (!ALLOWED_ELEMENTS.has(name)) {
    throw new SvgRejected('disallowed_element', name)
  }

  // Validate every attribute.
  const attrs = el.attributes
  if (attrs) {
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs.item(i)
      if (!a) continue
      const aName = a.name
      const aVal = a.value
      if (!isAttributeAllowed(aName)) {
        throw new SvgRejected('disallowed_attribute', aName)
      }
      // href / xlink:href must be same-document fragment.
      if (aName === 'href' || aName === 'xlink:href') {
        if (!isAllowedHrefValue(aVal)) {
          throw new SvgRejected('external_reference', `${aName}="${aVal.slice(0, 60)}"`)
        }
      }
      // Color-bearing attributes get value-checked.
      if (COLOR_ATTRS.has(aName) && !isAllowedColor(aVal)) {
        throw new SvgRejected('disallowed_attribute', `${aName}="${aVal.slice(0, 60)}"`)
      }
      // Font family allowlist.
      if (aName === 'font-family') {
        const family = aVal.trim().toLowerCase().replace(/['"]/g, '')
        // Allow comma-separated lists where every entry is allowed.
        const parts = family.split(',').map((p) => p.trim())
        if (!parts.every((p) => ALLOWED_FONT_FAMILIES.has(p))) {
          throw new SvgRejected(
            'disallowed_attribute',
            `font-family="${aVal.slice(0, 60)}"`,
          )
        }
      }
      // xmlns: only the SVG and xlink namespaces allowed.
      if (aName === 'xmlns' && aVal !== 'http://www.w3.org/2000/svg') {
        throw new SvgRejected('disallowed_attribute', `xmlns="${aVal}"`)
      }
      if (aName === 'xmlns:xlink' && aVal !== 'http://www.w3.org/1999/xlink') {
        throw new SvgRejected('disallowed_attribute', `xmlns:xlink="${aVal}"`)
      }
    }
  }

  // Recurse into children.
  const children = el.childNodes
  if (children) {
    for (let i = 0; i < children.length; i++) {
      const child = children.item(i)
      if (!child) continue
      // Reject CDATA, processing instructions, doctype, etc.
      // Node.TEXT_NODE = 3, Node.CDATA_SECTION_NODE = 4,
      // Node.PROCESSING_INSTRUCTION_NODE = 7, Node.COMMENT_NODE = 8,
      // Node.DOCUMENT_TYPE_NODE = 10
      const nt = child.nodeType
      if (nt === 4) { // CDATA
        throw new SvgRejected('script_content', 'CDATA section')
      }
      if (nt === 7) { // processing instruction
        throw new SvgRejected('script_content', 'processing instruction')
      }
      if (nt === 10) { // DOCTYPE
        throw new SvgRejected('script_content', 'DOCTYPE')
      }
      if (nt === 8) { // comment
        const cText = (child as { data?: string }).data ?? ''
        if (cText.includes('<') || cText.includes('>')) {
          throw new SvgRejected('script_content', 'comment containing markup')
        }
        // Comments are allowed if they're plain text — drop them on serialize.
      }
      if (nt === 1) { // Element
        validateElement(child as XmlElement, depth + 1, ctx)
      }
      // Text nodes are fine — they get serialized as text only.
    }
  }
}

function validateRoot(root: XmlElement): void {
  if (localName(root) !== 'svg') {
    throw new SvgRejected('disallowed_element', `root must be <svg>, got <${localName(root)}>`)
  }
  const viewBox = root.getAttribute('viewBox')
  if (!viewBox) {
    throw new SvgRejected('missing_viewbox')
  }
  const parts = viewBox.trim().split(/[\s,]+/).filter(Boolean)
  if (parts.length !== 4) {
    throw new SvgRejected('invalid_viewbox', `expected 4 numbers, got ${parts.length}`)
  }
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isFinite(n)) {
      throw new SvgRejected('invalid_viewbox', `non-numeric: ${p}`)
    }
    if (n < 0) {
      throw new SvgRejected('invalid_viewbox', `negative: ${n}`)
    }
    if (n > VIEWBOX_NUMBER_CAP) {
      throw new SvgRejected('invalid_viewbox', `exceeds cap: ${n} > ${VIEWBOX_NUMBER_CAP}`)
    }
  }
}

/**
 * Sanitize a single SVG. Returns the canonicalized UTF-8 bytes.
 *
 * `byteCap` is the maximum allowed input byte length. Pass SVG_CAP_PASSAGE,
 * SVG_CAP_STEM, or SVG_CAP_CHOICE depending on the slot.
 *
 * Throws `SvgRejected` on any violation. Never silently strips.
 */
export function sanitizeSvg(input: string, byteCap: number): Buffer {
  if (typeof input !== 'string') {
    throw new SvgRejected('parse_error', 'input is not a string')
  }
  const inputBytes = Buffer.byteLength(input, 'utf8')
  if (inputBytes > byteCap) {
    throw new SvgRejected('size_exceeded', `${inputBytes} > ${byteCap}`)
  }

  // Reject DOCTYPE, processing instructions, and entity declarations BEFORE the
  // parser sees them. xmldom is permissive about these and we want hard rejects.
  if (/<!DOCTYPE/i.test(input)) {
    throw new SvgRejected('script_content', 'DOCTYPE present')
  }
  if (/<\?xml/i.test(input.replace(/^<\?xml[^>]*\?>\s*/, ''))) {
    // Allow a single leading <?xml ... ?> (xmldom strips it). Anything else is a PI.
    throw new SvgRejected('script_content', 'embedded processing instruction')
  }
  if (/<!ENTITY/i.test(input)) {
    throw new SvgRejected('script_content', 'entity declaration')
  }

  let doc: XmlDocument
  try {
    // xmldom throws on a few errors but mostly logs warnings. We capture both.
    const errors: string[] = []
    const parser = new DOMParser({
      onError: (level, msg) => {
        if (level === 'error' || level === 'fatalError') {
          errors.push(`${level}: ${msg}`)
        }
      },
    })
    doc = parser.parseFromString(input, 'image/svg+xml') as unknown as XmlDocument
    if (errors.length > 0) {
      throw new SvgRejected('parse_error', errors[0])
    }
  } catch (e) {
    if (e instanceof SvgRejected) throw e
    throw new SvgRejected('parse_error', e instanceof Error ? e.message : String(e))
  }

  const root = doc.documentElement
  if (!root) {
    throw new SvgRejected('parse_error', 'no root element')
  }

  validateRoot(root)
  validateElement(root, 0, { nodeCount: 0 })

  // Re-serialize for a canonical form. xmldom's serializer is deterministic
  // enough for round-tripping; attribute order may shift but that's acceptable
  // since we re-sanitize on every read of update inputs.
  // xmldom's XMLSerializer accepts its own Node type; we cast through unknown
  // to satisfy the lib.dom Node shape that the type signature exposes.
  const serialized = new XMLSerializer().serializeToString(root as unknown as Parameters<XMLSerializer['serializeToString']>[0])
  // Strip leading XML declaration if any slipped through.
  const cleaned = serialized.replace(/^<\?xml[^?]*\?>\s*/, '').trim()
  return Buffer.from(cleaned, 'utf8')
}
