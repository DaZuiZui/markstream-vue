---
title: 2.0.0 Roadmap
description: markstream-vue 2.0.0 roadmap and task checklist. Tracks the breaking changes, release validation, runtime verification, and leftover cleanup planned for 2.0.
keywords:
  - markstream 2.0 roadmap
  - breaking changes
  - run-time verification
  - release validation
---

# 2.0.0 Roadmap

`markstream-vue@2.0.0` is a breaking major release. This page is the living roadmap for the 2.0 scope: each goal carries a task checklist, completed items point at their commit/PR, and the same checklist is tracked on GitHub under the `2.0.0` milestone.

## Goal 1: Remove Monaco and stream-markdown, keep only `stream-diffs` ✅

The 2.0 headline breaking change: the Monaco-based code block API and the Shiki-based `stream-markdown` renderer are removed. Code blocks are rendered by `stream-diffs` only (or a plain `<pre>` fallback when the optional peer is absent).

Tracked in [issue #615](https://github.com/Simon-He95/markstream-vue/issues/615) and merged into the `2.0.0` integration branch by [PR #619](https://github.com/Simon-He95/markstream-vue/pull/619).

- [x] Replace `monacoOptions` / `codeBlockMonacoOptions` with the shared `codeBlockOptions` / `CodeBlockOptions` contract across all six adapters; remove Monaco-only public types
- [x] Delete the `stream-markdown` `MarkdownCodeBlockNode` component and its styles
- [x] Remove `codeRenderer`, `markdownCodeRenderer`, and `NodeRendererCodeRenderer`; use `stream-diffs` automatically, `renderCodeBlocksAsPre` for plain output, and scoped custom components for replacement renderers
- [x] Use renderer-neutral public identifiers (`CodeBlockTheme`, `CodeBlockThemePair`, `CodeBlockOptions`, `resolveLanguageId`, `preloadCodeBlockRuntime`) without exposing the raw runtime module
- [x] Migrate vue2 / react / svelte / angular / octane to stream-diffs only
- [x] Update tests and snapshots; full suite green (313 files / 2684 tests)
- [x] Clean playgrounds (deps, vite config, sandbox pages)
- [x] Update documentation (en + zh), LLM docs, package descriptions

## Goal 2: Parser reliability and maintainability ✅

The neutral 2.0 parser work is tracked independently from the renderer removal in [issue #625](https://github.com/Simon-He95/markstream-vue/issues/625). Internal runtime ownership and reset lifecycle are tracked in [issue #633](https://github.com/Simon-He95/markstream-vue/issues/633).

The nine incremental parser changes were merged into `2.0.0` in dependency order through PRs [#635](https://github.com/Simon-He95/markstream-vue/pull/635), [#636](https://github.com/Simon-He95/markstream-vue/pull/636), [#637](https://github.com/Simon-He95/markstream-vue/pull/637), [#638](https://github.com/Simon-He95/markstream-vue/pull/638), [#639](https://github.com/Simon-He95/markstream-vue/pull/639), [#640](https://github.com/Simon-He95/markstream-vue/pull/640), [#641](https://github.com/Simon-He95/markstream-vue/pull/641), [#642](https://github.com/Simon-He95/markstream-vue/pull/642), and [#643](https://github.com/Simon-He95/markstream-vue/pull/643). They freeze correctness, API, allocation, and performance gates before separating parser stages and tightening stream lifecycle ownership.

### Parser options migration

2.0 removes the parser-only options interface that was previously exported from the package root. Application code should type parser configuration as `ParseOptions`. The formerly undocumented structured-reuse and timing instrumentation fields are now official as `reuseStableTopLevelNodes` and `parserMetrics`; all other cursor, fragment, and stream-control flags remain internal and have no public replacement. `ParserRuntime` and `ParseContext` are implementation details, not a Session API.

## Goal 3: 2.0.0 release validation

Get the breaking release through the normal release gates before publishing.

- [x] Run the full library build (`pnpm build`) and DTS generation
- [x] `pnpm test:api:strict` (public API snapshot, exports, subpath isolation)
- [x] Framework smoke tests: react / octane / vue2-cjs / minimal / pack (optional peers)
- [x] Reconcile `check:peer-deps` for workspace-root optional peers
- [x] Prepare coordinated `2.0.0-beta.1` package versions, release notes, and the [2.0 migration guide](/guide/migration-2-0); publish the beta before promoting the same matrix to stable versions

### Release-operator handoff

These registry operations require npm maintainer credentials; the beta-phase steps are complete, and the stable-release dist-tag cutover is automated by `node scripts/release-stable-family.mjs --publish`:

- [x] Preserved the 1.x prerelease channel with `npm dist-tag add markstream-vue@1.1.2-beta.3 legacy-next`.
- [x] Published the coordinated beta family (`2.0.0-beta.1` … `2.0.0-beta.3`) from `release:family:preflight` + `publish:*:current` and verified real installs of the published packages.
- [x] Stable cutover: tags pushed by `release-stable-family.mjs` trigger the Release (Stable) workflow, which moves each package's previous `latest` to `legacy` via `resolve-dist-tag` (exact `npm dist-tag add` commands are printed on refusal).

The registry-only `npm dist-tag add` command does not depend on a Git checkout. `release:family:preflight` and the `publish:*:current` scripts live on `main`; the preflight checks every candidate dist-tag before any package is published and fails with the required command if an alias is missing.

## Goal 4: Runtime visual verification

The stream-diffs handoff is verified in real browsers as well as by unit and type checks.

- [x] Playground: code-block height sync, diff theme switching, inline vs side-by-side behavior
- [x] `test:e2e:octane-playground` green against stream-diffs selectors
- [x] Svelte diff color mapping on `.is-diff .code-block-body`

## Goal 5: Leftover cleanup (low priority)

Small consistency cleanups that were intentionally left out of Goal 1.

- [x] Rename internal Monaco-named variables in svelte / react / vue2 packages (for example, `resolvedMonacoOptions`)
- [x] Update manual e2e debug scripts to use stream-diffs selectors and repository-relative paths
- [x] Remove the unused `langs` field from react / vue2 code block theme types
- [x] Record the known pre-existing typecheck issues outside the 2.0 scope: the Vue2 package's direct `vue-tsc` run reaches `markstream-core` outside its `rootDir` (TS6059) and uses `import.meta.env` in `HtmlPreviewFrame.vue`

## Related

- GitHub milestone: `2.0.0`
- Roadmap checklist: [issue #618](https://github.com/Simon-He95/markstream-vue/issues/618)
- Migration guide: [Migrate from 1.x to 2.0](/guide/migration-2-0)
- 1.0 baseline: [1.0 Release Readiness](/guide/release-1-0)
