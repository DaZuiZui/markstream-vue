import type { AdmonitionNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types';
export declare function parseBasicBlockToken(tokens: MarkdownToken[], index: number, options?: ParseOptions): [ParsedNode, number] | null;
type ContainerParser = (tokens: MarkdownToken[], index: number, options?: ParseOptions) => [AdmonitionNode, number];
type ContainerMatcher = (tokens: MarkdownToken[], index: number, options?: ParseOptions) => [AdmonitionNode, number] | null;
export declare function parseCommonBlockToken(tokens: MarkdownToken[], index: number, options?: ParseOptions, handlers?: {
    parseContainer?: ContainerParser;
    matchAdmonition?: ContainerMatcher;
}): [ParsedNode, number] | null;
export {};
