/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import { theme } from '../semantic-colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  getScopeMessageForSetting,
  getScopeItems,
} from '../../utils/dialogScopeUtils.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { ScopeSelector } from './shared/ScopeSelector.js';
import { Scrollable, type ScrollableApi } from './shared/Scrollable.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { useMouseClick } from '../hooks/useMouseClick.js';
import { useUIState } from '../contexts/UIStateContext.js';

const BORDER_PADDING_OFFSET = 2; // border + padding around left column
const THEME_HEADER_ROWS = 1;
const SCOPE_HEADER_ROWS = 1;
const ROWS_PER_THEME_ITEM = 2; // item row + margin spacing
const ROWS_PER_SCOPE_ITEM = 2;
import { useUIActions } from '../contexts/UIActionsContext.js';

interface ThemeDialogProps {
  /** Callback function when a theme is selected */
  onSelect: (themeName: string, scope: LoadableSettingScope) => void;

  /** Callback function when the dialog is cancelled */
  onCancel: () => void;

  /** Callback function when a theme is highlighted */
  onHighlight: (themeName: string | undefined) => void;
  /** The settings object */
  settings: LoadedSettings;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export function ThemeDialog({
  onSelect,
  onCancel,
  onHighlight,
  settings,
  availableTerminalHeight,
  terminalWidth,
}: ThemeDialogProps): React.JSX.Element {
  const isAlternateBuffer = useAlternateBuffer();
  const { refreshStatic } = useUIActions();
  const { focusedZone } = useUIState();
  const isDialogActive = focusedZone === 'dialog';
  const rawAvailableHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;

  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );

  // Track the currently highlighted theme name
  const [highlightedThemeName, setHighlightedThemeName] = useState<string>(
    settings.merged.ui?.theme || DEFAULT_THEME.name,
  );

  // Generate theme items filtered by selected scope (memoized)
  const themeItems = useMemo(() => {
    const customThemes =
      selectedScope === SettingScope.User
        ? settings.user.settings.ui?.customThemes || {}
        : settings.merged.ui?.customThemes || {};
    const builtInThemes = themeManager
      .getAvailableThemes()
      .filter((t) => t.type !== 'custom');
    const customThemeNames = Object.keys(customThemes);
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    return [
      ...builtInThemes.map((t) => ({
        label: t.name,
        value: t.name,
        themeNameDisplay: t.name,
        themeTypeDisplay: capitalize(t.type),
        key: t.name,
      })),
      ...customThemeNames.map((name) => ({
        label: name,
        value: name,
        themeNameDisplay: name,
        themeTypeDisplay: 'Custom',
        key: name,
      })),
    ];
  }, [
    selectedScope,
    settings.user.settings.ui?.customThemes,
    settings.merged.ui?.customThemes,
  ]);

