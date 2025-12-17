/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useReducer } from 'react';
import { Box, Text } from 'ink';
import { AsyncFzf } from 'fzf';
import { theme } from '../semantic-colors.js';
import type {
  LoadableSettingScope,
  SettingScope,
} from '../../config/settings.js';
import type { SettingsContextValue } from '../contexts/SettingsContext.js';
import {
  getScopeItems,
  getScopeMessageForSetting,
} from '../../utils/dialogScopeUtils.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import {
  getDialogSettingKeys,
  getDisplayValue,
  getSettingDefinition,
  isDefaultValue,
  requiresRestart,
  getDefaultValue,
  getNestedValue,
  getEffectiveValue,
  saveSetting,
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
import {
  settingsDialogReducer,
  createInitialState,
} from './settingsDialogReducer.js';
import { useInlineEdit } from '../hooks/useInlineEdit.js';

interface FzfResult {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[];
}

interface SettingsDialogProps {
  settings: SettingsContextValue;
  onSelect: (settingName: string | undefined, scope: SettingScope) => void;
  onRestartRequest?: () => void;
  availableTerminalHeight?: number;
  config?: Config;
}

const maxItemsToShow = 8;

export function SettingsDialog({
  settings,
  onSelect,
  onRestartRequest,
  availableTerminalHeight,
  config,
}: SettingsDialogProps): React.JSX.Element {
  const { vimEnabled, toggleVimEnabled } = useVimMode();

  // The reducer handles the bulk of Dialog state
  // The current settings scope, currently focused menu (settings or scope), responsive height, search state, and setting changes that require a restart.
  const [state, dispatch] = useReducer(
    settingsDialogReducer,
    undefined,
    createInitialState,
  );

  const {
    focusSection,
    selectedScope,
    activeSettingIndex,
    scrollOffset,
    searchQuery,
    filteredKeys,
    restartDirtyKeys,
  } = state;

  const showRestartPrompt = restartDirtyKeys.size > 0;

  // Memoized fuzzy search instance and search map to drive search effect
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

  // Settings are now read directly from the snapshot - no overlay needed
  // since all changes (including restart-required) are saved immediately
  const scopeSettings = settings.state.forScope(selectedScope).settings;

  const {
    editState,
    startEdit,
    updateBuffer,
    moveCursor,
    clearEdit,
    isEditing,
  } = useInlineEdit();

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
          const currentValue = getEffectiveValue(key, scopeSettings, {});
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

          if (newValue === undefined) {
            return;
          }
          debugLogger.log(
            `[DEBUG SettingsDialog] Saving ${key} with value:`,
            newValue,
          );
          saveSetting(
            key,
            newValue,
            selectedScope,
            scopeSettings,
            settings.setValue,
          );

          // Special handling for vim mode to sync with VimModeContext
          if (key === 'general.vimMode' && newValue !== vimEnabled) {
            toggleVimEnabled().catch((error) => {
              console.error('Failed to toggle vim mode:', error);
            });
          }

          if (key === 'general.previewFeatures') {
            config?.setPreviewFeatures(newValue as boolean);
          }

          // Mark restart-required keys as dirty so we show the restart prompt
          if (requiresRestart(key)) {
            dispatch({ type: 'MARK_RESTART_DIRTY', key });
          }
        },
      };
    });
  };

  const items = generateSettingsItems();

  // Save the settings value from an inline editable field
  const commitEdit = (key: string) => {
    const definition = getSettingDefinition(key);
    const type = definition?.type;

    if (editState.buffer.trim() === '' && type === 'number') {
      // Nothing entered for a number; cancel edit
      clearEdit();
      return;
    }

    let parsed: string | number;
    if (type === 'number') {
      const numParsed = Number(editState.buffer.trim());
      if (Number.isNaN(numParsed)) {
        // Invalid number; cancel edit
        clearEdit();
        return;
      }
      parsed = numParsed;
    } else {
      // For strings, use the buffer as is.
      parsed = editState.buffer;
    }

    saveSetting(key, parsed, selectedScope, scopeSettings, settings.setValue);

    // Mark restart-required keys as dirty so we show the restart prompt
    if (requiresRestart(key)) {
      dispatch({ type: 'MARK_RESTART_DIRTY', key });
    }

    clearEdit();
  };

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
  const effectiveFocusSection: 'settings' | 'scope' = showScopeSelection
    ? focusSection
    : 'settings';

  // Scroll logic for settings
  const visibleItems = items.slice(
    scrollOffset,
    scrollOffset + effectiveMaxItemsToShow,
  );
  // Show arrows if there are more items than can be displayed
  const showScrollUp = items.length > effectiveMaxItemsToShow;
  const showScrollDown = items.length > effectiveMaxItemsToShow;

  useKeypress(
    (key) => {
      const { name } = key;

      if (name === 'tab' && showScopeSelection) {
        dispatch({ type: 'TOGGLE_FOCUS' });
      }
      if (effectiveFocusSection === 'settings') {
        // If editing, capture input and control keys
        if (isEditing && editState.key) {
          const definition = getSettingDefinition(editState.key);
          const type = definition?.type;

          if (key.paste && key.sequence) {
            let pasted = key.sequence;
            if (type === 'number') {
              pasted = key.sequence.replace(/[^0-9\-+.]/g, '');
            }
            if (pasted) {
              const before = cpSlice(editState.buffer, 0, editState.cursorPos);
              const after = cpSlice(editState.buffer, editState.cursorPos);
              updateBuffer(
                before + pasted + after,
                editState.cursorPos + cpLen(pasted),
              );
            }
            return;
          }
          if (name === 'backspace' || name === 'delete') {
            if (name === 'backspace' && editState.cursorPos > 0) {
              const before = cpSlice(
                editState.buffer,
                0,
                editState.cursorPos - 1,
              );
              const after = cpSlice(editState.buffer, editState.cursorPos);
              updateBuffer(before + after, editState.cursorPos - 1);
            } else if (
              name === 'delete' &&
              editState.cursorPos < cpLen(editState.buffer)
            ) {
              const before = cpSlice(editState.buffer, 0, editState.cursorPos);
              const after = cpSlice(editState.buffer, editState.cursorPos + 1);
              updateBuffer(before + after, editState.cursorPos);
            }
            return;
          }
          if (keyMatchers[Command.ESCAPE](key)) {
            commitEdit(editState.key);
            return;
          }
          if (keyMatchers[Command.RETURN](key)) {
            commitEdit(editState.key);
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
            const beforeCursor = cpSlice(
              editState.buffer,
              0,
              editState.cursorPos,
            );
            const afterCursor = cpSlice(editState.buffer, editState.cursorPos);
            updateBuffer(
              beforeCursor + ch + afterCursor,
              editState.cursorPos + 1,
            );
            return;
          }

          if (name === 'left') {
            moveCursor(Math.max(0, editState.cursorPos - 1));
            return;
          }
          if (name === 'right') {
            moveCursor(
              Math.min(cpLen(editState.buffer), editState.cursorPos + 1),
            );
            return;
          }
          if (keyMatchers[Command.HOME](key)) {
            moveCursor(0);
            return;
          }
          if (keyMatchers[Command.END](key)) {
            moveCursor(cpLen(editState.buffer));
            return;
          }
          // Block other keys while editing
          return;
        }
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          if (isEditing && editState.key) {
            commitEdit(editState.key);
          }
          dispatch({
            type: 'NAVIGATE',
            direction: 'up',
            itemCount: items.length,
            maxVisible: effectiveMaxItemsToShow,
          });
        } else if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          if (isEditing && editState.key) {
            commitEdit(editState.key);
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
        } else if (/^[0-9]$/.test(key.sequence || '') && !isEditing) {
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
          if (currentSetting) {
            const defaultValue = getDefaultValue(currentSetting.value);

            const toSaveValue =
              currentSetting.type === 'boolean'
                ? typeof defaultValue === 'boolean'
                  ? defaultValue
                  : false
                : typeof defaultValue === 'number' ||
                    typeof defaultValue === 'string'
                  ? defaultValue
                  : undefined;

            saveSetting(
              currentSetting.value,
              toSaveValue,
              selectedScope,
              scopeSettings,
              settings.setValue,
            );

            // Mark restart-required keys as dirty so we show the restart prompt
            if (requiresRestart(currentSetting.value)) {
              dispatch({
                type: 'MARK_RESTART_DIRTY',
                key: currentSetting.value,
              });
            }
          }
        }
      }
      if (showRestartPrompt && name === 'r') {
        // All settings are already saved, just trigger restart
        if (onRestartRequest) onRestartRequest();
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        if (isEditing && editState.key) {
          commitEdit(editState.key);
        } else {
          // All settings are already saved, just close
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
            bold={effectiveFocusSection === 'settings' && !isEditing}
            wrap="truncate"
          >
            {effectiveFocusSection === 'settings' ? '> ' : '  '}Settings{' '}
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor={
            isEditing
              ? theme.border.default
              : effectiveFocusSection === 'settings'
                ? theme.border.focused
                : theme.border.default
          }
          paddingX={1}
          height={3}
          marginTop={1}
        >
          <TextInput
            focus={effectiveFocusSection === 'settings' && !isEditing}
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
                effectiveFocusSection === 'settings' &&
                activeSettingIndex === idx + scrollOffset;

              const scopeSettings =
                settings.state.forScope(selectedScope).settings;
              const mergedSettings = settings.state.merged;

              let displayValue: string;
              if (editState.key === item.value) {
                // Show edit buffer with advanced cursor highlighting
                if (
                  editState.cursorVisible &&
                  editState.cursorPos < cpLen(editState.buffer)
                ) {
                  // Cursor is in the middle or at start of text
                  const beforeCursor = cpSlice(
                    editState.buffer,
                    0,
                    editState.cursorPos,
                  );
                  const atCursor = cpSlice(
                    editState.buffer,
                    editState.cursorPos,
                    editState.cursorPos + 1,
                  );
                  const afterCursor = cpSlice(
                    editState.buffer,
                    editState.cursorPos + 1,
                  );
                  displayValue =
                    beforeCursor + chalk.inverse(atCursor) + afterCursor;
                } else if (
                  editState.cursorVisible &&
                  editState.cursorPos >= cpLen(editState.buffer)
                ) {
                  // Cursor is at the end - show inverted space
                  displayValue = editState.buffer + chalk.inverse(' ');
                } else {
                  // Cursor not visible
                  displayValue = editState.buffer;
                }
              } else if (item.type === 'number' || item.type === 'string') {
                // For numbers/strings, get the actual current value from snapshot
                const path = item.value.split('.');
                const currentValue = getNestedValue(
                  scopeSettings as Record<string, unknown>,
                  path,
                );

                const defaultValue = getDefaultValue(item.value);

                if (currentValue !== undefined && currentValue !== null) {
                  displayValue = String(currentValue);
                } else {
                  displayValue =
                    defaultValue !== undefined && defaultValue !== null
                      ? String(defaultValue)
                      : '';
                }

                // Add * if value differs from default OR if restart-required and dirty
                const isRestartDirty = restartDirtyKeys.has(item.value);
                const effectiveCurrentValue =
                  currentValue !== undefined && currentValue !== null
                    ? currentValue
                    : defaultValue;
                const isDifferentFromDefault =
                  effectiveCurrentValue !== defaultValue;

                if (isDifferentFromDefault || isRestartDirty) {
                  displayValue += '*';
                }
              } else {
                // For booleans and other types, use existing logic
                displayValue = getDisplayValue(
                  item.value,
                  scopeSettings,
                  mergedSettings,
                  restartDirtyKeys,
                  scopeSettings,
                );
              }
              const shouldBeGreyedOut = isDefaultValue(
                item.value,
                scopeSettings,
              );

              const scopeMessage = getScopeMessageForSetting(
                item.value,
                selectedScope,
                settings.state,
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
