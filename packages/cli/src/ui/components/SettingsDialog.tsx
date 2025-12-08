/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useReducer, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { AsyncFzf } from 'fzf';
import { theme } from '../semantic-colors.js';
import type { LoadableSettingScope , SettingScope } from '../../config/settings.js';
import {
  getScopeItems,
  getScopeMessageForSetting,
} from '../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import {
  getDialogSettingKeys,
  setPendingSettingValue,
  getDisplayValue,
  saveModifiedSettings,
  getSettingDefinition,
  isDefaultValue,
  requiresRestart,
  getDefaultValue,
  setPendingSettingValueAny,
  getNestedValue,
  getEffectiveValue,
} from '../../utils/settingsUtils.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import chalk from 'chalk';
import { cpSlice, cpLen, stripUnsafeCharacters } from '../utils/textUtils.js';
import {
  type SettingsValue,
  TOGGLE_TYPES,
} from '../../config/settingsSchema.js';
import { debugLogger } from '@google/gemini-cli-core';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { Config } from '@google/gemini-cli-core';
import { useUIState } from '../contexts/UIStateContext.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { TextInput } from './shared/TextInput.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useInlineEdit } from '../hooks/useInlineEdit.js';
import {
  settingsDialogReducer,
  createInitialState,
  type PendingValue,
} from './settingsDialogReducer.js';

interface FzfResult {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[];
}

interface SettingsDialogProps {
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
  availableTerminalHeight?: number;
  config?: Config;
}

const maxItemsToShow = 8;

