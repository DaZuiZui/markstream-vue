import type { EnhanceAppContext } from 'vitepress'
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client'
import MarkdownRender, { createKaTeXWorkerFromCDN, createMermaidWorkerFromCDN, setInfographicLoader, setKaTeXWorker, setMermaidWorker } from 'markstream-vue'
import Theme from 'vitepress/theme'
import GitHubStarBadge from './GitHubStarBadge.vue'
import Layout from './Layout.vue'
import NextStep from './NextStep.vue'
import PrereqChips from './PrereqChips.vue'
import SupportQRCodes from './SupportQRCodes.vue'
import '@shikijs/vitepress-twoslash/style.css'
import 'markstream-vue/index.css'
import 'katex/dist/katex.min.css'
import './style.css'

export default {
  extends: Theme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue)
    app.component('GitHubStarBadge', GitHubStarBadge)
    app.component('MarkdownRender', MarkdownRender)
    app.component('SupportQRCodes', SupportQRCodes)
    app.component('PrereqChips', PrereqChips)
    app.component('NextStep', NextStep)
    // Let gallery previews render infographic blocks; the peer is loaded
    // lazily, only when an infographic node actually mounts.
    setInfographicLoader(() => import('@antv/infographic'))
    // Math nodes render through a KaTeX worker when one is injected; without
    // it they log a worker error and fall back to sync rendering. Build the
    // worker from CDN sources at runtime (no bundler worker plumbing, and
    // SSG-safe because it only runs in the browser).
    if (typeof window !== 'undefined') {
      const katexHandle = createKaTeXWorkerFromCDN({
        katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.js',
        mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/contrib/mhchem.min.js',
      })
      if (katexHandle.worker)
        setKaTeXWorker(katexHandle.worker)

      // Mermaid parsing runs through a worker when one is injected; without
      // it diagram rendering logs a worker error per diagram.
      const mermaidHandle = createMermaidWorkerFromCDN({
        mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11.12.2/dist/mermaid.esm.min.mjs',
      })
      if (mermaidHandle.worker)
        setMermaidWorker(mermaidHandle.worker)
    }
  },
}

// Export useDark for use in VitePress markdown files and components
export { useDark } from './composables/useDark'
