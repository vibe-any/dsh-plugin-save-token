import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compressJsonText, compressJsonlText, jsonRoutes } from '../src/compress.js'

var cfg = {
  jsonMaxParseBytes: 524288,
  jsonlMinLines: 8
}

function flatRows(n, extra) {
  var arr = []
  for (var i = 0; i < n; i++) {
    arr.push(Object.assign({ model: 'm' + i, input: i / 100, output: i / 50 }, extra || {}))
  }
  return arr
}

test('compressJsonText: dominant flat array -> lossless TOON (golden shape)', () => {
  var doc = JSON.stringify({ prices: flatRows(300) })
  var r = compressJsonText(doc, cfg)
  assert.ok(r !== null)
  assert.equal(r.lossless, true)
  assert.equal(r.strategy, 'toon-array')
  var lines = r.text.split('\n')
  assert.equal(lines[0], 'prices[300]{model,input,output}:')
  assert.equal(lines.length, 301)
  assert.equal(lines[1], 'm0,0,0')
})

test('compressJsonText: root array itself is tabularized', () => {
  var r = compressJsonText(JSON.stringify(flatRows(8)), cfg)
  assert.ok(r !== null)
  assert.equal(r.lossless, true)
  assert.equal(r.strategy, 'toon-array')
  assert.ok(r.text.startsWith('items[8]{model,input,output}:'))
})

test('compressJsonText: nested dominant array is tabularized with rest JSON (B2)', () => {
  var doc = JSON.stringify({ data: { items: flatRows(8), note: 'keep' }, meta: { v: 1 } })
  var r = compressJsonText(doc, cfg)
  assert.ok(r !== null)
  assert.equal(r.strategy, 'toon-array')
  assert.equal(r.lossless, true)
  assert.ok(r.text.includes('items[8]{model,input,output}:'))
  // the rest of the document survives verbatim around the table
  assert.ok(r.text.includes('"note":"keep"'))
  assert.ok(r.text.includes('"meta":{"v":1}'))
})

test('compressJsonText: keyed uniform-object map -> toon-keyed (B3)', () => {
  var map = {}
  for (var i = 0; i < 10; i++) map['svc' + i] = { replicas: i, region: 'r' + (i % 2) }
  var r = compressJsonText(JSON.stringify(map), cfg)
  assert.ok(r !== null)
  assert.equal(r.strategy, 'toon-keyed')
  assert.equal(r.lossless, true)
  assert.ok(r.text.startsWith('items[10]{key,replicas,region}:'))
})

test('compressJsonText: non-uniform big array -> lossy elision with stats', () => {
  var logs = []
  for (var i = 0; i < 15; i++) {
    // key sets differ row to row -> uniformTabular rejects -> elision
    logs.push(i % 2 === 0 ? { i: i, msg: 'x' } : { i: i, err: 'y' })
  }
  var r = compressJsonText(JSON.stringify({ logs: logs }), cfg)
  assert.ok(r !== null)
  assert.equal(r.lossless, false)
  assert.equal(r.strategy, 'elision')
  assert.equal(r.stats.omittedItems, 10) // 15 - 5 kept
  assert.ok(r.text.includes('__omitted__'))
})

test('compressJsonText: lossless TOON is preferred even when lossy would be far smaller (red line)', () => {
  // 100 uniform rows with 1200-char strings: elision trims to ~1/4 the size,
  // but the project value system is lossless-first — the TOON table keeps
  // every byte and wins as long as it passes the never-worse gates (checked
  // in buildCandidate; see the gate-fallback test there)
  var big = 'z'.repeat(1200)
  var rows = []
  for (var i = 0; i < 100; i++) rows.push({ id: i, blob: big })
  var r = compressJsonText(JSON.stringify({ rows: rows }), cfg)
  assert.ok(r !== null)
  assert.equal(r.strategy, 'toon-array')
  assert.equal(r.lossless, true)
  // ...and the lossy candidate is still generated as the gate-checked fallback
  var routes = jsonRoutes(JSON.stringify({ rows: rows }), cfg)
  assert.equal(routes.length, 2)
  assert.equal(routes[0].lossless, true)
  assert.equal(routes[1].strategy, 'elision')
})

test('compressJsonText: 300-char strings stay under the trim threshold, lossless route wins', () => {
  // elision cannot shrink 300-char strings (they are below the 400-char trim
  // threshold), so the lossless TOON table is the obvious head route
  var small = 'z'.repeat(300)
  var rows = []
  for (var i = 0; i < 40; i++) rows.push({ id: i, blob: small })
  var r = compressJsonText(JSON.stringify({ rows: rows }), cfg)
  assert.ok(r !== null)
  assert.equal(r.lossless, true)
})

test('compressJsonText: protected error keys keep 1800 chars and report the true count (off-by-100 fix)', () => {
  var r = compressJsonText(JSON.stringify({ error: 'E'.repeat(3000) }), cfg)
  assert.ok(r !== null)
  assert.ok(r.text.includes('+1200 chars truncated error detail')) // v2.1.x said +1100
  assert.equal(r.stats.trimmedStrings, 1)
})

test('compressJsonText: guarded inputs return null', () => {
  assert.equal(compressJsonText('not json at all', cfg), null)
  assert.equal(compressJsonText('{"a":1}', cfg), null) // too small to matter
  var big = JSON.stringify({ prices: flatRows(4000) })
  assert.equal(compressJsonText(big, { jsonMaxParseBytes: 1024, losslessPreferenceFactor: 0.6 }), null)
})

test('compressJsonlText: uniform NDJSON -> one lossless table (B1)', () => {
  var lines = []
  for (var i = 0; i < 10; i++) lines.push(JSON.stringify({ ts: 't' + i, lvl: 'info', msg: 'm' + i }))
  var r = compressJsonlText(lines.join('\n'), cfg)
  assert.ok(r !== null)
  assert.equal(r.lossless, true)
  assert.equal(r.strategy, 'jsonl')
  var out = r.text.split('\n')
  assert.equal(out[0], 'items[10]{ts,lvl,msg}:')
  assert.equal(out[1], 't0,info,m0')
})

test('compressJsonlText: nested-uniform lines also tabularize', () => {
  var lines = []
  for (var i = 0; i < 12; i++) lines.push(JSON.stringify({ id: i, pos: { x: i, y: i * 2 } }))
  var r = compressJsonlText(lines.join('\n'), cfg)
  assert.ok(r !== null)
  assert.ok(r.text.includes('{id,pos{x,y}}:'))
})

test('compressJsonlText: any broken line rejects the whole route', () => {
  var lines = []
  for (var i = 0; i < 10; i++) lines.push(JSON.stringify({ a: i }))
  lines[4] = '{"a": oops}'
  assert.equal(compressJsonlText(lines.join('\n'), cfg), null)
})

test('compressJsonlText: below jsonlMinLines or non-object lines reject', () => {
  var lines = []
  for (var i = 0; i < 7; i++) lines.push(JSON.stringify({ a: i }))
  assert.equal(compressJsonlText(lines.join('\n'), cfg), null)
  var arrlines = []
  for (var j = 0; j < 9; j++) arrlines.push(JSON.stringify([j]))
  assert.equal(compressJsonlText(arrlines.join('\n'), cfg), null)
})
