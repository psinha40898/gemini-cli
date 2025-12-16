/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import type { LoadableSettingScope } from '../../config/settings.js';
import type {
  SettingsState,
  SettingsContextValue,
} from '../contexts/SettingsContext.js';
import { MessageType } from '../types.js';
import process from 'node:process';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  closeThemeDialog: () => void;
  handleThemeSelect: (themeName: string, scope: LoadableSettingScope) => void;
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  state: SettingsState,
  setThemeError: (error: string | null) => void,
  addItem: UseHistoryManagerReturn['addItem'],
  initialThemeError: string | null,
  setValue?: SettingsContextValue['setValue'],
): UseThemeCommandReturn => {
  const [isThemeDialogOpen, setIsThemeDialogOpen] =
    useState(!!initialThemeError);

  const openThemeDialog = useCallback(() => {
    if (process.env['NO_COLOR']) {
      addItem(
        {
          type: MessageType.INFO,
          text: 'Theme configuration unavailable due to NO_COLOR env variable.',
        },
        Date.now(),
      );
      return;
    }
    setIsThemeDialogOpen(true);
  }, [addItem]);

  const applyTheme = useCallback(
    (themeName: string | undefined) => {
      if (!themeManager.setActiveTheme(themeName)) {
        // If theme is not found, open the theme selection dialog and set error message
        setIsThemeDialogOpen(true);
        setThemeError(`Theme "${themeName}" not found.`);
      } else {
        setThemeError(null); // Clear any previous theme error on success
      }
    },
    [setThemeError],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      applyTheme(themeName);
    },
    [applyTheme],
  );

  const closeThemeDialog = useCallback(() => {
    // Re-apply the saved theme to revert any preview changes from highlighting
    applyTheme(state.merged.ui?.theme);
    setIsThemeDialogOpen(false);
  }, [applyTheme, state]);

  const handleThemeSelect = useCallback(
    (themeName: string, scope: LoadableSettingScope) => {
      try {
        // Merge user and workspace custom themes (workspace takes precedence)
        const mergedCustomThemes = {
          ...(state.user.settings.ui?.customThemes || {}),
          ...(state.workspace.settings.ui?.customThemes || {}),
        };
        // Only allow selecting themes available in the merged custom themes or built-in themes
        const isBuiltIn = themeManager.findThemeByName(themeName);
        const isCustom = themeName && mergedCustomThemes[themeName];
        if (!isBuiltIn && !isCustom) {
          setThemeError(`Theme "${themeName}" not found in selected scope.`);
          setIsThemeDialogOpen(true);
          return;
        }
        setValue?.(scope, 'ui.theme', themeName); // Update the merged settings
        if (state.merged.ui?.customThemes) {
          // Type assertion: loadCustomThemes only reads the data
          themeManager.loadCustomThemes(
            state.merged.ui.customThemes as Parameters<
              typeof themeManager.loadCustomThemes
            >[0],
          );
        }
        applyTheme(state.merged.ui?.theme); // Apply the current theme
        setThemeError(null);
      } finally {
        setIsThemeDialogOpen(false); // Close the dialog
      }
    },
    [applyTheme, state, setThemeError, setValue],
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    closeThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};
