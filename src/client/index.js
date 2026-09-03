/*!
 * dsh-plugin-save-token v2.4.1 — Client half (browser)
 * Live strip: in-flow pill (was an absolutely-positioned floater that
 * covered the tail of the last reply and sibling hover tooltips).
 *
 * ES module built by build.mjs into the DSH client-modules handshake
 * (lib/client.js, `window.__ModuleLoader__.load({ id, factory })`). `react`
 * stays external: the web shell seeds it in the module table and the
 * loader-provided require resolves it inside the factory.
 *
 * Contract: `{ inject: ['slots', 'locale'], apply(ctx) }` — registers UI into slots
 * `settings.section` and `conversation.composer.dock`, polls the
 * package-private JSON API (`/save-token/api/*`) served by the node half,
 * and renders with React.createElement. UI copy is bilingual (en/zh),
 * following the dsh locale setting (`ctx.locale`, fallback `<html lang>`).
 */

import React from 'react'

export const inject = ['slots', 'locale']

const API_BASE = '/save-token/api'

/**
 * Bilingual UI copy following the dsh locale setting (user preference
 * `locale.preference`, falling back to the browser language). Flat
 * `{name}` templates; lookup order: active locale -> en -> key itself.
 */
const STR = {
  en: {
    tagline: 'structure-aware · lossless-first · CCR',
    up: 'up {n}min',
    hintOn: 'Enabled — click to turn off',
    hintOff: 'Disabled — click to enable',
    on: 'ON', off: 'OFF',
    toggleCompress: 'Compress', toggleDedupe: 'Dedupe', toggleCompact: 'Compact@{n}',
    reset: 'Reset',
    loading: 'Loading token stats...',
    spillWarn: 'Reversible storage unavailable -> compression stays off. ',
    kpiRequests: 'Model requests', kpiRequestsSub: '+{n} aux (title/compaction)',
    kpiIn: 'Input tokens (actual)', kpiInSub: 'cache hit {p}% · {n} cached',
    kpiOut: 'Output tokens (actual)', kpiOutSub: '{n} reasoning',
    kpiAvoided: 'Tokens avoided (est)', kpiAvoidedSub: '~{p}% lighter context per call avg',
    chartTitle: 'Per-request context weight — gray = sent prompt, green = avoided',
    noRequests: 'no requests yet',
    chartSub: 'avg prompt ~{a} tok | avg avoided ~{b} tok/request',
    cardCompress: 'Compression', cardCompressLine: ' reshaped, avg -{r}% bytes',
    cardCompressCalls: '{n} top-level · {m} nested calls',
    cardLossless: 'Lossless routes', cardLosslessLine: ' TOON-style re-encodes', cardLosslessSub: '{n} strided table windows',
    cardDedupe: 'Dedupe / Compaction', cardDedupeStubbed: ' stubbed · ', cardDedupeCompactions: ' compactions', cardDedupeSub: '{b} deduped · assist @{t} tok',
    topTools: 'Top tools by bytes kept out', topToolsEmpty: 'nothing compressed yet',
    recent: 'Recent activity',
    footer: 'Lossless-first: uniform JSON arrays are re-encoded deterministically (TOON-style) with zero information loss; regular outputs get structure-aware windows with line-numbered stride samples. Every replacement stays retrievable via the save_token_expand tool or the stored locator.',
    stripAvoided: '~{n} tok avoided', stripCompressed: '{n} compressed', stripLossless: ' ({n} lossless)', stripReqs: '{n} reqs',
    kindCompress: 'compressed', kindLossless: 'lossless', kindDedupe: 'deduped', kindRequest: 'request',
    kindAux: 'aux-call', kindSkip: 'skipped', kindConfig: 'config', kindCompact: 'compaction',
  },
  zh: {
    tagline: '结构感知 · 无损优先 · CCR',
    up: '已运行 {n} 分钟',
    hintOn: '已启用——点击关闭',
    hintOff: '已停用——点击启用',
    on: '开', off: '关',
    toggleCompress: '压缩', toggleDedupe: '去重', toggleCompact: 'Compaction@{n}',
    reset: '重置',
    loading: '正在加载 token 统计…',
    spillWarn: '可逆存储不可用 → 压缩保持关闭。',
    kpiRequests: '模型请求', kpiRequestsSub: '+{n} 辅助（标题/compaction）',
    kpiIn: '输入 token（实际）', kpiInSub: '缓存命中 {p}% · 含 {n} 缓存',
    kpiOut: '输出 token（实际）', kpiOutSub: '{n} 推理',
    kpiAvoided: '节省 token（估算）', kpiAvoidedSub: '单次调用平均减轻 ~{p}% 上下文',
    chartTitle: '单次请求上下文重量——灰 = 发送的提示词,绿 = 已节省',
    noRequests: '暂无请求',
    chartSub: '平均提示 ~{a} tok | 平均节省 ~{b} tok/次',
    cardCompress: '压缩统计', cardCompressLine: ' 次重塑,平均 -{r}% 字节',
    cardCompressCalls: '顶层 {n} 次 · 嵌套 {m} 次',
    cardLossless: '无损路径', cardLosslessLine: ' 次 TOON 式重编码', cardLosslessSub: '{n} 个抽采样表格窗口',
    cardDedupe: '去重 / Compaction', cardDedupeStubbed: ' 次去重桩 · ', cardDedupeCompactions: ' 次 compaction', cardDedupeSub: '去重节省 {b} · 协助水位 @{t} tok',
    topTools: '节省字节最多的工具', topToolsEmpty: '还没有压缩记录',
    recent: '近期活动',
    footer: '无损优先:均匀 JSON 数组确定性重编码(TOON 式),零信息损失;常规输出走结构感知窗口,中段按行号抽采样。每次替换都可经 save_token_expand 工具或存储定位器一步取回。',
    stripAvoided: '已节省 ~{n} tok', stripCompressed: '压缩 {n} 次', stripLossless: '({n} 无损)', stripReqs: '{n} 次请求',
    kindCompress: '压缩', kindLossless: '无损', kindDedupe: '去重', kindRequest: '请求',
    kindAux: '辅助', kindSkip: '跳过', kindConfig: '配置', kindCompact: 'compaction',
  },
}

