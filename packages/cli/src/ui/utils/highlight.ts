/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transformation } from '../components/shared/text-buffer.js';
import { cpLen, cpSlice } from './textUtils.js';
import * as path from 'node:path';

export type HighlightToken = {
  text: string;
  type: 'default' | 'command' | 'file';
};

const HIGHLIGHT_REGEX = /(^\/[a-zA-Z0-9_-]+|@(?:\\ |[a-zA-Z0-9_./-])+)/g;


export function parseInputForHighlighting(
  text: string,
  index: number,
  transformations: Transformation[] = [],
  /**
   * Optional: logical cursor column within this *same* line. If provided,
   * transformations that cover this column will be expanded (show the raw
   * logicalText). When undefined, all transformations remain collapsed.
   */
  cursorCol?: number,
): readonly HighlightToken[] {
  // Ensure regex states are reset for each call – they are global /g patterns.
  HIGHLIGHT_REGEX.lastIndex = 0;


  if (!text) {
    return [{ text: '', type: 'default' }];
  }

  // Highlight a plain segment (without any transformations inside)
  const highlightPlain = (segment: string): HighlightToken[] => {
    const out: HighlightToken[] = [];
    if (!segment) return out;

    HIGHLIGHT_REGEX.lastIndex = 0;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = HIGHLIGHT_REGEX.exec(segment)) !== null) {
      const [fullMatch] = match;
      const matchIndex = match.index;

      if (matchIndex > last) {
        out.push({ text: segment.slice(last, matchIndex), type: 'default' });
      }

      const type = fullMatch.startsWith('/') ? 'command' : 'file';
      if (type === 'command' && index !== 0) {
        out.push({ text: fullMatch, type: 'default' });
      } else {
        out.push({ text: fullMatch, type });
      }

      last = matchIndex + fullMatch.length;
    }

    if (last < segment.length) {
      out.push({ text: segment.slice(last), type: 'default' });
    }

    return out;
  };

  const tokens: HighlightToken[] = [];

  // Walk across the logical string by transformation spans
  let column = 0;
  const sortedTransformations = (transformations ?? [])
    .slice()
    .sort((a, b) => a.logStart - b.logStart);

  for (const transformation of sortedTransformations) {
    // Plain text before this transformation
    const before = cpSlice(text, column, transformation.logStart);
    tokens.push(...highlightPlain(before));

    // Transformation itself (expanded on cursor)
    const isCursorInside =
      typeof cursorCol === 'number' &&
      cursorCol >= transformation.logStart &&
      cursorCol <= transformation.logEnd;
    const displayText = isCursorInside ? transformation.logicalText : transformation.transformedText;
    tokens.push({ text: displayText, type: 'file' });

    column = transformation.logEnd;
  }

  // Plain text after the last transformation
  const trailing = cpSlice(text, column);
  tokens.push(...highlightPlain(trailing));
console.log(tokens);
  return tokens;
}

export function parseSegmentsFromTokens(
  tokens: readonly HighlightToken[],
  sliceStart: number,
  sliceEnd: number,
): readonly HighlightToken[] {
  if (sliceStart >= sliceEnd) return [];

  const segments: HighlightToken[] = [];
  let tokenCpStart = 0;

  for (const token of tokens) {
    const tokenLen = cpLen(token.text);
    const tokenStart = tokenCpStart;
    const tokenEnd = tokenStart + tokenLen;

    const overlapStart = Math.max(tokenStart, sliceStart);
    const overlapEnd = Math.min(tokenEnd, sliceEnd);
    if (overlapStart < overlapEnd) {
      const sliceStartInToken = overlapStart - tokenStart;
      const sliceEndInToken = overlapEnd - tokenStart;
      const rawSlice = cpSlice(token.text, sliceStartInToken, sliceEndInToken);

      const last = segments[segments.length - 1];
      if (last && last.type === token.type) {
        last.text += rawSlice;
      } else {
        segments.push({ type: token.type, text: rawSlice });
      }
    }

    tokenCpStart += tokenLen;
  }

  return segments;
}

export function getTransformedImagePath(filePath: string): string {
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const maxBaseLength = 10;

  const truncatedBase =
    baseName.length > maxBaseLength
      ? `...${baseName.slice(-maxBaseLength)}`
      : baseName;

  return `[Image ${truncatedBase}${extension}]`;
}
