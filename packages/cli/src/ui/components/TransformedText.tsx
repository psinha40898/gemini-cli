/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Text } from 'ink';
import type { TextProps } from 'ink';
import {
  calculateTransformationsForLine,
  calculateTransformedLine,
} from './shared/text-buffer.js';

/**
 * A Text component that applies display transformations to its content.
 *
 * Currently transforms image paths (e.g., `@/path/to/image.png` → `[Image image.png]`)
 * to provide terse, readable representations of file paths in the UI.
 *
 * This uses the same transformation system as InputPrompt, but always shows
 * the collapsed form (no cursor-based expansion).
 */
interface TransformedTextProps extends Omit<TextProps, 'children'> {
  children: string;
}

export const TransformedText: React.FC<TransformedTextProps> = ({
  children: text,
  ...textProps
}) => {
  const displayText = useMemo(() => {
    const transformations = calculateTransformationsForLine(text);
    if (transformations.length === 0) return text;

    // Pass [-1, -1] as cursor position so no transformation expands
    // (always show the collapsed/terse form)
    const { transformedLine } = calculateTransformedLine(
      text,
      0, // lineIndex
      [-1, -1], // cursor never on this line
      transformations,
    );
    return transformedLine;
  }, [text]);

  return <Text {...textProps}>{displayText}</Text>;
};
