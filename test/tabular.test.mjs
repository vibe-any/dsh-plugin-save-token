import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collapseBlanks, collapseRepeats, trimLongLines,
  looksTabular, windowLines, windowLinesStrided, compressLinesText, effectiveMinBytes
} from '../src/compress.js'

var cfg = {
  maxLines: 240, headLines: 140, tailLines: 80,
  tabularHeadRows: 60, tabularTailRows: 40, tabularStrideSamples: 50,
  longLineChars: 420
}

test('collapseBlanks folds 2+ consecutive blank lines to one', () => {
  assert.deepEqual(collapseBlanks(['a', '', '', '', 'b']), ['a', '', 'b'])
  assert.deepEqual(collapseBlanks(['a', '', 'b']), ['a', '', 'b'])
})

test('collapseRepeats folds runs of >4 identical non-blank lines', () => {
  assert.deepEqual(collapseRepeats(['a', 'a', 'a', 'a', 'a', 'a', 'b']), ['a', '[x6 identical lines]', 'b'])
  assert.deepEqual(collapseRepeats(['a', 'a', 'a', 'a', 'b']), ['a', 'a', 'a', 'a', 'b']) // run of 4 stays
  assert.deepEqual(collapseRepeats(['', '', '', '', '', '', '']), ['', '', '', '', '', '', '']) // blanks untouched
})

test('trimLongLines keeps head+tail and reports the omitted count', () => {
  var l = 'L'.repeat(500)
  var out = trimLongLines([l], 420)
  assert.equal(out.length, 1)
  assert.ok(out[0].includes('...[+140 chars]...')) // 500 - 260 - 100
  assert.ok(out[0].startsWith('LLLL'))
  assert.equal(trimLongLines(['short'], 420)[0], 'short')
})

test('looksTabular: dense pipe table hits', () => {
  var lines = []
  for (var i = 0; i < 120; i++) lines.push('name-' + i + '|value-' + i + '|meta-' + i)
  assert.equal(looksTabular(lines, cfg), true)
})

test('looksTabular: mixed delimiters miss (below 70% dominance)', () => {
  var lines = []
  for (var i = 0; i < 120; i++) lines.push(i % 2 === 0 ? 'a|b|c' : 'plain text line ' + i)
  assert.equal(looksTabular(lines, cfg), false)
})

test('looksTabular: too few lines misses (needs headRows+tailRows)', () => {
  var lines = []
  for (var i = 0; i < 50; i++) lines.push('a|b|c')
  assert.equal(looksTabular(lines, cfg), false)
})

test('windowLines: head/tail windows with omitted marker and error-line protection', () => {
  var lines = []
  for (var i = 0; i < 400; i++) lines.push('filler line ' + i)
  lines[200] = 'Traceback (most recent call last):'
  var r = windowLines(lines, cfg)
  assert.ok(r.lines.length < 400)
  assert.ok(r.lines.includes('[... +180 lines omitted ...]'))
  assert.ok(r.lines.some(function (l) { return l === 'L201: Traceback (most recent call last):' }))
  // C3: ±1 context lines around the anchor are kept (what saves a re-run)
  assert.ok(r.lines.some(function (l) { return l === 'L200: filler line 199' }))
  assert.ok(r.lines.some(function (l) { return l === 'L202: filler line 201' }))
  assert.ok(r.lines.some(function (l) { return l.indexOf('error-related lines (with +-1 context lines)') >= 0 }))
  // head and tail intact
  assert.equal(r.lines[0], 'filler line 0')
  assert.equal(r.lines[r.lines.length - 1], 'filler line 399')
})

test('windowLines: adjacent error lines merge into one range (no duplicate context)', () => {
  var lines = []
  for (var i = 0; i < 400; i++) lines.push('filler line ' + i)
  lines[200] = 'ERROR: first failure'
  lines[201] = 'ERROR: second failure'
  var r = windowLines(lines, cfg)
  var err = r.lines.filter(function (l) { return /^L\d+: /.test(l) })
  // anchors at middle idx 60,61 -> merged range 59..62 -> 4 rows
  assert.equal(err.length, 4)
  assert.equal(err[0], 'L200: filler line 199')
  assert.equal(err[3], 'L203: filler line 202')
})

test('windowLines: anchor cap bounds the protection section at 25 anchors', () => {
  var lines = []
  for (var i = 0; i < 400; i++) lines.push(i % 4 === 0 ? 'ERROR: boom ' + i : 'filler line ' + i)
  var r = windowLines(lines, cfg)
  var err = r.lines.filter(function (l) { return /^L\d+: /.test(l) })
  // 25 anchors -> up to 75 rows (adjacent anchors merge, so <= 75)
  assert.ok(err.length <= 75)
  assert.ok(err.length >= 50)
})

test('windowLines: no error lines -> no protection section', () => {
  var lines = []
  for (var i = 0; i < 300; i++) lines.push('harmless output ' + i)
  var r = windowLines(lines, cfg)
  assert.ok(!r.lines.some(function (l) { return l.indexOf('error-related lines') >= 0 }))
})

test('windowLinesStrided: keeps line-numbered samples across the middle', () => {
  var lines = []
  for (var i = 0; i < 1000; i++) lines.push('row-' + (i + 1))
  var r = windowLinesStrided(lines, cfg)
  assert.equal(r.strided, true)
  // middle=900, stride=ceil(900/50)=18 -> samples at rows 61,79,...,943 (50)
  assert.equal(r.lines.length, 60 + 1 + 50 + 40)
  assert.ok(r.lines[60].includes('+900 data rows omitted'))
  assert.ok(r.lines[61] === 'L61: row-61')
  assert.ok(r.lines.some(function (l) { return l === 'L943: row-943' }))
  // tail preserved verbatim without L prefixes
  assert.equal(r.lines[r.lines.length - 1], 'row-1000')
})

test('compressLinesText: non-tabular long text falls to plain window', () => {
  var text = []
  for (var i = 0; i < 400; i++) text.push('lorem ipsum dolor ' + i)
  var r = compressLinesText(text.join('\n'), cfg)
  assert.equal(r.strided, false)
  assert.ok(r.text.includes('lines omitted'))
})

test('compressLinesText: short text passes through', () => {
  var r = compressLinesText('one\ntwo', cfg)
  assert.equal(r.text, 'one\ntwo')
  assert.equal(r.strided, false)
})

test('effectiveMinBytes: never-worse arithmetic floor (E3)', () => {
  // 500 / (1 - 0.72) = 1785.71 -> 1786
  assert.equal(effectiveMinBytes(1400, 500, 0.72), 1786)
  // floor never LOWERS the configured minimum, only raises it
  assert.equal(effectiveMinBytes(6000, 500, 0.72), 6000)
  assert.equal(effectiveMinBytes(1400, 100, 0.5), 1400)
  assert.equal(effectiveMinBytes(150, 100, 0.5), 200) // 100 / (1-0.5)
  // degenerate keepRatioMax >= 1 -> just minBytes
  assert.equal(effectiveMinBytes(1400, 500, 1), 1400)
})
