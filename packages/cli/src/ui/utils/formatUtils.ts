/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

/**
 * Takes a file path and returns a terse representation for display.
 * e.g., @/path/to/image.png -> [Image image.png]
 */
export function getTersePath(filePath: string): string {
  const fileName = path.basename(filePath);
  return `[Image ${fileName}]`;
}
