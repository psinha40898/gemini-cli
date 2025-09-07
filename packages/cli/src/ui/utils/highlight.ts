/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cpLen } from './textUtils.js';

export type HighlightToken = {
  text: string;
  type: 'default' | 'command' | 'file';
};

export type HighlightRange = {
  start: number;
  end: number;
};

const HIGHLIGHT_REGEX = /(^\/[a-zA-Z0-9_-]+|@(?:\\ |[a-zA-Z0-9_./-])+)/g;

export function parseInputForHighlighting(
  text: string,
  index: number,
): readonly HighlightToken[] {
  if (!text) {
    return [{ text: '', type: 'default' }];
  }

  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  let match;

  while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
    const [fullMatch] = match;
    const matchIndex = match.index;

    // Add the text before the match as a default token
    if (matchIndex > lastIndex) {
      tokens.push({
        text: text.slice(lastIndex, matchIndex),
        type: 'default',
      });
    }

    // Add the matched token
    const type = fullMatch.startsWith('/') ? 'command' : 'file';
    // Only highlight slash commands if the index is 0.
    if (type === 'command' && index !== 0) {
      tokens.push({
        text: fullMatch,
        type: 'default',
      });
    } else {
      tokens.push({
        text: fullMatch,
        type,
      });
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    tokens.push({
      text: text.slice(lastIndex),
      type: 'default',
    });
  }

  return tokens;
}

export function parseInputForHighlightingWithRanges(
  text: string,
  index: number,
): {
  tokens: readonly HighlightToken[];
  ranges: HighlightRange[];
  totalLen: number;
} {
  if (!text) {
    return { tokens: [{ text: '', type: 'default' }], ranges: [], totalLen: 0 };
  }

  const tokens: HighlightToken[] = [];
  const ranges: HighlightRange[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let offset = 0; // code-point offset across the line

  while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
    const [fullMatch] = match;
    const matchIndex = match.index;

    // Text before the match (default)
    if (matchIndex > lastIndex) {
      const before = text.slice(lastIndex, matchIndex);
      tokens.push({ text: before, type: 'default' });
      offset += cpLen(before);
    }

    // Matched token
    const rawType: HighlightToken['type'] = fullMatch.startsWith('/')
      ? 'command'
      : 'file';
    const effectiveType: HighlightToken['type'] =
      rawType === 'command' && index !== 0 ? 'default' : rawType;

    tokens.push({ text: fullMatch, type: effectiveType });

    const len = cpLen(fullMatch);
    if ((effectiveType === 'command' || effectiveType === 'file') && len > 0) {
      ranges.push({ start: offset, end: offset + len });
    }
    offset += len;

    lastIndex = matchIndex + fullMatch.length;
  }

  // Trailing text (default)
  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex);
    tokens.push({ text: tail, type: 'default' });
    offset += cpLen(tail);
  }

  return { tokens, ranges, totalLen: offset };
}

export function calculateHighlightMask(
  tokens: readonly HighlightToken[],
): boolean[] {
  const totalLen = tokens.reduce((sum, t) => sum + cpLen(t.text), 0);
  const mask: boolean[] = new Array(totalLen).fill(false);

  let offset = 0;
  for (const token of tokens) {
    const len = cpLen(token.text);
    const shouldColor = token.type === 'command' || token.type === 'file';
    if (shouldColor) {
      for (let j = 0; j < len; j++) {
        const idx = offset + j;
        if (idx >= 0 && idx < mask.length) {
          mask[idx] = true;
        }
      }
    }
    offset += len;
  }
  return mask;
}
