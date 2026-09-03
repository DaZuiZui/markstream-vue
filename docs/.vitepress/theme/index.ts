import type { EnhanceAppContext } from 'vitepress'
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client'
import MarkdownRender, { setInfographicLoader } from 'markstream-vue'
import Theme from 'vitepress/theme'
import GitHubStarBadge from './GitHubStarBadge.vue'
import Layout from './Layout.vue'
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
    // Let gallery previews render infographic blocks; the peer is loaded
    // lazily, only when an infographic node actually mounts.
    setInfographicLoader(() => import('@antv/infographic'))
  },
}

// Export useDark for use in VitePress markdown files and components
export { useDark } from './composables/useDark'
