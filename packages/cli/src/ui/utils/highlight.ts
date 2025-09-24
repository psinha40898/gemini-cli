/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cpLen, cpSlice, toCodePoints } from './textUtils.js';
import * as path from 'node:path';

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

/**
 * Builds highlight segments for a visual slice that has already undergone
 * transformations (e.g., collapsed image paths). The returned segments' text
 * comes from the transformed display slice, while segment types are derived
 * from the original logical tokens via the transformed-to-logical map.
 */
export function parseSegmentsFromTokens(
  tokens: readonly HighlightToken[],
  displayText: string,
  displayStartInTransformed: number,
  transformedToLogicalMapForLine: number[],
): readonly HighlightToken[] {
  if (!displayText) return [];

  // Precompute logical token ranges [start, end) in code-point coordinates
  const tokenRanges: Array<{
    start: number;
    end: number;
    type: HighlightToken['type'];
  }> = [];
  {
    let tokenCpStart = 0;
    for (const t of tokens) {
      const len = cpLen(t.text);
      tokenRanges.push({
        start: tokenCpStart,
        end: tokenCpStart + len,
        type: t.type,
      });
      tokenCpStart += len;
    }
  }

  const cps = toCodePoints(displayText);
  const segments: HighlightToken[] = [];

  let currentType: HighlightToken['type'] | null = null;
  let currentText = '';
  let rangeIdx = 0;

  for (let i = 0; i < cps.length; i++) {
    const mapIdx = displayStartInTransformed + i;
    // Map index must be within the mapping for real characters; the mapping
    // is typically length (transformedLen + 1), where the last entry maps past
    // the end-of-line. Clamp to valid range.
    const safeMapIdx = Math.max(
      0,
      Math.min(mapIdx, transformedToLogicalMapForLine.length - 1),
    );
    const logicalCol = transformedToLogicalMapForLine[safeMapIdx] ?? 0;

    // Advance rangeIdx until the token range could contain logicalCol
    while (
      rangeIdx < tokenRanges.length &&
      logicalCol >= tokenRanges[rangeIdx].end
    ) {
      rangeIdx++;
    }

    let type: HighlightToken['type'] = 'default';
    if (rangeIdx < tokenRanges.length) {
      const r = tokenRanges[rangeIdx];
      if (logicalCol >= r.start && logicalCol < r.end) {
        type = r.type;
      }
    }

    const ch = cps[i];
    if (currentType === type) {
      currentText += ch;
    } else {
      if (currentText.length > 0 && currentType !== null) {
        segments.push({ text: currentText, type: currentType });
      }
      currentType = type;
      currentText = ch;
    }
  }

  if (currentText.length > 0 && currentType !== null) {
    segments.push({ text: currentText, type: currentType });
  }

  return segments;
}


export function getTersePath(filePath: string): string {
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
