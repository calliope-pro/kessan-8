// 印のキー (#28 の viewer-port.ts と同じ形)。数字・文・見出し・単位・グラフのセルは data-path と同じ文字列、行の名前は <doc>.item:<項目キー>。
import type { DocKind } from '../../domain/types';

export const cellMarkKey = (doc: DocKind, path: string): string => `${doc}.${path}`;
export const itemMarkKey = (doc: DocKind, itemKey: string): string => `${doc}.item:${itemKey}`;
