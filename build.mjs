/**
 * dsh-plugin-save-token build script.
 *
 * Both halves are bundled with esbuild so no relative source layout leaks
 * into lib/:
 *
 * - Host half (src/index.js): bundled ESM, platform node → lib/index.js.
 *   `@deepseek-ai/dsh-tools` stays external: official packages are provided
 *   by the profile's pnpm closure at mount time (never declared as deps).
 * - Client half (src/client/index.js): bundled CJS wrapped in the DSH
 *   client-modules handshake → lib/client.js:
 *
 *     window.__ModuleLoader__.load({ id, factory })
 *
 * `react` stays external on the client: the web shell seeds it in the module
 * table, and the loader-provided require resolves it inside the factory.
 */

import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
const id = pkg.name

await mkdir(new URL('./lib/', import.meta.url), { recursive: true })

// --- host half: self-contained ESM bundle ----------------------------------
await build({
  entryPoints: [new URL('./src/index.js', import.meta.url).pathname],
  outfile: new URL('./lib/index.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  external: ['@deepseek-ai/*'],
  legalComments: 'inline',
  sourcemap: 'external',
  minify: false,
})

// --- client half: CJS bundle with __ModuleLoader__ handshake ---------------
await build({
  entryPoints: [new URL('./src/client/index.js', import.meta.url).pathname],
  outfile: new URL('./lib/client.js', import.meta.url).pathname,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  charset: 'utf8',
  external: ['react'],
  legalComments: 'inline',
  sourcemap: 'external',
  minify: false,
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: function (require) {`,
      `var module = { exports: {} }; var exports = module.exports;`,
    ].join('\n'),
  },
  footer: {
    js: `\nreturn module.exports; } });`,
  },
})

// --- post-build self-checks -------------------------------------------------
const client = await readFile(new URL('./lib/client.js', import.meta.url), 'utf8')
if (!client.includes('__ModuleLoader__.load')) {
  throw new Error('build output missing __ModuleLoader__.load handshake')
}
if (!client.includes('require("react")') && !client.includes("require('react')")) {
  throw new Error('client bundle should keep react external (loader-provided require)')
}
// Import the host bundle for real — catches unresolved imports that a
// syntax-only check (node --check) would miss. @deepseek-ai/dsh-tools is
// external, so resolution failure here means the local pnpm closure lacks
// it; that is expected outside a profile and skipped gracefully.
try {
  const host = await import(pathToFileURL(new URL('./lib/index.js', import.meta.url).pathname).href)
  if (typeof host.apply !== 'function' || !Array.isArray(host.inject)) {
    throw new Error('host bundle is missing the plugin face (apply/inject)')
  }
} catch (error) {
  if (!String(error?.message ?? error).includes("@deepseek-ai/dsh-tools")) throw error
  console.warn('[build] note: @deepseek-ai/dsh-tools not resolvable locally (expected outside a dsh profile); face check skipped')
}
console.log(`[${id}] built lib/index.js + lib/client.js`)
