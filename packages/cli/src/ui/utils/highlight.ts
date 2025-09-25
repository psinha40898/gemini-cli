/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transformation } from '../components/shared/text-buffer.js';
import { imagePathRegex as TRANSFORMATION_REGEX } from '../components/shared/text-buffer.js';
import { cpLen, toCodePoints } from './textUtils.js';
import * as path from 'node:path';

export type HighlightToken = {
  text: string;
  type: 'default' | 'command' | 'file';
};

const HIGHLIGHT_REGEX = /(^\/[a-zA-Z0-9_-]+|@(?:\\ |[a-zA-Z0-9_./-])+)/g;



export function parseInputForHighlighting(
  text: string,
  index: number,
  transformations: Transformation[]
): readonly HighlightToken[] {
  if (!text) {
    return [{ text: '', type: 'default' }];
  }

  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  
  // Check if we should process transformations
  const hasTransformations = transformations && transformations.length > 0;
  
  if (hasTransformations) {
    // Process transformation patterns first
    let transformationMatch;
    let transformationIndex = 0;
    
    while ((transformationMatch = TRANSFORMATION_REGEX.exec(text)) !== null) {
      const [fullMatch] = transformationMatch;
      const matchStart = transformationMatch.index;
      
      // Check if this match corresponds to a transformation at the current index
      if (transformationIndex < transformations.length) {
        const transformation = transformations[transformationIndex];
        
        // Verify that the matchStart aligns with logStart
        if (matchStart === transformation.logStart) {
          // Add text before the transformation as default token
          if (matchStart > lastIndex) {
            tokens.push({
              text: text.slice(lastIndex, matchStart),
              type: 'default',
            });
          }
          
          // Add the transformation token
          tokens.push({
            text: fullMatch,
            type: 'file',
          });
          
          lastIndex = matchStart + fullMatch.length;
          transformationIndex++;
        }
      }
    }
    
    // Reset regex for next phase
    TRANSFORMATION_REGEX.lastIndex = 0;
  }
  
  // Process regular highlighting patterns
  let match;
  while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
    const [fullMatch] = match;
    const matchIndex = match.index;
    
    // Skip if this area was already processed by transformations
    if (matchIndex < lastIndex) {
      continue;
    }
    
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
