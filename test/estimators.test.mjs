import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estTokens, fnv1a, fmtInt, argsToString, dedupeFingerprint } from '../src/compress.js'

test('estTokens: empty and ascii', () => {
  assert.equal(estTokens(''), 0)
  assert.equal(estTokens('abcd'), 2) // ceil(4/3.8)
})

test('estTokens: CJK at 0.75 per char', () => {
  assert.equal(estTokens('中中'), 2) // ceil(1.5)
})

test('estTokens: mixed scripts', () => {
  assert.equal(estTokens('a中'), 2) // ceil(1/3.8 + 0.75)
})

test('estTokens: astral plane surrogate pair counts once', () => {
  assert.equal(estTokens('\u{20BB7}'), 1) // D842 DFB6 -> one CJK char
})

test('fnv1a: golden vectors', () => {
  assert.equal(fnv1a('hello'), '4f9f2cab')
  assert.equal(fnv1a('abc'), '1a47e90b')
})

test('fnv1a: full-length hashing (no 64KB prefix truncation)', () => {
  // v2.1.x hashed only the first 65536 chars, so these two would collide
  var a = 'x'.repeat(70000) + 'A'
  var b = 'x'.repeat(70000) + 'B'
  assert.notEqual(fnv1a(a), fnv1a(b))
  assert.equal(fnv1a(a), fnv1a('x'.repeat(70000) + 'A'))
})

test('fmtInt: thousands separators', () => {
  assert.equal(fmtInt(0), '0')
  assert.equal(fmtInt(999), '999')
  assert.equal(fmtInt(1234567), '1,234,567')
})

test('argsToString: objects stringify, strings pass through, cycles survive', () => {
  assert.equal(argsToString({ a: 1 }), '{"a":1}')
  assert.equal(argsToString('raw'), 'raw')
  var cyc = {}
  cyc.self = cyc
  assert.equal(typeof argsToString(cyc), 'string')
})

test('dedupeFingerprint: same session + same output collides (dedupe works)', () => {
  var f1 = dedupeFingerprint('sess-1', 'bash', 'ls -la', 'total 0')
  var f2 = dedupeFingerprint('sess-1', 'bash', 'ls -la', 'total 0')
  assert.equal(f1, f2)
})

test('dedupeFingerprint: different sessions never collide (C1 fix)', () => {
  // v2.1.x keyed dedupe without the session id: two agents sharing one
  // process running the same command inside the TTL would get a stub
  // claiming "remains in context above" — false in the other session.
  var fa = dedupeFingerprint('sess-A', 'bash', 'ls -la', 'total 0')
  var fb = dedupeFingerprint('sess-B', 'bash', 'ls -la', 'total 0')
  assert.notEqual(fa, fb)
})

test('dedupeFingerprint: undefined session still deterministic and distinct', () => {
  var f1 = dedupeFingerprint(undefined, 'bash', 'ls', 'out')
  var f2 = dedupeFingerprint(undefined, 'bash', 'ls', 'out')
  assert.equal(f1, f2)
  assert.notEqual(f1, dedupeFingerprint('sess-1', 'bash', 'ls', 'out'))
})

test('dedupeFingerprint: full-length content hash (fingerprint fix)', () => {
  var prefix = 'y'.repeat(70000)
  var f1 = dedupeFingerprint('s', 'bash', 'cmd', prefix + 'ONE')
  var f2 = dedupeFingerprint('s', 'bash', 'cmd', prefix + 'TWO')
  assert.notEqual(f1, f2)
})