/** Look up one string in the locale dict ({name} templates filled from vars). */
function tr(locale, key, vars) {
  const dict = STR[locale] || STR.en
  let s = dict[key] !== undefined ? dict[key] : (STR.en[key] !== undefined ? STR.en[key] : key)
  if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m })
  return s
}

const CSS = '.st-wrap{display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary,#1f2937)}\n.st-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.st-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}\n.st-kpi{background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:10px 12px;min-width:0}\n.st-kpi .st-v{font-size:19px;font-weight:650;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.st-kpi .st-s{color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;margin-top:3px;line-height:1.35}\n.st-card{background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:12px 14px}\n.st-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b7280);letter-spacing:.02em;text-transform:uppercase}\n.st-green{color:var(--dsw-alias-state-success-primary,#15803d)}\n.st-dim{color:var(--dsw-alias-label-secondary,#6b7280)}\n.st-bar{height:8px;border-radius:4px;background:var(--dsw-alias-brand-primary,#2563eb);opacity:.85}\n.st-barrow{display:grid;grid-template-columns:minmax(90px,160px) 1fr auto;gap:10px;align-items:center;margin-top:8px;font-size:12px}\n.st-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}\n.st-table td{padding:4px 6px;border-top:1px solid var(--dsw-alias-border-l1,#eceef1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}\n.st-badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:600;border:1px solid var(--dsw-alias-border-l1,#ddd)}\n.st-btn{border:1px solid var(--dsw-alias-border-l2,#d1d5db);background:transparent;color:inherit;border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer}\n.st-btn:hover{border-color:var(--dsw-alias-brand-primary,#2563eb)}\n.st-btn.st-on{border-color:var(--dsw-alias-state-success-primary,#16a34a);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#15803d);font-weight:650}\n.st-btn.st-on:hover{border-color:var(--dsw-alias-state-success-primary,#16a34a);filter:brightness(1.08)}\n.st-btn.st-off{opacity:.5}\n.st-dot{display:inline-block;width:7px;height:7px;border-radius:999px;margin-right:6px;vertical-align:1px}\n.st-strip{position:static;display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;max-width:100%;margin:0 auto 6px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:999px;padding:3px 14px;pointer-events:none;width:max-content}'

let styled = false
function ensureStyles() {
  if (styled || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-save-token', '')
  el.textContent = CSS
  document.head.appendChild(el)
  styled = true
}

async function apiGet(action) {
  const response = await fetch(API_BASE + '/' + action, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('save-token api ' + action + ': HTTP ' + response.status)
  return response.json()
}
async function apiPost(action, body) {
  const response = await fetch(API_BASE + '/' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body || {})
  })
  if (!response.ok) throw new Error('save-token api ' + action + ': HTTP ' + response.status)
  return response.json()
}

