# CodeBlockNode (component)

`CodeBlockNode` renders interactive code blocks with the optional `stream-diffs` peer and a flexible header API with slots and events.

Quick example — inline usage (falls back to plain code when `stream-diffs` is not installed):

```vue
<CodeBlockNode :node="{ type: 'code_block', language: 'js', code: 'console.log(1)', raw: 'console.log(1)' }" />
```

Header override example:

```vue
<CodeBlockNode :node="node" :showCopyButton="false">
  <template #header-left>
    <div class="text-sm font-medium">My snippet</div>
  </template>
  <template #header-right>
    <button @click="run">Run</button>
  </template>
</CodeBlockNode>
```

Docs and usage examples:
- Docs: /guide/code-block-node
- Header API: /guide/codeblock-header
