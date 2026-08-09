# Parser pipeline

`index.ts` owns the top-level parse orchestration:

1. preprocess streaming-safe Markdown and tokenize;
2. run `preTransformTokens`;
3. reuse stable top-level nodes and convert the remaining tokens in `nodes/token-to-nodes.ts`;
4. run `postTransformTokens`, reprocessing its returned tokens when required;
5. run the HTML structure passes, final HTML loading cleanup, then `postTransformNodes`.

Dependencies point from `index.ts` to the streaming, reuse, node, and HTML stages. The node stages do not import the parser entry. `token-to-nodes.ts` owns the internal source-range cache and exposes only its range getter to the HTML structure context.