export function apply(ctx) {
  ensureStyles()
  const h = React.createElement

  /**
   * Active dsh locale ('zh' | 'en'), re-rendering on `locale/change`.
   * Primary source: the shell's locale runtime (`getLocale()`/`subscribe()`);
   * fallback: the `<html lang>` attribute the shell keeps in sync.
   */
  function useLocale() {
    // Reading ctx.locale throws on contexts that lack the inject declaration
    // ("cannot get property without inject"); guard so a composition without
    // the locale service falls back to the shell-synced <html lang>.
    const getLocaleService = function () {
      try { return ctx.locale } catch (e) { return null }
    }
    const subscribe = function (notify) {
      const svc = getLocaleService()
      if (svc && typeof svc.subscribe === 'function') return svc.subscribe(notify)
      if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
        const obs = new MutationObserver(notify)
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
        return function () { obs.disconnect() }
      }
      return function () {}
    }
    const getSnapshot = function () {
      const svc = getLocaleService()
      const active = svc && typeof svc.getLocale === 'function' ? svc.getLocale().active : ''
      if (active === 'zh' || active === 'en') return active
      const lang = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || ''
      return lang.indexOf('zh') === 0 ? 'zh' : 'en'
    }
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }

  function fmtTok(n) {
    n = Number(n) || 0
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M'
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k'
    return String(Math.round(n))
  }
  function fmtBytes(b) {
    b = Number(b) || 0
    if (b >= 1048576) return (b / 1048576).toFixed(1) + 'MB'
    if (b >= 1024) return (b / 1024).toFixed(1) + 'KB'
    return b + 'B'
  }
  function fmtTime(ts, locale) { try { return new Date(ts).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }) } catch (e) { return '' } }

  const KIND_LABEL = { compress: 'kindCompress', lossless: 'kindLossless', dedupe: 'kindDedupe', request: 'kindRequest', aux: 'kindAux', skip: 'kindSkip', config: 'kindConfig', compact: 'kindCompact' }
  const KIND_COLOR = { compress: 'var(--dsw-alias-brand-primary,#2563eb)', lossless: 'var(--dsw-alias-state-success-primary,#16a34a)', dedupe: 'var(--dsw-alias-state-warn-primary,#b45309)', request: 'var(--dsw-alias-label-secondary,#6b7280)', aux: 'var(--dsw-alias-label-secondary,#6b7280)', skip: 'var(--dsw-alias-state-error-primary,#b91c1c)', config: 'var(--dsw-alias-label-secondary,#6b7280)', compact: 'var(--dsw-alias-state-warn-primary,#b45309)' }

  function useDashboard(intervalMs) {
    const st = React.useState(null)
    const data = st[0], setData = st[1]
    React.useEffect(function () {
      let alive = true
      const tick = async function () {
        try {
          const d = await apiGet('dashboard')
          if (alive) setData(d)
        } catch (e) { console.error('save-token dashboard poll failed', e) }
      }
      tick()
      const timer = setInterval(tick, intervalMs)
      return function () { alive = false; clearInterval(timer) }
    }, [])
    return [data, setData]
  }

  function Kpi(props) {
    return h('div', { className: 'st-kpi' },
      h('div', { className: 'st-title' }, props.label),
      h('div', { className: 'st-v' + (props.green ? ' st-green' : '') }, props.value),
      props.sub ? h('div', { className: 'st-s' }, props.sub) : null)
  }

  function Spark(props) {
    const series = props.series || []
    if (series.length === 0) return h('div', { className: 'st-dim' }, props.t('noRequests'))
    const n = series.length
    let maxV = 1
    for (let i = 0; i < n; i++) maxV = Math.max(maxV, (series[i].p || 0) + (series[i].a || 0))
    const W = n * 7, H = 48
    const bars = []
    for (let j = 0; j < n; j++) {
      const p = series[j].p || 0, a = series[j].a || 0
      const ph = Math.max(p > 0 ? 2 : 0, Math.round(p / maxV * 40))
      const ah = Math.round(a / maxV * 40)
      bars.push(h('rect', { key: 'p' + j, x: j * 7, y: H - 4 - ph - ah, width: 5, height: ph, fill: 'var(--dsw-alias-border-l2,#c7cbd1)' }))
      if (ah > 0) bars.push(h('rect', { key: 'a' + j, x: j * 7, y: H - 4 - ah, width: 5, height: ah, fill: 'var(--dsw-alias-state-success-primary,#16a34a)' }))
    }
    return h('svg', { width: '100%', height: H, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' }, bars)
  }

  function Toggle(props) {
    return h('button', {
      className: 'st-btn ' + (props.on ? 'st-on' : 'st-off'),
      title: props.on ? props.t('hintOn') : props.t('hintOff'),
      onClick: async function () {
        try { await apiPost('set-enabled', { key: props.k, value: !props.on }); props.onChange() } catch (e) { console.error(e) }
      }
    },
    h('span', { className: 'st-dot', style: { background: props.on ? 'var(--dsw-alias-state-success-primary,#16a34a)' : 'currentColor', opacity: props.on ? 1 : 0.4 } }),
    props.label + ': ' + (props.on ? props.t('on') : props.t('off')))
  }

  function Dashboard() {
    const ud = useDashboard(2500)
    const d = ud[0], refresh = ud[1]
    const L = useLocale()
    const T = function (k, v) { return tr(L, k, v) }
    if (!d) return h('div', { className: 'st-dim' }, T('loading'))
    const t = d.totals || {}
    const c = d.compression || {}
    const cm = d.compaction || { attempts: 0, done: 0, skipped: 0, budgetTok: 0 }
    const avgPrompt = t.requests > 0 ? Math.round(t.estPromptTokens / t.requests) : 0
    const avgAvoided = t.requests > 0 ? Math.round(t.avoidedTokens / t.requests) : 0
    const ratio = c.bytesBefore > 0 ? Math.round((1 - c.bytesAfter / c.bytesBefore) * 100) : 0
    let maxSaved = 1
    for (let i = 0; i < (d.byTool || []).length; i++) maxSaved = Math.max(maxSaved, d.byTool[i].savedBytes)
    return h('div', { className: 'st-wrap' },
      h('div', { className: 'st-row' },
        h('span', { style: { fontWeight: 650, fontSize: 15 } }, 'Token Saver v2'),
        h('span', { className: 'st-dim' }, T('tagline')),
        h('span', { className: 'st-dim' }, T('up', { n: Math.round((d.uptimeSec || 0) / 60) })),
        h('span', { className: 'st-dim' }, d.flags.expandTool ? 'expand-tool ✓' : '')),
      h('div', { className: 'st-row' },
        h(Toggle, { k: 'compress', label: T('toggleCompress'), on: d.flags.compress, onChange: refresh, t: T }),
        h(Toggle, { k: 'dedupe', label: T('toggleDedupe'), on: d.flags.dedupe, onChange: refresh, t: T }),
        h(Toggle, { k: 'compactAssist', label: T('toggleCompact', { n: fmtTok(cm.watermarkTok || cm.budgetTok || 120000) }), on: !!cm.assistOn, onChange: refresh, t: T }),
        h('span', { style: { flex: 1 } }),
        h('button', {
          className: 'st-btn',
          onClick: async function () { try { await apiPost('reset', {}); refresh() } catch (e) { console.error(e) } }
        }, T('reset'))),
      d.spillReady === false
        ? h('div', { className: 'st-card', style: { borderColor: 'var(--dsw-alias-state-error-primary,#b91c1c)' } },
            h('span', { className: 'st-dim' }, T('spillWarn')),
            h('span', { className: 'st-dim' }, d.lastSkip || ''))
        : null,
      h('div', { className: 'st-kpis' },
        h(Kpi, { label: T('kpiRequests'), value: fmtTok((t.requests || 0)), sub: T('kpiRequestsSub', { n: fmtTok(t.auxRequests || 0) }) }),
        h(Kpi, { label: T('kpiIn'), value: fmtTok((t.inputTokens || 0) + (t.cachedTokens || 0)), sub: T('kpiInSub', { n: fmtTok(t.cachedTokens || 0), p: d.cacheHitPct != null ? d.cacheHitPct : 0 }) }),
        h(Kpi, { label: T('kpiOut'), value: fmtTok(t.outputTokens || 0), sub: T('kpiOutSub', { n: fmtTok(t.reasoningTokens || 0) }) }),
        h(Kpi, { label: T('kpiAvoided'), value: fmtTok(t.avoidedTokens || 0), green: true, sub: T('kpiAvoidedSub', { p: d.reliefPct }) })),
      h('div', { className: 'st-card' },
        h('div', { className: 'st-title' }, T('chartTitle')),
        h(Spark, { series: d.series || [], t: T }),
        h('div', { className: 'st-s st-dim', style: { marginTop: 6 } },
          T('chartSub', { a: fmtTok(avgPrompt), b: fmtTok(avgAvoided) }))),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 } },
        h('div', { className: 'st-card' },
          h('div', { className: 'st-title' }, T('cardCompress')),
          h('div', { style: { marginTop: 6 } },
            h('div', null, h('b', null, fmtTok(c.count || 0)), T('cardCompressLine', { r: ratio }))),
          h('div', { className: 'st-s st-dim', style: { marginTop: 4 } },
            fmtBytes(c.bytesBefore || 0) + ' -> ' + fmtBytes(c.bytesAfter || 0)),
          h('div', { className: 'st-s st-dim', style: { marginTop: 2 } },
            T('cardCompressCalls', { n: String(c.topLevelCalls || 0), m: String(c.nestedCalls || 0) }))),
        h('div', { className: 'st-card' },
          h('div', { className: 'st-title' }, T('cardLossless')),
          h('div', { style: { marginTop: 6 } },
            h('div', null, h('b', null, String(c.losslessEncodes || 0)), T('cardLosslessLine'))),
          h('div', { className: 'st-s st-dim', style: { marginTop: 4 } },
            T('cardLosslessSub', { n: String(c.tabularWindows || 0) }))),
        h('div', { className: 'st-card' },
          h('div', { className: 'st-title' }, T('cardDedupe')),
          h('div', { style: { marginTop: 6 } },
            h('div', null, h('b', null, String(c.dedupeHits || 0)), T('cardDedupeStubbed'), h('b', null, String(cm.done || 0)), '/', String(cm.attempts || 0), T('cardDedupeCompactions'))),
          h('div', { className: 'st-s st-dim', style: { marginTop: 4 } },
            T('cardDedupeSub', { b: fmtBytes(c.dedupeSavedBytes || 0), t: fmtTok(cm.watermarkTok || cm.budgetTok || 0) })))),
      h('div', { className: 'st-card' },
        h('div', { className: 'st-title' }, T('topTools')),
        (d.byTool || []).length === 0 ? h('div', { className: 'st-dim', style: { marginTop: 8 } }, T('topToolsEmpty')) :
          h('div', null, (d.byTool || []).map(function (tool) {
            return h('div', { className: 'st-barrow', key: tool.name },
              h('span', { className: 'st-dim', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, tool.name),
              h('div', { className: 'st-bar', style: { width: Math.max(4, Math.round(tool.savedBytes * 100 / maxSaved)) + '%' } }),
              h('span', null, fmtBytes(tool.savedBytes) + ' / ' + tool.count + 'x'))
          }))),
      h('div', { className: 'st-card' },
        h('div', { className: 'st-title' }, T('recent')),
        h('table', { className: 'st-table' }, h('tbody', null, (d.recent || []).map(function (r, ri) {
          const kk = KIND_LABEL[r.kind] || KIND_LABEL.request
          const kc = KIND_COLOR[r.kind] || KIND_COLOR.request
          return h('tr', { key: ri },
            h('td', { className: 'st-dim' }, fmtTime(r.ts, L)),
            h('td', null, h('span', { className: 'st-badge', style: { color: kc, borderColor: kc } }, T(kk))),
            h('td', { style: { fontWeight: 550 } }, r.label),
            h('td', { className: 'st-dim' }, r.detail),
            h('td', { className: 'st-green', style: { textAlign: 'right' } }, r.saved > 0 ? '-' + fmtTok(r.saved) : ''))
        })))),
      h('div', { className: 'st-s st-dim' },
        T('footer')))
  }

  function Strip() {
    const ud = useDashboard(4000)
    const d = ud[0]
    const L = useLocale()
    const T = function (k, v) { return tr(L, k, v) }
    if (!d) return null
    const t = d.totals || {}
    const cc = (d.compression && d.compression.count) || 0
    const ll = (d.compression && d.compression.losslessEncodes) || 0
    return h('div', { className: 'st-strip' },
      h('span', null, 'token-saver'),
      h('span', null, h('b', null, T('stripAvoided', { n: fmtTok(t.avoidedTokens || 0) }))),
      h('span', null, T('stripCompressed', { n: fmtTok(cc) }) + (ll > 0 ? T('stripLossless', { n: ll }) : '')),
      h('span', null, T('stripReqs', { n: fmtTok((t.requests || 0)) })))
  }

  ctx.slots.inject('settings.section', function () {
    ctx.slots.register(
      { name: 'settings.section', id: 'save-token', order: 430, label: 'Token Saver' },
      function () { return h(Dashboard) })
  })
  ctx.slots.inject('conversation.composer.dock', function () {
    ctx.slots.register(
      { name: 'conversation.composer.dock', id: 'save-token-strip', order: 85 },
      function () { return h(Strip) })
  })
}