  // Find the index of the selected theme, but only if it exists in the list
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === highlightedThemeName,
  );
  // If not found, fall back to the first theme
  const safeInitialThemeIndex = initialThemeIndex >= 0 ? initialThemeIndex : 0;

  const handleThemeSelect = useCallback(
    (themeName: string) => {
      onSelect(themeName, selectedScope);
      refreshStatic();
    },
    [onSelect, selectedScope, refreshStatic],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string) => {
      setHighlightedThemeName(themeName);
      onHighlight(themeName);
    },
    [onHighlight],
  );

  const handleScopeHighlight = useCallback((scope: LoadableSettingScope) => {
    setSelectedScope(scope);
  }, []);

  const handleScopeSelect = useCallback(
    (scope: LoadableSettingScope) => {
      onSelect(highlightedThemeName, scope);
      refreshStatic();
    },
    [onSelect, highlightedThemeName, refreshStatic],
  );

  const [mode, setMode] = useState<'theme' | 'scope'>('theme');

  // Alternate buffer mode state
  const [activeThemeIndex, setActiveThemeIndex] = useState(-1); // -1 means use safeInitialThemeIndex
  const [activeScopeIndex, setActiveScopeIndex] = useState(0);
  const [focusedSection, setFocusedSection] = useState<'theme' | 'scope'>(
    'theme',
  );
  const scrollableApiRef = useRef<ScrollableApi | null>(null);
  const containerRef = useRef<DOMElement>(null);

  // Scope items for alternate buffer mode
  const scopeItems = useMemo(
    () =>
      getScopeItems().map((item, index) => ({
        ...item,
        index,
      })),
    [],
  );

  // Update highlighted theme when activeThemeIndex changes
  useEffect(() => {
    if (!isAlternateBuffer) return;
    const effectiveIndex =
      activeThemeIndex === -1 ? safeInitialThemeIndex : activeThemeIndex;
    if (effectiveIndex >= 0 && effectiveIndex < themeItems.length) {
      handleThemeHighlight(themeItems[effectiveIndex].value);
    }
  }, [
    activeThemeIndex,
    safeInitialThemeIndex,
    isAlternateBuffer,
    themeItems,
    handleThemeHighlight,
  ]);

  // Keyboard handler for alternate buffer mode
  const handleAlternateBufferKeypress = useCallback(
    (key: Key) => {
      if (key.name === 'tab') {
        setFocusedSection((prev) => (prev === 'theme' ? 'scope' : 'theme'));
        return;
      }

      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return;
      }

      if (focusedSection === 'theme') {
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          setActiveThemeIndex((prev) => {
            const current = prev === -1 ? safeInitialThemeIndex : prev;
            return current > 0 ? current - 1 : themeItems.length - 1;
          });
        } else if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          setActiveThemeIndex((prev) => {
            const current = prev === -1 ? safeInitialThemeIndex : prev;
            return current < themeItems.length - 1 ? current + 1 : 0;
          });
        } else if (keyMatchers[Command.RETURN](key)) {
          const effectiveIndex =
            activeThemeIndex === -1 ? safeInitialThemeIndex : activeThemeIndex;
          handleThemeSelect(themeItems[effectiveIndex].value);
        }
      } else {
        // scope section
        if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
          setActiveScopeIndex((prev) =>
            prev > 0 ? prev - 1 : scopeItems.length - 1,
          );
        } else if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
          setActiveScopeIndex((prev) =>
            prev < scopeItems.length - 1 ? prev + 1 : 0,
          );
        } else if (keyMatchers[Command.RETURN](key)) {
          handleScopeSelect(scopeItems[activeScopeIndex].value);
        }
      }
    },
    [
      focusedSection,
      activeThemeIndex,
      safeInitialThemeIndex,
      themeItems,
      handleThemeSelect,
      activeScopeIndex,
      scopeItems,
      handleScopeSelect,
      onCancel,
    ],
  );

  const handleRegisterScrollable = useCallback((api: ScrollableApi | null) => {
    scrollableApiRef.current = api;
  }, []);

  const getThemeRowRange = useCallback((index: number) => {
    const start = THEME_HEADER_ROWS + index * ROWS_PER_THEME_ITEM;
    const end = start + ROWS_PER_THEME_ITEM - 1;
    return { start, end };
  }, []);

  const getScopeRowRange = useCallback(
    (index: number) => {
      const themeSectionRows =
        THEME_HEADER_ROWS + themeItems.length * ROWS_PER_THEME_ITEM;
      const scopeHeaderOffset = themeSectionRows + SCOPE_HEADER_ROWS;
      const start = scopeHeaderOffset + index * ROWS_PER_SCOPE_ITEM;
      const end = start + ROWS_PER_SCOPE_ITEM - 1;
      return { start, end };
    },
    [themeItems.length],
  );

  const ensureLeftSelectionVisible = useCallback(() => {
    if (!isAlternateBuffer) {
      return;
    }
    const api = scrollableApiRef.current;
    if (!api) {
      return;
    }
    let range: { start: number; end: number } | null = null;
    if (focusedSection === 'theme') {
      const effectiveIndex =
        activeThemeIndex === -1 ? safeInitialThemeIndex : activeThemeIndex;
      if (effectiveIndex >= 0 && effectiveIndex < themeItems.length) {
        range = getThemeRowRange(effectiveIndex);
      }
    } else {
      if (activeScopeIndex >= 0 && activeScopeIndex < scopeItems.length) {
        range = getScopeRowRange(activeScopeIndex);
      }
    }
    if (!range) {
      return;
    }
    const { scrollTop, innerHeight } = api.getScrollState();
    if (range.start < scrollTop) {
      api.scrollBy(range.start - scrollTop);
    } else if (range.end >= scrollTop + innerHeight) {
      api.scrollBy(range.end - (scrollTop + innerHeight) + 1);
    }
  }, [
    activeThemeIndex,
    safeInitialThemeIndex,
    themeItems.length,
    focusedSection,
    scopeItems.length,
    activeScopeIndex,
    isAlternateBuffer,
    getThemeRowRange,
    getScopeRowRange,
  ]);

  useEffect(() => {
    ensureLeftSelectionVisible();
  }, [ensureLeftSelectionVisible]);

  // Mouse click handler for alternate buffer mode
  const handleMouseClick = useCallback(
    (_event: unknown, relX: number, relY: number) => {
      if (!isAlternateBuffer) {
        return;
      }
      const api = scrollableApiRef.current;
      if (!api) {
        return;
      }
      const { scrollTop } = api.getScrollState();
      const contentRelY = relY - BORDER_PADDING_OFFSET;
      if (contentRelY < 0) {
        return;
      }
      const clickedRow = scrollTop + contentRelY;
      if (clickedRow < THEME_HEADER_ROWS) {
        setFocusedSection('theme');
        return;
      }
      const themeSectionEnd =
        THEME_HEADER_ROWS + themeItems.length * ROWS_PER_THEME_ITEM;
      if (clickedRow < themeSectionEnd) {
        const index = Math.floor(
          (clickedRow - THEME_HEADER_ROWS) / ROWS_PER_THEME_ITEM,
        );
        if (index >= 0 && index < themeItems.length) {
          setFocusedSection('theme');
          setActiveThemeIndex(index);
        }
        return;
      }
      const scopeHeaderStart = themeSectionEnd;
      const scopeItemsStart = scopeHeaderStart + SCOPE_HEADER_ROWS;
      if (clickedRow < scopeItemsStart) {
        setFocusedSection('scope');
        return;
      }
      const scopeSectionEnd =
        scopeItemsStart + scopeItems.length * ROWS_PER_SCOPE_ITEM;
      if (clickedRow < scopeSectionEnd) {
        const index = Math.floor(
          (clickedRow - scopeItemsStart) / ROWS_PER_SCOPE_ITEM,
        );
        if (index >= 0 && index < scopeItems.length) {
          setFocusedSection('scope');
          setActiveScopeIndex(index);
        }
        return;
      }
    },
    [isAlternateBuffer, themeItems.length, scopeItems.length],
  );

  // Register mouse click handler
  useMouseClick(containerRef, handleMouseClick, {
    isActive: isAlternateBuffer,
  });

  // Non-alternate buffer mode keyboard handler
  useKeypress(
    (key) => {
      if (isAlternateBuffer) {
        handleAlternateBufferKeypress(key);
      } else {
        if (key.name === 'tab') {
          setMode((prev) => (prev === 'theme' ? 'scope' : 'theme'));
        }
        if (key.name === 'escape') {
          onCancel();
        }
      }
    },
    { isActive: !isAlternateBuffer || isDialogActive },
  );

  // Generate scope message for theme setting
  const otherScopeModifiedMessage = getScopeMessageForSetting(
    'ui.theme',
    selectedScope,
    settings,
  );

  // Constants for calculating preview pane layout.
  // These values are based on the JSX structure below.
  const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
  // A safety margin to prevent text from touching the border.
  // This is a complete hack unrelated to the 0.9 used in App.tsx
  const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
  // Combined horizontal padding from the dialog and preview pane.
  const TOTAL_HORIZONTAL_PADDING = 4;
  const colorizeCodeWidth = Math.max(
    Math.floor(
      (terminalWidth - TOTAL_HORIZONTAL_PADDING) *
        PREVIEW_PANE_WIDTH_PERCENTAGE *
        PREVIEW_PANE_WIDTH_SAFETY_MARGIN,
    ),
    1,
  );

  const DIALOG_PADDING = 2;
  const selectThemeHeight = themeItems.length + 1;
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // Top and bottom borders.
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight = DIALOG_PADDING + selectThemeHeight;

  let includePadding = true;

  // Remove content from the LHS that can be omitted if it exceeds the available height.
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DIALOG_PADDING;
  }

  // Vertical space taken by elements other than the two code blocks in the preview pane.
  // Includes "Preview" title, borders, and margin between blocks.
  const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

  // The right column doesn't need to ever be shorter than the left column.
  availableTerminalHeight = Math.max(
    availableTerminalHeight,
    totalLeftHandSideHeight,
  );
  const availableTerminalHeightCodeBlock =
    availableTerminalHeight -
    PREVIEW_PANE_FIXED_VERTICAL_SPACE -
    (includePadding ? 2 : 0) * 2;

  // Subtract margin between code blocks from available height.
  const availableHeightForPanes = Math.max(
    0,
    availableTerminalHeightCodeBlock - 1,
  );

  // The code block is slightly longer than the diff, so give it more space.
  const codeBlockHeight = Math.ceil(availableHeightForPanes * 0.6);
  const diffHeight = Math.floor(availableHeightForPanes * 0.4);

  // Get the preview theme for rendering
  const previewTheme =
    themeManager.getTheme(highlightedThemeName || DEFAULT_THEME.name) ||
    DEFAULT_THEME;

  // Shared preview pane component for alternate buffer mode
  const previewPane = (
    <Box flexDirection="column" width="55%" paddingLeft={2}>
      <Text bold color={theme.text.primary}>
        Preview
      </Text>
      <Box
        borderStyle="single"
        borderColor={theme.border.default}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
        overflow="hidden"
      >
        {colorizeCode({
          code: `# function
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a`,
          language: 'python',
          maxWidth: colorizeCodeWidth,
          settings,
        })}
        <Box marginTop={1} />
        <DiffRenderer
          diffContent={`--- a/util.py
+++ b/util.py
@@ -1,2 +1,2 @@
- print("Hello, " + name)
+ print(f"Hello, {name}!")
`}
          terminalWidth={colorizeCodeWidth}
          theme={previewTheme}
        />
      </Box>
    </Box>
  );

  // Alternate buffer mode: two columns - left scrolls, right is sticky preview
  if (isAlternateBuffer) {
    // Use explicit height constraint to force space sharing with MainContent.
    // Cap at 60% of available height or 20 rows, whichever is smaller.
    // This ensures MainContent remains visible above the dialog.
    const chromeHeight = 4; // border (2) + padding (2)
    const maxDialogRows = 20;
    const dialogHeight = Math.min(
      rawAvailableHeight,
      Math.floor(rawAvailableHeight * 0.6),
      maxDialogRows + chromeHeight,
    );
    const scrollableHeight = Math.max(dialogHeight - chromeHeight, 0);

    return (
      <Box
        ref={containerRef}
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="row"
        padding={1}
        width="100%"
        height={dialogHeight}
      >
        {/* Left Column: Scrollable with themes and scope */}
        <Box flexDirection="column" width="45%" paddingRight={2}>
          <Scrollable
            maxHeight={scrollableHeight}
            hasFocus={isDialogActive}
            onRegisterApi={handleRegisterScrollable}
          >
            <Text bold={focusedSection === 'theme'} wrap="truncate">
              {focusedSection === 'theme' ? '> ' : '  '}Select Theme{' '}
              <Text color={theme.text.secondary}>
                {getScopeMessageForSetting('ui.theme', selectedScope, settings)}
              </Text>
            </Text>
            <Box marginTop={1} flexDirection="column">
              {themeItems.map((item, index) => {
                const effectiveIndex =
                  activeThemeIndex === -1
                    ? safeInitialThemeIndex
                    : activeThemeIndex;
                const isSelected =
                  focusedSection === 'theme' && index === effectiveIndex;
                const titleColor = isSelected
                  ? theme.status.success
                  : theme.text.primary;
                return (
                  <Box
                    key={item.key}
                    flexDirection="row"
                    alignItems="flex-start"
                    marginTop={index === 0 ? 0 : 1}
                  >
                    <Box minWidth={2} flexShrink={0}>
                      <Text
                        color={
                          isSelected ? theme.status.success : theme.text.primary
                        }
                      >
                        {isSelected ? '●' : ' '}
                      </Text>
                    </Box>
                    <Text color={titleColor} wrap="truncate">
                      {item.themeNameDisplay}{' '}
                      <Text color={theme.text.secondary}>
                        {item.themeTypeDisplay}
                      </Text>
                    </Text>
                  </Box>
                );
              })}
            </Box>
            <Box marginTop={1}>
              <Text bold={focusedSection === 'scope'} wrap="truncate">
                {focusedSection === 'scope' ? '> ' : '  '}Apply To
              </Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              {scopeItems.map((item) => {
                const isSelected =
                  focusedSection === 'scope' && item.index === activeScopeIndex;
                const titleColor = isSelected
                  ? theme.status.success
                  : theme.text.primary;
                return (
                  <Box
                    key={item.value}
                    flexDirection="row"
                    alignItems="flex-start"
                    marginTop={item.index === 0 ? 0 : 1}
                  >
                    <Box minWidth={2} flexShrink={0}>
                      <Text
                        color={
                          isSelected ? theme.status.success : theme.text.primary
                        }
                      >
                        {isSelected ? '●' : ' '}
                      </Text>
                    </Box>
                    <Text color={titleColor}>{item.label}</Text>
                  </Box>
                );
              })}
            </Box>
            <Box marginTop={1}>
              <Text color={theme.text.secondary} wrap="truncate">
                (Enter to select, Tab to switch, Esc to close)
              </Text>
            </Box>
          </Scrollable>
        </Box>
        {previewPane}
      </Box>
    );
  }

  // Non-alternate buffer mode: original UI
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={includePadding ? 1 : 0}
      paddingBottom={includePadding ? 1 : 0}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      {mode === 'theme' ? (
        <Box flexDirection="row">
          {/* Left Column: Selection */}
          <Box flexDirection="column" width="45%" paddingRight={2}>
            <Text bold={mode === 'theme'} wrap="truncate">
              {mode === 'theme' ? '> ' : '  '}Select Theme{' '}
              <Text color={theme.text.secondary}>
                {otherScopeModifiedMessage}
              </Text>
            </Text>
            <RadioButtonSelect
              items={themeItems}
              initialIndex={safeInitialThemeIndex}
              onSelect={handleThemeSelect}
              onHighlight={handleThemeHighlight}
              isFocused={mode === 'theme'}
              maxItemsToShow={12}
              showScrollArrows={true}
              showNumbers={mode === 'theme'}
            />
          </Box>

          {/* Right Column: Preview */}
          <Box flexDirection="column" width="55%" paddingLeft={2}>
            <Text bold color={theme.text.primary}>
              Preview
            </Text>
            <Box
              borderStyle="single"
              borderColor={theme.border.default}
              paddingTop={includePadding ? 1 : 0}
              paddingBottom={includePadding ? 1 : 0}
              paddingLeft={1}
              paddingRight={1}
              flexDirection="column"
            >
              {colorizeCode({
                code: `# function
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a`,
                language: 'python',
                availableHeight: codeBlockHeight,
                maxWidth: colorizeCodeWidth,
                settings,
              })}
              <Box marginTop={1} />
              <DiffRenderer
                diffContent={`--- a/util.py
+++ b/util.py
@@ -1,2 +1,2 @@
- print("Hello, " + name)
+ print(f"Hello, {name}!")
`}
                availableTerminalHeight={diffHeight}
                terminalWidth={colorizeCodeWidth}
                theme={previewTheme}
              />
            </Box>
          </Box>
        </Box>
      ) : (
        <ScopeSelector
          onSelect={handleScopeSelect}
          onHighlight={handleScopeHighlight}
          isFocused={mode === 'scope'}
          initialScope={selectedScope}
        />
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary} wrap="truncate">
          (Use Enter to {mode === 'theme' ? 'select' : 'apply scope'}, Tab to{' '}
          {mode === 'theme' ? 'configure scope' : 'select theme'}, Esc to close)
        </Text>
      </Box>
    </Box>
  );
}
