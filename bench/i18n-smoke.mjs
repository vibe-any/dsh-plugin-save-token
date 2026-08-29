import React from 'react'
import { renderToString } from 'react-dom/server'
import { apply } from '../src/client/index.js'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

// --- static check: every T('key') / t('key') / kind* value exists in BOTH dicts
const keys = new Set()
for (const m of src.matchAll(/\b[Tt]\('([A-Za-z][A-Za-z0-9]*)'/g)) keys.add(m[1])
for (const m of src.matchAll(/kind(?:Compress|Lossless|Dedupe|Request|Aux|Skip|Config|Compact)/g)) keys.add(m[0])
const enBlock = src.slice(src.indexOf('en: {'), src.indexOf('zh: {'))
const zhBlock = src.slice(src.indexOf('zh: {'), src.indexOf('/** Look up one string'))
const missing = []
for (const k of keys) {
  if (!new RegExp('\\b' + k + ':').test(enBlock)) missing.push('en:' + k)
  if (!new RegExp('\\b' + k + ':').test(zhBlock)) missing.push('zh:' + k)
}
if (missing.length) { console.error('MISSING KEYS:', missing); process.exit(1) }
console.log('dict check OK:', keys.size, 'keys present in en+zh')

// --- runtime check: render both slot entries under zh / no-service / throwing-ctx
const registrations = []
const mkCtx = (localeActive) => ({
  locale: localeActive === null ? undefined : {
    getLocale: () => ({ active: localeActive }),
    subscribe: () => () => {},
  },
  slots: {
    inject: (_name, fn) => fn(),
    register: (...a) => registrations.push(a),
  },
})

function renderFor(active) {
  registrations.length = 0
  apply(mkCtx(active))
  const settingsEntry = registrations.find(r => r[0].id === 'save-token')
  const stripEntry = registrations.find(r => r[0].id === 'save-token-strip')
  return renderToString(settingsEntry[1]()) + renderToString(stripEntry[1]())
}

// cordis guard: reading ctx.locale itself throws -> must fall back to <html
// lang> (absent in node => 'en') without crashing the render.
function renderForThrowingCtx() {
  registrations.length = 0
  const ctx = { slots: mkCtx(null).slots }
  Object.defineProperty(ctx, 'locale', { get() { throw new Error('cannot get property "locale" without inject') } })
  apply(ctx)
  const settingsEntry = registrations.find(r => r[0].id === 'save-token')
  return renderToString(settingsEntry[1]())
}

const zhHtml = renderFor('zh')
console.log('zh loading text rendered:', zhHtml.includes('正在加载'))

const enHtml = renderFor(null)
console.log('en fallback (no ctx.locale) rendered:', enHtml.includes('Loading token stats...'))

const throwHtml = renderForThrowingCtx()
console.log('throwing ctx survives + en fallback:', throwHtml.includes('Loading token stats...'))

console.log('en/zh outputs differ:', zhHtml !== enHtml)
console.log('SMOKE OK')
