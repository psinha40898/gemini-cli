/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';
import type { SettingsState } from '../contexts/SettingsContext.js';

export const isAlternateBufferEnabled = (settings: SettingsState): boolean =>
  settings.merged.ui?.useAlternateBuffer === true;

export const useAlternateBuffer = (): boolean => {
  const { state } = useSettings();
  return isAlternateBufferEnabled(state);
};