export function SettingsDialog({
  onSelect,
  onRestartRequest,
  availableTerminalHeight,
  config,
}: SettingsDialogProps): React.JSX.Element {
  // Get vim mode context to sync vim mode changes
  const { vimEnabled, toggleVimEnabled } = useVimMode();
  const settingsContext = useSettings();
  const { merged, raw, updateSetting } = settingsContext;

  // ============================================================================
  // State Management via useReducer (Phase 2)
  // ============================================================================
  const [state, dispatch] = useReducer(
    settingsDialogReducer,
    undefined,
    createInitialState,
  );

  // Destructure for convenience (Phase 3: renamed from globalPendingChanges)
  const {
    focusSection,
    selectedScope,
    activeSettingIndex,
    scrollOffset,
    searchQuery,
    filteredKeys,
    unsavedRestartChanges,
  } = state;

  // ============================================================================
  // Inline Edit State (Phase 1: extracted to hook)
  // ============================================================================
  const { editState, startEdit, updateBuffer, moveCursor, clearEdit } =
    useInlineEdit();

  const {
    key: editingKey,
    buffer: editBuffer,
    cursorPos: editCursorPos,
    cursorVisible,
  } = editState;

  // ============================================================================
  // Search Setup
  // ============================================================================
  const { fzfInstance, searchMap } = useMemo(() => {
    const keys = getDialogSettingKeys();
    const map = new Map<string, string>();
    const searchItems: string[] = [];

    keys.forEach((key) => {
      const def = getSettingDefinition(key);
      if (def?.label) {
        searchItems.push(def.label);
        map.set(def.label.toLowerCase(), key);
      }
    });

    const fzf = new AsyncFzf(searchItems, {
      fuzzy: 'v2',
      casing: 'case-insensitive',
    });
    return { fzfInstance: fzf, searchMap: map };
  }, []);

  // Perform search
  useEffect(() => {
    let active = true;
    if (!searchQuery.trim() || !fzfInstance) {
      dispatch({ type: 'SET_FILTERED_KEYS', keys: getDialogSettingKeys() });
      return;
    }

    const doSearch = async () => {
      const results = await fzfInstance.find(searchQuery);

      if (!active) return;

      const matchedKeys = new Set<string>();
      results.forEach((res: FzfResult) => {
        const key = searchMap.get(res.item.toLowerCase());
        if (key) matchedKeys.add(key);
      });
      dispatch({ type: 'SET_FILTERED_KEYS', keys: Array.from(matchedKeys) });
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    doSearch();

    return () => {
      active = false;
    };
  }, [searchQuery, fzfInstance, searchMap]);

  // ============================================================================
  // Derived State (Phase 3: renamed variables for clarity)
  // Derive display state from the single source of truth (unsavedRestartChanges)
  // - previewSettings: What settings will look like with pending changes applied
  // - pendingKeys: Keys that have unsaved changes
  // - restartRequiredKeys: Subset of pendingKeys that require restart
  // - showRestartPrompt: Whether to show the restart prompt
  // ============================================================================
  const {
    previewSettings,
    pendingKeys,
    restartRequiredKeys,
    showRestartPrompt,
  } = useMemo(() => {
    // Base settings for selected scope
    let updated = structuredClone(
      settingsContext.raw.forScope(selectedScope).settings,
    );
    const newPendingKeys = new Set<string>();
    const newRestartRequiredKeys = new Set<string>();

    // Apply all unsaved restart-required changes
    for (const [key, value] of unsavedRestartChanges.entries()) {
      const def = getSettingDefinition(key);
      if (def?.type === 'boolean' && typeof value === 'boolean') {
        updated = setPendingSettingValue(key, value, updated);
      } else if (
        (def?.type === 'number' && typeof value === 'number') ||
        (def?.type === 'string' && typeof value === 'string')
      ) {
        updated = setPendingSettingValueAny(key, value, updated);
      }
      newPendingKeys.add(key);
      if (requiresRestart(key)) {
        newRestartRequiredKeys.add(key);
      }
    }

    return {
      previewSettings: updated,
      pendingKeys: newPendingKeys,
      restartRequiredKeys: newRestartRequiredKeys,
      showRestartPrompt: newRestartRequiredKeys.size > 0,
    };
  }, [settingsContext, selectedScope, unsavedRestartChanges]);

  const generateSettingsItems = () => {
    const settingKeys = searchQuery ? filteredKeys : getDialogSettingKeys();

    return settingKeys.map((key: string) => {
      const definition = getSettingDefinition(key);

      return {
        label: definition?.label || key,
        value: key,
        type: definition?.type,
        toggle: () => {
          if (!TOGGLE_TYPES.has(definition?.type)) {
            return;
          }
          const currentValue = getEffectiveValue(key, previewSettings, {});
          let newValue: SettingsValue;
          if (definition?.type === 'boolean') {
            newValue = !(currentValue as boolean);
          } else if (definition?.type === 'enum' && definition.options) {
            const options = definition.options;
            const currentIndex = options?.findIndex(
              (opt) => opt.value === currentValue,
            );
            if (currentIndex !== -1 && currentIndex < options.length - 1) {
              newValue = options[currentIndex + 1].value;
            } else {
              newValue = options[0].value; // loop back to start.
            }
          }

          if (!requiresRestart(key)) {
            debugLogger.log(
              `[DEBUG SettingsDialog] Saving ${key} immediately with value:`,
              newValue,
            );
            updateSetting(selectedScope, key, newValue);

            // Special handling for vim mode to sync with VimModeContext
            if (key === 'general.vimMode' && newValue !== vimEnabled) {
              toggleVimEnabled().catch((error) => {
                console.error('Failed to toggle vim mode:', error);
              });
            }

            if (key === 'general.previewFeatures') {
              config?.setPreviewFeatures(newValue as boolean);
            }

            // Remove from unsavedRestartChanges if it was there (useMemo will derive the rest)
            dispatch({ type: 'REMOVE_PENDING_CHANGE', key });
          } else {
            // Track in unsavedRestartChanges - useMemo will derive pendingKeys, showRestartPrompt, etc.
            debugLogger.log(
              `[DEBUG SettingsDialog] Tracking ${key} as pending change with value:`,
              newValue,
            );
            dispatch({
              type: 'ADD_PENDING_CHANGE',
              key,
              value: newValue as PendingValue,
            });
          }
        },
      };
    });
  };

  const items = generateSettingsItems();

  // commitEdit uses the inline edit hook's state and clearEdit
  const commitEdit = (key: string) => {
    const definition = getSettingDefinition(key);
    const type = definition?.type;

    if (editBuffer.trim() === '' && type === 'number') {
      // Nothing entered for a number; cancel edit
      clearEdit();
      return;
    }

    let parsed: string | number;
    if (type === 'number') {
      const numParsed = Number(editBuffer.trim());
      if (Number.isNaN(numParsed)) {
        // Invalid number; cancel edit
        clearEdit();
        return;
      }
      parsed = numParsed;
    } else {
      // For strings, use the buffer as is.
      parsed = editBuffer;
    }

    if (!requiresRestart(key)) {
      // Save immediately - no need to track in unsavedRestartChanges
      updateSetting(selectedScope, key, parsed);

      // Remove from unsavedRestartChanges if present (useMemo will derive the rest)
      dispatch({ type: 'REMOVE_PENDING_CHANGE', key });
    } else {
      // Track in unsavedRestartChanges - useMemo will derive pendingKeys, showRestartPrompt, etc.
      dispatch({
        type: 'ADD_PENDING_CHANGE',
        key,
        value: parsed as PendingValue,
      });
    }

    clearEdit();
  };

  // Scope selector items
  const scopeItems = getScopeItems().map((item) => ({
    ...item,
    key: item.value,
  }));

  const handleScopeHighlight = (scope: LoadableSettingScope) => {
    dispatch({ type: 'SET_SCOPE', scope });
  };

  const handleScopeSelect = (scope: LoadableSettingScope) => {
    handleScopeHighlight(scope);
    dispatch({ type: 'SET_FOCUS', section: 'settings' });
  };

  // Height constraint calculations similar to ThemeDialog
  const DIALOG_PADDING = 4;
  const SETTINGS_TITLE_HEIGHT = 2; // "Settings" title + spacing
  const SCROLL_ARROWS_HEIGHT = 2; // Up and down arrows
  const SPACING_HEIGHT = 1; // Space between settings list and scope
  const SCOPE_SELECTION_HEIGHT = 4; // Apply To section height
  const BOTTOM_HELP_TEXT_HEIGHT = 1; // Help text
  const RESTART_PROMPT_HEIGHT = showRestartPrompt ? 1 : 0;

  let currentAvailableTerminalHeight =
    availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  currentAvailableTerminalHeight -= 2; // Top and bottom borders

  // Start with basic fixed height (without scope selection)
  let totalFixedHeight =
    DIALOG_PADDING +
    SETTINGS_TITLE_HEIGHT +
    SCROLL_ARROWS_HEIGHT +
    SPACING_HEIGHT +
    BOTTOM_HELP_TEXT_HEIGHT +
    RESTART_PROMPT_HEIGHT;

  // Calculate how much space we have for settings
  let availableHeightForSettings = Math.max(
    1,
    currentAvailableTerminalHeight - totalFixedHeight,
  );

  // Each setting item takes 2 lines (the setting row + spacing)
  let maxVisibleItems = Math.max(1, Math.floor(availableHeightForSettings / 2));

  // Decide whether to show scope selection based on remaining space
  let showScopeSelection = true;

  // If we have limited height, prioritize showing more settings over scope selection
  if (availableTerminalHeight && availableTerminalHeight < 25) {
    // For very limited height, hide scope selection to show more settings
    const totalWithScope = totalFixedHeight + SCOPE_SELECTION_HEIGHT;
    const availableWithScope = Math.max(
      1,
      currentAvailableTerminalHeight - totalWithScope,
    );
    const maxItemsWithScope = Math.max(1, Math.floor(availableWithScope / 2));

    // If hiding scope selection allows us to show significantly more settings, do it
    if (maxVisibleItems > maxItemsWithScope + 1) {
      showScopeSelection = false;
    } else {
      // Otherwise include scope selection and recalculate
      totalFixedHeight += SCOPE_SELECTION_HEIGHT;
      availableHeightForSettings = Math.max(
        1,
        currentAvailableTerminalHeight - totalFixedHeight,
      );
      maxVisibleItems = Math.max(1, Math.floor(availableHeightForSettings / 2));
    }
  } else {
    // For normal height, include scope selection
    totalFixedHeight += SCOPE_SELECTION_HEIGHT;
    availableHeightForSettings = Math.max(
      1,
      currentAvailableTerminalHeight - totalFixedHeight,
    );
    maxVisibleItems = Math.max(1, Math.floor(availableHeightForSettings / 2));
  }

  // Use the calculated maxVisibleItems or fall back to the original maxItemsToShow
  const effectiveMaxItemsToShow = availableTerminalHeight
    ? Math.min(maxVisibleItems, items.length)
    : maxItemsToShow;

  // Ensure focus stays on settings when scope selection is hidden
  React.useEffect(() => {
    if (!showScopeSelection && focusSection === 'scope') {
      dispatch({ type: 'SET_FOCUS', section: 'settings' });
    }
  }, [showScopeSelection, focusSection]);

  // Scroll logic for settings
  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + effectiveMaxItemsToShow,
  );
  // Show arrows if there are more items than can be displayed
  const showScrollUp = items.length > effectiveMaxItemsToShow;
  const showScrollDown = items.length > effectiveMaxItemsToShow;

  const saveRestartRequiredSettings = () => {
    // restartRequiredKeys is now derived from useMemo
    if (restartRequiredKeys.size > 0) {
      saveModifiedSettings(
        restartRequiredKeys,
        previewSettings,
        raw,
        selectedScope,
      );

      // Remove saved keys from unsaved restart changes
      dispatch({ type: 'SAVE_AND_CLEAR_KEYS', keys: restartRequiredKeys });
    }
  };

  useKeypress(
    (key) => {
      const { name } = key;

      if (name === 'tab' && showScopeSelection) {
        dispatch({ type: 'TOGGLE_FOCUS' });
      }
      if (focusSection === 'settings') {
        // If editing, capture input and control keys
        if (editingKey) {
          const definition = getSettingDefinition(editingKey);
          const type = definition?.type;

          if (key.paste && key.sequence) {
            let pasted = key.sequence;
            if (type === 'number') {
              pasted = key.sequence.replace(/[^0-9\-+.]/g, '');
            }
            if (pasted) {
              const before = cpSlice(editBuffer, 0, editCursorPos);
              const after = cpSlice(editBuffer, editCursorPos);
              updateBuffer(
                before + pasted + after,
                editCursorPos + cpLen(pasted),
              );
            }
            return;
          }
          if (name === 'backspace' || name === 'delete') {
            if (name === 'backspace' && editCursorPos > 0) {
              const before = cpSlice(editBuffer, 0, editCursorPos - 1);
              const after = cpSlice(editBuffer, editCursorPos);
              updateBuffer(before + after, editCursorPos - 1);
            } else if (name === 'delete' && editCursorPos < cpLen(editBuffer)) {
              const before = cpSlice(editBuffer, 0, editCursorPos);
              const after = cpSlice(editBuffer, editCursorPos + 1);
              updateBuffer(before + after, editCursorPos);
            }
            return;
          }
          if (keyMatchers[Command.ESCAPE](key)) {
            commitEdit(editingKey);
            return;
          }
          if (keyMatchers[Command.RETURN](key)) {
            commitEdit(editingKey);
            return;
          }

          let ch = key.sequence;
          let isValidChar = false;
          if (type === 'number') {
            // Allow digits, minus, plus, and dot.
            isValidChar = /[0-9\-+.]/.test(ch);
          } else {
            ch = stripUnsafeCharacters(ch);
            // For strings, allow any single character that isn't a control
            // sequence.
            isValidChar = ch.length === 1;
          }

          if (isValidChar) {
            const beforeCursor = cpSlice(editBuffer, 0, editCursorPos);
            const afterCursor = cpSlice(editBuffer, editCursorPos);
            updateBuffer(beforeCursor + ch + afterCursor, editCursorPos + 1);
            return;
          }

          // Arrow key navigation
          if (name === 'left') {
            moveCursor(Math.max(0, editCursorPos - 1));
            return;
          }
          if (name === 'right') {
            moveCursor(Math.min(cpLen(editBuffer), editCursorPos + 1));
            return;
          }
          // Home and End keys
          if (keyMatchers[Command.HOME](key)) {
            moveCursor(0);
            return;
          }
          if (keyMatchers[Command.END](key)) {
            moveCursor(cpLen(editBuffer));
            return;
          }
          // Block other keys while editing
          return;
        }
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          // If editing, commit first
          if (editingKey) {
            commitEdit(editingKey);
          }
          dispatch({
            type: 'NAVIGATE',
            direction: 'up',
            itemCount: items.length,
            maxVisible: effectiveMaxItemsToShow,
          });
        } else if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          // If editing, commit first
          if (editingKey) {
            commitEdit(editingKey);
          }
          dispatch({
            type: 'NAVIGATE',
            direction: 'down',
            itemCount: items.length,
            maxVisible: effectiveMaxItemsToShow,
          });
        } else if (keyMatchers[Command.RETURN](key)) {
          const currentItem = items[activeSettingIndex];
          if (
            currentItem?.type === 'number' ||
            currentItem?.type === 'string'
          ) {
            startEdit(currentItem.value);
          } else {
            currentItem?.toggle();
          }
        } else if (/^[0-9]$/.test(key.sequence || '') && !editingKey) {
          const currentItem = items[activeSettingIndex];
          if (currentItem?.type === 'number') {
            startEdit(currentItem.value, key.sequence);
          }
        } else if (
          keyMatchers[Command.CLEAR_INPUT](key) ||
          keyMatchers[Command.CLEAR_SCREEN](key)
        ) {
          // Ctrl+C or Ctrl+L: Clear current setting and reset to default
          const currentSetting = items[activeSettingIndex];
          if (!currentSetting) return;

          const defaultValue = getDefaultValue(currentSetting.value);
          const defType = currentSetting.type;

          // Type guard for valid default values
          const isValidDefault =
            (defType === 'boolean' && typeof defaultValue === 'boolean') ||
            (defType === 'number' && typeof defaultValue === 'number') ||
            (defType === 'string' && typeof defaultValue === 'string');

          if (!isValidDefault) return;

          if (!requiresRestart(currentSetting.value)) {
            // Save default immediately
            updateSetting(selectedScope, currentSetting.value, defaultValue);

            // Remove from unsavedRestartChanges (useMemo will derive the rest)
            dispatch({
              type: 'REMOVE_PENDING_CHANGE',
              key: currentSetting.value,
            });
          } else {
            // Track default reset as pending change (useMemo will derive pendingKeys, etc.)
            dispatch({
              type: 'ADD_PENDING_CHANGE',
              key: currentSetting.value,
              value: defaultValue as PendingValue,
            });
          }
        }
      }
      if (showRestartPrompt && name === 'r') {
        // Save restart-required settings and clear all pending changes
        saveRestartRequiredSettings();
        // Clearing unsavedRestartChanges causes useMemo to derive showRestartPrompt = false
        dispatch({ type: 'CLEAR_ALL_PENDING' });
        if (onRestartRequest) onRestartRequest();
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        if (editingKey) {
          commitEdit(editingKey);
        } else {
          // Save any restart-required settings before closing
          saveRestartRequiredSettings();
          onSelect(undefined, selectedScope);
        }
      }
    },
    { isActive: true },
  );

  const { mainAreaWidth } = useUIState();
  const viewportWidth = mainAreaWidth - 8;

  const buffer = useTextBuffer({
    initialText: '',
    initialCursorOffset: 0,
    viewport: {
      width: viewportWidth,
      height: 1,
    },
    isValidPath: () => false,
    singleLine: true,
    onChange: (text) => dispatch({ type: 'SET_SEARCH_QUERY', query: text }),
  });

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="row"
      padding={1}
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" flexGrow={1}>
        <Box marginX={1}>
          <Text
            bold={focusSection === 'settings' && !editingKey}
            wrap="truncate"
          >
            {focusSection === 'settings' ? '> ' : '  '}Settings{' '}
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor={
            editingKey
              ? theme.border.default
              : focusSection === 'settings'
                ? theme.border.focused
                : theme.border.default
          }
          paddingX={1}
          height={3}
          marginTop={1}
        >
          <TextInput
            focus={focusSection === 'settings' && !editingKey}
            buffer={buffer}
            placeholder="Search to filter"
          />
        </Box>
        <Box height={1} />
        {visibleItems.length === 0 ? (
          <Box marginX={1} height={1} flexDirection="column">
            <Text color={theme.text.secondary}>No matches found.</Text>
          </Box>
        ) : (
          <>
            {showScrollUp && (
              <Box marginX={1}>
                <Text color={theme.text.secondary}>▲</Text>
              </Box>
            )}
            {visibleItems.map((item, idx) => {
              const isActive =
                focusSection === 'settings' &&
                activeSettingIndex === idx + scrollOffset;

              const scopeSettings = raw.forScope(selectedScope).settings;
              const mergedSettings = merged;

              let displayValue: string;
              if (editingKey === item.value) {
                // Show edit buffer with advanced cursor highlighting
                if (cursorVisible && editCursorPos < cpLen(editBuffer)) {
                  // Cursor is in the middle or at start of text
                  const beforeCursor = cpSlice(editBuffer, 0, editCursorPos);
                  const atCursor = cpSlice(
                    editBuffer,
                    editCursorPos,
                    editCursorPos + 1,
                  );
                  const afterCursor = cpSlice(editBuffer, editCursorPos + 1);
                  displayValue =
                    beforeCursor + chalk.inverse(atCursor) + afterCursor;
                } else if (
                  cursorVisible &&
                  editCursorPos >= cpLen(editBuffer)
                ) {
                  // Cursor is at the end - show inverted space
                  displayValue = editBuffer + chalk.inverse(' ');
                } else {
                  // Cursor not visible
                  displayValue = editBuffer;
                }
              } else if (item.type === 'number' || item.type === 'string') {
                // For numbers/strings, get the actual current value from pending settings
                const path = item.value.split('.');
                const currentValue = getNestedValue(previewSettings, path);

                const defaultValue = getDefaultValue(item.value);

                if (currentValue !== undefined && currentValue !== null) {
                  displayValue = String(currentValue);
                } else {
                  displayValue =
                    defaultValue !== undefined && defaultValue !== null
                      ? String(defaultValue)
                      : '';
                }

                // Add * if value differs from default OR if currently being modified
                const isModified = pendingKeys.has(item.value);
                const effectiveCurrentValue =
                  currentValue !== undefined && currentValue !== null
                    ? currentValue
                    : defaultValue;
                const isDifferentFromDefault =
                  effectiveCurrentValue !== defaultValue;

                if (isDifferentFromDefault || isModified) {
                  displayValue += '*';
                }
              } else {
                // For booleans and other types, use existing logic
                displayValue = getDisplayValue(
                  item.value,
                  scopeSettings,
                  mergedSettings,
                  pendingKeys,
                  previewSettings,
                );
              }
              const shouldBeGreyedOut = isDefaultValue(
                item.value,
                scopeSettings,
              );

              // Generate scope message for this setting
              const scopeMessage = getScopeMessageForSetting(
                item.value,
                selectedScope,
                raw,
              );

              return (
                <React.Fragment key={item.value}>
                  <Box marginX={1} flexDirection="row" alignItems="center">
                    <Box minWidth={2} flexShrink={0}>
                      <Text
                        color={
                          isActive ? theme.status.success : theme.text.secondary
                        }
                      >
                        {isActive ? '●' : ''}
                      </Text>
                    </Box>
                    <Box minWidth={50}>
                      <Text
                        color={
                          isActive ? theme.status.success : theme.text.primary
                        }
                      >
                        {item.label}
                        {scopeMessage && (
                          <Text color={theme.text.secondary}>
                            {' '}
                            {scopeMessage}
                          </Text>
                        )}
                      </Text>
                    </Box>
                    <Box minWidth={3} />
                    <Text
                      color={
                        isActive
                          ? theme.status.success
                          : shouldBeGreyedOut
                            ? theme.text.secondary
                            : theme.text.primary
                      }
                    >
                      {displayValue}
                    </Text>
                  </Box>
                  <Box height={1} />
                </React.Fragment>
              );
            })}
            {showScrollDown && (
              <Box marginX={1}>
                <Text color={theme.text.secondary}>▼</Text>
              </Box>
            )}
          </>
        )}

        <Box height={1} />

        {/* Scope Selection - conditionally visible based on height constraints */}
        {showScopeSelection && (
          <Box marginX={1} flexDirection="column">
            <Text bold={focusSection === 'scope'} wrap="truncate">
              {focusSection === 'scope' ? '> ' : '  '}Apply To
            </Text>
            <RadioButtonSelect
              items={scopeItems}
              initialIndex={scopeItems.findIndex(
                (item) => item.value === selectedScope,
              )}
              onSelect={handleScopeSelect}
              onHighlight={handleScopeHighlight}
              isFocused={focusSection === 'scope'}
              showNumbers={focusSection === 'scope'}
            />
          </Box>
        )}

        <Box height={1} />
        <Box marginX={1}>
          <Text color={theme.text.secondary}>
            (Use Enter to select
            {showScopeSelection ? ', Tab to change focus' : ''}, Esc to close)
          </Text>
        </Box>
        {showRestartPrompt && (
          <Box marginX={1}>
            <Text color={theme.status.warning}>
              To see changes, Gemini CLI must be restarted. Press r to exit and
              apply changes now.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
