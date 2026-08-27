import { defineAsyncComponent } from 'vue'

export const StructuredNodeRenderer = defineAsyncComponent({
  loader: () => import('../NodeRenderer'),
  suspensible: false,
})
