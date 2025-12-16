/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { LoadableSettingScope } from '../../config/settings.js';
import { MessageType } from '../types.js';
import type { EditorType } from '@google/gemini-cli-core';
import {
  allowEditorTypeInSandbox,
  checkHasEditorType,
  getEditorDisplayName,
} from '@google/gemini-cli-core';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

import { SettingPaths } from '../../config/settingPaths.js';
import type { SettingsContextValue } from '../contexts/SettingsContext.js';

interface UseEditorSettingsReturn {
  isEditorDialogOpen: boolean;
  openEditorDialog: () => void;
  handleEditorSelect: (
    editorType: EditorType | undefined,
    scope: LoadableSettingScope,
  ) => void;
  exitEditorDialog: () => void;
}

export const useEditorSettings = (
  setValue: SettingsContextValue['setValue'],
  setEditorError: (error: string | null) => void,
  addItem: UseHistoryManagerReturn['addItem'],
): UseEditorSettingsReturn => {
  const [isEditorDialogOpen, setIsEditorDialogOpen] = useState(false);

  const openEditorDialog = useCallback(() => {
    setIsEditorDialogOpen(true);
  }, []);

  const handleEditorSelect = useCallback(
    (editorType: EditorType | undefined, scope: LoadableSettingScope) => {
      if (
        editorType &&
        (!checkHasEditorType(editorType) ||
          !allowEditorTypeInSandbox(editorType))
      ) {
        return;
      }

      try {
        setValue(scope, SettingPaths.General.PreferredEditor, editorType);
        addItem(
          {
            type: MessageType.INFO,
            text: `Editor preference ${editorType ? `set to "${getEditorDisplayName(editorType)}"` : 'cleared'} in ${scope} settings.`,
          },
          Date.now(),
        );
        setEditorError(null);
        setIsEditorDialogOpen(false);
      } catch (error) {
        setEditorError(`Failed to set editor preference: ${error}`);
      }
    },
    [setValue, setEditorError, addItem],
  );

  const exitEditorDialog = useCallback(() => {
    setIsEditorDialogOpen(false);
  }, []);

  return {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  };
};
