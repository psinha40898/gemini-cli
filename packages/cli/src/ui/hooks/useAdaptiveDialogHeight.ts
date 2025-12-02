/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';

interface AdaptiveDialogHeightOptions {
  /** Current terminal height in rows */
  terminalHeight: number;
  /** The number of content rows the dialog needs to display everything */
  naturalContentHeight: number;
  /** Minimum height when in constrained/scrollable mode (default: 8) */
  minScrollableHeight?: number;
  /** Extra chrome (borders + padding), default: 4 */
  chromeHeight?: number;
}

/**
 * Calculates dialog height with "natural-first, constrained-second" strategy:
 * - Returns undefined when terminal is large enough (use intrinsic height)
 * - Returns constrained number when terminal is too small (enable scrolling)
 *
 * This preserves main-branch behavior (content behind clips first) while
 * enabling alt-buffer scrolling only when truly needed.
 *
 * @example
 * ```tsx
 * const dialogHeight = useAdaptiveDialogHeight({
 *   terminalHeight,
 *   naturalContentHeight: flattenedData.length + 3,
 *   minScrollableHeight: 10,
 * });
 *
 * return (
 *   <Box height={dialogHeight}>
 *     {dialogHeight !== undefined ? (
 *       <ScrollableList ... />
 *     ) : (
 *       // Render intrinsic content
 *     )}
 *   </Box>
 * );
 * ```
 */
export function useAdaptiveDialogHeight({
  terminalHeight,
  naturalContentHeight,
  minScrollableHeight = 8,
  chromeHeight = 4,
}: AdaptiveDialogHeightOptions): number | undefined {
  return useMemo(() => {
    const naturalDialogHeight = naturalContentHeight + chromeHeight;

    // Large terminal: use natural/intrinsic height
    if (terminalHeight >= naturalDialogHeight) {
      return undefined;
    }

    // Small terminal: constrain and enable scrolling
    return Math.max(minScrollableHeight, terminalHeight - chromeHeight);
  }, [terminalHeight, naturalContentHeight, minScrollableHeight, chromeHeight]);
}
