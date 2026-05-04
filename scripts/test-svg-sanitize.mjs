// Standalone test runner for the SVG sanitizer.
// Run: npx tsx scripts/test-svg-sanitize.mjs
//
// Validates the §12.10a corpus from Custom_Questions_Brief.md plus
// the §12.10c canonicalization round-trip.

import {
  sanitizeSvg,
  SvgRejected,
  SVG_CAP_PASSAGE,
  SVG_CAP_CHOICE,
} from '../api/_lib/svg/sanitize.ts'

let pass = 0
let fail = 0
const failures = []

function expectReject(input, expectedReason, name, cap = SVG_CAP_PASSAGE) {
  try {
    sanitizeSvg(input, cap)
    fail++
    failures.push(`  ✗ ${name}: expected rejection (${expectedReason}), but accepted`)
  } catch (e) {
    if (e instanceof SvgRejected && e.reason === expectedReason) {
      pass++
    } else if (e instanceof SvgRejected) {
      fail++
      failures.push(`  ✗ ${name}: expected ${expectedReason}, got ${e.reason} (${e.detail ?? ''})`)
    } else {
      fail++
      failures.push(`  ✗ ${name}: expected ${expectedReason}, got non-SvgRejected: ${e?.message ?? e}`)
    }
  }
}

function expectAccept(input, name, cap = SVG_CAP_PASSAGE) {
  try {
    const result = sanitizeSvg(input, cap)
    if (result instanceof Buffer && result.byteLength > 0) {
      pass++
      return result
    }
    fail++
    failures.push(`  ✗ ${name}: returned empty/invalid Buffer`)
    return null
  } catch (e) {
    fail++
    failures.push(`  ✗ ${name}: expected accept, got rejection: ${e?.reason ?? e?.message ?? e}`)
    return null
  }
}

// === §12.10a corpus — each must reject with the specified reason ===

expectReject(
  '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
  'disallowed_element',
  '12.10a: <script> rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10"><foreignObject><iframe src="x"/></foreignObject></svg>',
  'disallowed_element',
  '12.10a: <foreignObject> rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10" onload="alert(1)"><circle cx="5" cy="5" r="4"/></svg>',
  'disallowed_attribute',
  '12.10a: onload= rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10"><image href="https://evil.example.com/track.png"/></svg>',
  'disallowed_element',
  '12.10a: <image> rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10"><use href="https://evil.example.com/x.svg#foo"/></svg>',
  'external_reference',
  '12.10a: <use> with external href rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10"><a href="https://evil.example.com/"><circle cx="5" cy="5" r="4"/></a></svg>',
  'disallowed_element',
  '12.10a: <a> hyperlink rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10" style="background: url(javascript:alert(1))"/>',
  'disallowed_attribute',
  '12.10a: style= attribute on root rejected',
)

// 1500 path elements
const manyPaths =
  '<svg viewBox="0 0 10 10">' +
  '<path d="M0 0L1 1"/>'.repeat(1500) +
  '</svg>'
expectReject(manyPaths, 'node_count_exceeded', '12.10a: 1500 paths rejected')

// 30 levels of <g> nesting
let nested = '<svg viewBox="0 0 10 10">'
for (let i = 0; i < 30; i++) nested += '<g>'
nested += '<circle cx="5" cy="5" r="1"/>'
for (let i = 0; i < 30; i++) nested += '</g>'
nested += '</svg>'
expectReject(nested, 'depth_exceeded', '12.10a: 30-deep <g> nesting rejected')

expectReject(
  '<svg><circle cx="5" cy="5" r="4"/></svg>',
  'missing_viewbox',
  '12.10a: missing viewBox rejected',
)

// 200KB SVG (well-formed shape, oversize)
const fat = '<svg viewBox="0 0 10 10"><desc>' + 'a'.repeat(210000) + '</desc></svg>'
expectReject(fat, 'size_exceeded', '12.10a: 200KB SVG rejected')

// === Additional rejections beyond the corpus that the brief implies ===

expectReject(
  '<svg viewBox="0 0 10 10"><animate attributeName="r" from="1" to="10"/></svg>',
  'disallowed_element',
  'animate element rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10"><text fill="javascript:alert(1)">x</text></svg>',
  'disallowed_attribute',
  'js: scheme in fill rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10"><text font-family="Comic Sans">x</text></svg>',
  'disallowed_attribute',
  'non-allowlisted font-family rejected',
)

expectReject(
  '<!DOCTYPE svg><svg viewBox="0 0 10 10"></svg>',
  'script_content',
  'DOCTYPE rejected',
)

expectReject(
  '<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 10 10"></svg>',
  'disallowed_attribute',
  'wrong xmlns rejected',
)

expectReject(
  '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" onclick="x()"/></svg>',
  'disallowed_attribute',
  'onclick= rejected',
)

expectReject(
  '<svg viewBox="0 0 -1 10"><circle cx="5" cy="5" r="4"/></svg>',
  'invalid_viewbox',
  'negative viewBox value rejected',
)

expectReject(
  '<svg viewBox="0 0 99999 99999"><circle cx="5" cy="5" r="4"/></svg>',
  'invalid_viewbox',
  'oversize viewBox values rejected',
)

// === Acceptance cases ===

const validBlue = expectAccept(
  '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#3366cc"/></svg>',
  '12.10a: valid blue circle accepted',
)

expectAccept(
  '<svg viewBox="0 0 200 100"><line x1="10" y1="50" x2="190" y2="50" stroke="#222"/><polygon points="190,50 180,46 180,54" fill="#222"/></svg>',
  'two-ray angle SVG accepted',
)

expectAccept(
  '<svg viewBox="0 0 240 135"><path d="M 30 110 A 90 90 0 0 1 210 110" fill="#d9f0f5" stroke="#1c6378"/><text x="22" y="125" font-family="sans-serif" font-size="9" fill="#1c6378">0</text></svg>',
  'protractor SVG accepted',
)

// Marker pattern (valid same-document fragment)
expectAccept(
  '<svg viewBox="0 0 100 100"><defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#222"/></marker></defs><line x1="10" y1="50" x2="90" y2="50" stroke="#222" marker-end="url(#arrow)"/></svg>',
  'marker with same-document fragment ref accepted',
)

// === §12.10c canonicalization round-trip ===

if (validBlue) {
  const round1 = sanitizeSvg(validBlue.toString('utf8'), SVG_CAP_PASSAGE)
  const round2 = sanitizeSvg(round1.toString('utf8'), SVG_CAP_PASSAGE)
  if (round1.toString('utf8') === round2.toString('utf8')) {
    pass++
  } else {
    fail++
    failures.push('  ✗ 12.10c: sanitization is not idempotent on already-sanitized input')
    failures.push(`      round1: ${round1.toString('utf8').slice(0, 100)}`)
    failures.push(`      round2: ${round2.toString('utf8').slice(0, 100)}`)
  }
}

// Choice cap is smaller than passage cap
expectReject(
  '<svg viewBox="0 0 10 10"><desc>' + 'x'.repeat(33000) + '</desc></svg>',
  'size_exceeded',
  '32KB+ rejected against choice cap',
  SVG_CAP_CHOICE,
)

// === Report ===

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(f)
  process.exit(1)
}
process.exit(0)
