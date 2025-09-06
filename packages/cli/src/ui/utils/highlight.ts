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

export function highlightTokens(
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
