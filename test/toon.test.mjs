import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  csvCell, uniformKeys, uniformTabular, toonEncode, toonEncodeCols,
  findDominantUniformArray, keyedMapRows
} from '../src/compress.js'

function rows(n, make) {
  var out = []
  for (var i = 0; i < n; i++) out.push(make(i))
  return out
}

test('csvCell: comma/quote/newline are quoted and doubled', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('l1\nl2'), '"l1\nl2"')
  assert.equal(csvCell(null), 'null')
})

test('uniformKeys: flat uniform arrays only (legacy contract intact)', () => {
  assert.deepEqual(uniformKeys(rows(8, function (i) { return { a: i, b: 'x' + i } })), ['a', 'b'])
  assert.equal(uniformKeys(rows(7, function (i) { return { a: i, b: 'x' } })), null) // too few
  assert.equal(uniformKeys(rows(8, function (i) { return i % 2 ? { a: i, b: 'x' } : { a: i } })), null) // key drift
  assert.equal(uniformKeys(rows(8, function () { return { a: 1, b: { nested: true } } })), null) // nested value
  assert.equal(uniformKeys(rows(8, function () { return { a: [1] } })), null) // array value
  var wide = {}
  for (var i = 0; i < 25; i++) wide['k' + i] = i
  assert.equal(uniformKeys(rows(8, function () { return Object.assign({}, wide) })), null) // >24 keys
})

test('toonEncode: golden flat output', () => {
  var out = toonEncode([
    { model: 'gpt-4', input: 0.03, output: 0.06 },
    { model: 'claude-opus', input: 0.015, output: 0.075 }
  ], ['model', 'input', 'output'], 'prices')
  assert.equal(out, 'prices[2]{model,input,output}:\ngpt-4,0.03,0.06\nclaude-opus,0.015,0.075')
})

test('uniformTabular: nested field groups fold into the header (B3)', () => {
  var arr = rows(8, function (i) { return { id: 'r' + i, temp: { min: i, max: i + 5 } } })
  var tab = uniformTabular(arr)
  assert.ok(tab !== null)
  assert.deepEqual(tab.groups.map(function (g) { return g.header }), ['id', 'temp{min,max}'])
  var out = toonEncodeCols(arr, tab, 'wx')
  var lines = out.split('\n')
  assert.equal(lines[0], 'wx[8]{id,temp{min,max}}:')
  assert.equal(lines[1], 'r0,0,5')
  assert.equal(lines[2], 'r1,1,6')
})

test('uniformTabular: null cells pass through as flat values', () => {
  var arr = rows(8, function (i) { return { a: i === 3 ? null : i, b: 'x' } })
  var tab = uniformTabular(arr)
  assert.ok(tab !== null)
  var lines = toonEncodeCols(arr, tab, 't').split('\n')
  assert.equal(lines[4], 'null,x') // row index 3 -> line 4 (header is line 0)
})

test('uniformTabular: rejections keep the lossless guarantee', () => {
  // array value anywhere in a column
  assert.equal(uniformTabular(rows(8, function () { return { a: [1, 2] } })), null)
  // column type drift: object in row 0, string in row 1
  var drift = rows(8, function (i) { return { a: i === 1 ? 'str' : { x: 1 } } })
  assert.equal(uniformTabular(drift), null)
  // row missing a key would render "undefined" — must reject (regression)
  var missing = rows(8, function (i) { return i === 2 ? { a: i } : { a: i, b: 'x' } })
  assert.equal(uniformTabular(missing), null)
  // row with an EXTRA key would shift every cell — must reject
  var extra = rows(8, function (i) { return i === 5 ? { a: i, b: 'x', c: 1 } : { a: i, b: 'x' } })
  assert.equal(uniformTabular(extra), null)
  // nested key-set drift
  var keydrift = rows(8, function (i) { return { a: i === 1 ? { x: 1, y: 2 } : { x: 1 } } })
  assert.equal(uniformTabular(keydrift), null)
  // nested value depth-2 object -> reject (one nesting level supported)
  assert.equal(uniformTabular(rows(8, function () { return { a: { x: { deep: 1 } } } })), null)
  // unsafe nested header tokens (comma in key) -> reject
  assert.equal(uniformTabular(rows(8, function () { return { a: { 'x,y': 1 } } })), null)
  // fewer than 8 rows
  assert.equal(uniformTabular(rows(7, function () { return { a: 1 } })), null)
  // width cap
  var wide = {}
  for (var i = 0; i < 70; i++) wide['c' + i] = i
  assert.equal(uniformTabular(rows(8, function () { return Object.assign({}, wide) })), null)
})

test('findDominantUniformArray: root array', () => {
  var arr = rows(9, function (i) { return { v: i } })
  var d = findDominantUniformArray(arr, 8)
  assert.equal(d.isRoot, true)
  assert.equal(d.arr, arr)
})

test('findDominantUniformArray: direct property', () => {
  var arr = rows(9, function (i) { return { v: i } })
  var doc = { prices: arr, note: 'x' }
  var d = findDominantUniformArray(doc, 8)
  assert.equal(d.arr, arr)
  assert.equal(d.name, 'prices')
  assert.equal(d.parent, doc) // parent is the root object (delete root[key] works uniformly)
  assert.equal(d.key, 'prices')
  assert.equal(d.isRoot, false)
})

test('findDominantUniformArray: nested one level deep (B2, was missed in v2.1.x)', () => {
  var items = rows(8, function (i) { return { id: i, score: i * 2 } })
  var doc = { data: { items: items, note: 'keep' }, meta: { v: 1 } }
  var d = findDominantUniformArray(doc, 8)
  assert.ok(d !== null)
  assert.equal(d.arr, items)
  assert.equal(d.name, 'items')
  assert.equal(d.parent, doc.data)
  assert.equal(d.key, 'items')
})

test('findDominantUniformArray: largest candidate wins', () => {
  var a = rows(8, function () { return { x: 1 } })
  var b = rows(12, function () { return { y: 2 } })
  var d = findDominantUniformArray({ a: a, b: b }, 8)
  assert.equal(d.arr, b)
})

test('findDominantUniformArray: none found', () => {
  assert.equal(findDominantUniformArray({ a: 1, b: 'x' }, 8), null)
  assert.equal(findDominantUniformArray({ a: rows(4, function () { return { x: 1 } }) }, 8), null)
})

test('keyedMapRows: uniform-object map becomes key-annotated rows (B3)', () => {
  var map = {}
  for (var i = 0; i < 8; i++) map['flag' + i] = { on: i % 2 === 0, weight: i }
  var r = keyedMapRows(map)
  assert.ok(r !== null)
  assert.equal(r.length, 8)
  assert.equal(r[0].key, 'flag0')
  assert.equal(r[0].on, true)
  var tab = uniformTabular(r)
  assert.ok(tab !== null)
  var out = toonEncodeCols(r, tab, 'items')
  assert.equal(out.split('\n')[0], 'items[8]{key,on,weight}:')
})

test('keyedMapRows: rejections', () => {
  assert.equal(keyedMapRows({ a: { x: 1 } }), null) // too few
  assert.equal(keyedMapRows({ a: 'flat' }), null) // non-object value
  var coll = {}
  for (var i = 0; i < 8; i++) coll['k' + i] = { key: i, v: 1 } // key collision
  assert.equal(keyedMapRows(coll), null)
})
