import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCandidate, buildNotice, estTokens } from '../src/compress.js'

var cfg = {
  keepRatioMax: 0.72, minSavingBytes: 500,
  maxLines: 240, headLines: 140, tailLines: 80,
  tabularHeadRows: 60, tabularTailRows: 40, tabularStrideSamples: 50,
  longLineChars: 420, jsonMaxParseBytes: 524288, jsonlMinLines: 8
}

// the replay scanner lives in src/index.js and matches "[save-token #<id> "
var MARKER_RE = /\[save-token #([a-z0-9]+) /g

function flatRows(n) {
  var arr = []
  for (var i = 0; i < n; i++) arr.push({ model: 'm' + i, input: i, output: i * 2 })
  return arr
}

test('buildCandidate: TOON route passes the double gates', () => {
  var text = JSON.stringify({ prices: flatRows(400) })
  var c = buildCandidate(text, cfg)
  assert.ok(c !== null)
  assert.equal(c.lossless, true)
  assert.equal(c.strategy, 'toon-array')
  assert.ok(c.after <= c.before * cfg.keepRatioMax)
  assert.ok(c.before - c.after >= cfg.minSavingBytes)
  assert.ok(c.text.length >= 20)
})

test('buildCandidate: keepRatio gate rejects a weak candidate', () => {
  // highly repetitive -> collapses to almost nothing, but force a strict ratio
  var text = []
  for (var i = 0; i < 400; i++) text.push('same line here ' + (i % 3))
  var strictCfg = Object.assign({}, cfg, { keepRatioMax: 0.05 })
  assert.equal(buildCandidate(text.join('\n'), strictCfg), null)
  // same text passes with the default ratio
  assert.ok(buildCandidate(text.join('\n'), cfg) !== null)
})

test('buildCandidate: gate-fallback — wasteful TOON rejected, lossy elision adopted before lines', () => {
  // 100 rows x 1200-char blobs: the lossless TOON table keeps every blob and
  // is only ~1.4% smaller than the original JSON — the keepRatio gate rightly
  // rejects it (exactly the "wasteful encoding" trap). The elision route then
  // passes and must be adopted BEFORE the dumb line compressor.
  var big = 'z'.repeat(1200)
  var rows = []
  for (var i = 0; i < 100; i++) rows.push({ id: i, blob: big })
  var text = JSON.stringify({ rows: rows })
  var tightCfg = Object.assign({}, cfg, { keepRatioMax: 0.35 })
  var c = buildCandidate(text, tightCfg)
  assert.ok(c !== null)
  assert.equal(c.strategy, 'elision')
  assert.equal(c.lossless, false)
  assert.ok(c.stats.omittedItems > 0)
  // same outcome under the default gates: toon fails 0.72, elision passes
  var def = buildCandidate(text, cfg)
  assert.ok(def !== null)
  assert.equal(def.strategy, 'elision')
})

test('buildCandidate: absolute saving gate rejects small wins', () => {
  var text = JSON.stringify({ prices: flatRows(20) })
  var c = buildCandidate(text, cfg)
  if (c === null) return // doc below gates entirely; nothing to tighten
  var strictCfg = Object.assign({}, cfg, { minSavingBytes: c.before - c.after + 1 })
  assert.equal(buildCandidate(text, strictCfg), null)
})

test('buildCandidate: token gate — an adopted candidate strictly lowers estimated tokens', () => {
  var texts = [
    JSON.stringify({ prices: flatRows(300) }),
    (function () { var l = []; for (var i = 0; i < 500; i++) l.push('log line ' + i + ' with some words'); return l.join('\n') })()
  ]
  for (var i = 0; i < texts.length; i++) {
    var c = buildCandidate(texts[i], cfg)
    if (c === null) continue
    assert.ok(estTokens(c.text) < estTokens(texts[i]), 'candidate must strictly reduce estTokens')
  }
})

test('buildNotice: verbose form keeps both recovery channels (golden)', () => {
  var n = buildNotice({
    body: 'BODY', id: 'c1or', before: 12345, after: 3456,
    lossless: true, stats: undefined, locator: '/spill/x.txt',
    retrievalHint: 'Use read with offset/limit.', verbose: true
  })
  assert.ok(n.startsWith('BODY\n\n[save-token #c1or losslessly re-encoded: 12,345 -> 3,456 bytes (~72% smaller), zero information loss.'))
  assert.ok(n.includes('save_token_expand tool with id "c1or"'))
  assert.ok(n.includes('/spill/x.txt'))
  assert.ok(n.includes('Use read with offset/limit.'))
  MARKER_RE.lastIndex = 0
  assert.ok(MARKER_RE.test(n))
})

test('buildNotice: lossy verbose form discloses the elided shape (shape annotation)', () => {
  var n = buildNotice({
    body: 'BODY', id: 'c2ab', before: 10000, after: 2000,
    lossless: false, stats: { omittedItems: 10, omittedKeys: 3, trimmedStrings: 2 },
    locator: '/spill/y.txt', retrievalHint: '', verbose: true
  })
  assert.ok(n.includes(' Omitted: +10 array items, +3 object keys, 2 long strings trimmed.'))
  assert.ok(!n.includes('zero information loss'))
  MARKER_RE.lastIndex = 0
  assert.ok(MARKER_RE.test(n))
})

test('buildNotice: compact form keeps id + locator at a fraction of the size (E1)', () => {
  var verbose = buildNotice({
    body: 'BODY', id: 'c3cd', before: 12345, after: 3456,
    lossless: true, stats: undefined, locator: '/spill/z.txt', retrievalHint: 'Use read.', verbose: true
  })
  var compact = buildNotice({
    body: 'BODY', id: 'c3cd', before: 12345, after: 3456,
    lossless: true, stats: undefined, locator: '/spill/z.txt', retrievalHint: 'Use read.', verbose: false
  })
  assert.ok(compact.includes('[save-token #c3cd losslessly re-encoded: 12,345 -> 3,456 bytes.'))
  assert.ok(compact.includes('save_token_expand id="c3cd"'))
  assert.ok(compact.includes('full: /spill/z.txt'))
  assert.ok(compact.length < verbose.length)
  MARKER_RE.lastIndex = 0
  assert.ok(MARKER_RE.test(compact))
})

test('buildNotice: every form stays recognizable to the replay scanner', () => {
  var forms = [
    { lossless: true, verbose: true },
    { lossless: true, verbose: false },
    { lossless: false, verbose: true },
    { lossless: false, verbose: false }
  ]
  for (var i = 0; i < forms.length; i++) {
    var n = buildNotice({
      body: 'B', id: 'c' + i + 'zz', before: 1000, after: 300,
      lossless: forms[i].lossless,
      stats: forms[i].lossless ? undefined : { omittedItems: 4, omittedKeys: 0, trimmedStrings: 1 },
      locator: '/p', retrievalHint: '', verbose: forms[i].verbose
    })
    MARKER_RE.lastIndex = 0
    assert.ok(MARKER_RE.test(n), 'form ' + i + ' must match MARKER_RE')
  }
})
