/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import {
  Scrollable,
  type ScrollableApi,
} from '../components/shared/Scrollable.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  AuthType,
  clearCachedCredentialFile,
  type Config,
} from '@google/gemini-cli-core';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { useMouseClick } from '../hooks/useMouseClick.js';
import { AuthState } from '../types.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { validateAuthMethodWithSettings } from './useAuth.js';
import { RELAUNCH_EXIT_CODE } from '../../utils/processUtils.js';
import { useUIState } from '../contexts/UIStateContext.js';

interface AuthDialogProps {
  config: Config;
  settings: LoadedSettings;
  setAuthState: (state: AuthState) => void;
  authError: string | null;
  onAuthError: (error: string | null) => void;
  availableTerminalHeight: number;
}

const BORDER_PADDING_OFFSET = 2; // border (1) + padding (1)
const HEADER_ROWS = 4; // title + spacing + question
const ROWS_PER_AUTH_ITEM = 2; // bullet row + spacing

export function AuthDialog({
  config,
  settings,
  setAuthState,
  authError,
  onAuthError,
  availableTerminalHeight,
}: AuthDialogProps): React.JSX.Element {
  const isAlternateBuffer = useAlternateBuffer();
  const { focusedZone } = useUIState();
  const isDialogActive = focusedZone === 'dialog';

  const [exiting, setExiting] = useState(false);
  const [activeAuthIndex, setActiveAuthIndex] = useState(-1); // -1 means use initialAuthIndex
  const scrollableApiRef = useRef<ScrollableApi | null>(null);
  const containerRef = useRef<DOMElement>(null);

  // Memoize items to prevent re-creation on every render
  const items = useMemo(() => {
    let baseItems = [
      {
        label: 'Login with Google',
        value: AuthType.LOGIN_WITH_GOOGLE,
        key: AuthType.LOGIN_WITH_GOOGLE,
      },
      ...(process.env['CLOUD_SHELL'] === 'true'
        ? [
            {
              label: 'Use Cloud Shell user credentials',
              value: AuthType.COMPUTE_ADC,
              key: AuthType.COMPUTE_ADC,
            },
          ]
        : process.env['GEMINI_CLI_USE_COMPUTE_ADC'] === 'true'
          ? [
              {
                label: 'Use metadata server application default credentials',
                value: AuthType.COMPUTE_ADC,
                key: AuthType.COMPUTE_ADC,
              },
            ]
          : []),
      {
        label: 'Use Gemini API Key',
        value: AuthType.USE_GEMINI,
        key: AuthType.USE_GEMINI,
      },
      {
        label: 'Vertex AI',
        value: AuthType.USE_VERTEX_AI,
        key: AuthType.USE_VERTEX_AI,
      },
    ];

    if (settings.merged.security?.auth?.enforcedType) {
      baseItems = baseItems.filter(
        (item) => item.value === settings.merged.security?.auth?.enforcedType,
      );
    }

    return baseItems;
  }, [settings.merged.security?.auth?.enforcedType]);

  let defaultAuthType = null;
  const defaultAuthTypeEnv = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
  if (
    defaultAuthTypeEnv &&
    Object.values(AuthType).includes(defaultAuthTypeEnv as AuthType)
  ) {
    defaultAuthType = defaultAuthTypeEnv as AuthType;
  }

  let initialAuthIndex = items.findIndex((item) => {
    if (settings.merged.security?.auth?.selectedType) {
      return item.value === settings.merged.security.auth.selectedType;
    }

    if (defaultAuthType) {
      return item.value === defaultAuthType;
    }

    if (process.env['GEMINI_API_KEY']) {
      return item.value === AuthType.USE_GEMINI;
    }

    return item.value === AuthType.LOGIN_WITH_GOOGLE;
  });
  if (settings.merged.security?.auth?.enforcedType) {
    initialAuthIndex = 0;
  }

  const onSelect = useCallback(
    async (authType: AuthType | undefined, scope: LoadableSettingScope) => {
      if (exiting) {
        return;
      }
      if (authType) {
        const isInitialAuthSelection =
          !settings.merged.security?.auth?.selectedType;

        await clearCachedCredentialFile();

        settings.setValue(scope, 'security.auth.selectedType', authType);
        if (
          authType === AuthType.LOGIN_WITH_GOOGLE &&
          config.isBrowserLaunchSuppressed()
        ) {
          setExiting(true);
          setTimeout(async () => {
            await runExitCleanup();
            process.exit(RELAUNCH_EXIT_CODE);
          }, 100);
          return;
        }

        if (authType === AuthType.USE_GEMINI) {
          if (isInitialAuthSelection && process.env['GEMINI_API_KEY']) {
            setAuthState(AuthState.Unauthenticated);
            return;
          } else {
            setAuthState(AuthState.AwaitingApiKeyInput);
            return;
          }
        }
      }
      setAuthState(AuthState.Unauthenticated);
    },
    [settings, config, setAuthState, exiting],
  );

  const handleAuthSelect = useCallback(
    (authMethod: AuthType) => {
      const error = validateAuthMethodWithSettings(authMethod, settings);
      if (error) {
        onAuthError(error);
      } else {
        onSelect(authMethod, SettingScope.User);
      }
    },
    [settings, onAuthError, onSelect],
  );

  const handleEscapeKey = useCallback(() => {
    // Prevent exit if there is an error message.
    // This means the user is not authenticated yet.
    if (authError) {
      return;
    }
    if (settings.merged.security?.auth?.selectedType === undefined) {
      // Prevent exiting if no auth method is set
      onAuthError(
        'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
      );
      return;
    }
    onSelect(undefined, SettingScope.User);
  }, [
    authError,
    settings.merged.security?.auth?.selectedType,
    onAuthError,
    onSelect,
  ]);

  // Keyboard handler for alternate buffer mode
  const handleAlternateBufferKeypress = useCallback(
    (key: Key) => {
      if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
        setActiveAuthIndex((prev) => {
          const current = prev === -1 ? initialAuthIndex : prev;
          const newIndex = current > 0 ? current - 1 : items.length - 1;
          return newIndex;
        });
        onAuthError(null);
      } else if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
        setActiveAuthIndex((prev) => {
          const current = prev === -1 ? initialAuthIndex : prev;
          const newIndex = current < items.length - 1 ? current + 1 : 0;
          return newIndex;
        });
        onAuthError(null);
      } else if (keyMatchers[Command.RETURN](key)) {
        const effectiveIndex =
          activeAuthIndex === -1 ? initialAuthIndex : activeAuthIndex;
        const selectedItem = items[effectiveIndex];
        if (selectedItem) {
          handleAuthSelect(selectedItem.value);
        }
      } else if (keyMatchers[Command.ESCAPE](key)) {
        handleEscapeKey();
      }
    },
    [
      items,
      activeAuthIndex,
      initialAuthIndex,
      onAuthError,
      handleAuthSelect,
      handleEscapeKey,
    ],
  );

  useKeypress(
    (key) => {
      if (isAlternateBuffer) {
        handleAlternateBufferKeypress(key);
      } else {
        if (key.name === 'escape') {
          handleEscapeKey();
        }
      }
    },
    { isActive: !isAlternateBuffer || isDialogActive },
  );

  const handleRegisterScrollable = useCallback((api: ScrollableApi | null) => {
    scrollableApiRef.current = api;
  }, []);

  // Keep active auth method visible when navigating
  useEffect(() => {
    if (!isAlternateBuffer) {
      return;
    }
    const api = scrollableApiRef.current;
    if (!api) {
      return;
    }
    const effectiveIndex =
      activeAuthIndex === -1 ? initialAuthIndex : activeAuthIndex;
    if (effectiveIndex < 0) {
      return;
    }
    const { scrollTop, innerHeight } = api.getScrollState();
    const itemStart = HEADER_ROWS + effectiveIndex * ROWS_PER_AUTH_ITEM;
    const itemEnd = itemStart + ROWS_PER_AUTH_ITEM - 1;

    if (itemStart < scrollTop) {
      api.scrollBy(itemStart - scrollTop);
    } else if (itemEnd >= scrollTop + innerHeight) {
      api.scrollBy(itemEnd - (scrollTop + innerHeight) + 1);
    }
  }, [activeAuthIndex, initialAuthIndex, isAlternateBuffer]);

  // Mouse click handler for alternate buffer mode
  const handleMouseClick = useCallback(
    (_event: unknown, _relX: number, relY: number) => {
      if (!isAlternateBuffer) {
        return;
      }
      const api = scrollableApiRef.current;
      if (!api) {
        return;
      }
      const { scrollTop } = api.getScrollState();
      const contentRelY = relY - BORDER_PADDING_OFFSET;
      if (contentRelY < HEADER_ROWS) {
        return;
      }
      const clickedRow = scrollTop + (contentRelY - HEADER_ROWS);
      if (clickedRow < 0) {
        return;
      }
      const clickedIndex = Math.floor(clickedRow / ROWS_PER_AUTH_ITEM);
      if (clickedIndex >= 0 && clickedIndex < items.length) {
        setActiveAuthIndex(clickedIndex);
        onAuthError(null);
      }
    },
    [isAlternateBuffer, items.length, onAuthError],
  );

  // Register mouse click handler for alternate buffer mode
  useMouseClick(containerRef, handleMouseClick, {
    isActive: isAlternateBuffer,
  });

  if (exiting) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.focused}
        flexDirection="row"
        padding={1}
        width="100%"
        alignItems="flex-start"
      >
        <Text color={theme.text.primary}>
          Logging in with Google... Restarting Gemini CLI to continue.
        </Text>
      </Box>
    );
  }

  // Alternate buffer mode: Scrollable content with intrinsic layout
  if (isAlternateBuffer) {
    const effectiveActiveIndex =
      activeAuthIndex === -1 ? initialAuthIndex : activeAuthIndex;
    // Use maxHeight to cap the dialog, but let it use intrinsic height otherwise.
    // This allows the dialog to share space with MainContent naturally.
    const chromeHeight = 4; // border (2) + padding (2)
    const maxScrollableHeight = Math.max(
      availableTerminalHeight - chromeHeight,
      0,
    );

    return (
      <Box
        ref={containerRef}
        borderStyle="round"
        borderColor={theme.border.focused}
        flexDirection="column"
        padding={1}
        width="100%"
        maxHeight={availableTerminalHeight}
      >
        <Scrollable
          maxHeight={maxScrollableHeight}
          hasFocus={isDialogActive}
          onRegisterApi={handleRegisterScrollable}
        >
          <Box flexDirection="row">
            <Text color={theme.text.accent}>? </Text>
            <Text bold color={theme.text.primary}>
              Get started
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.text.primary}>
              How would you like to authenticate for this project?
            </Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            {items.map((item, index) => {
              const isSelected = index === effectiveActiveIndex;
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
                  <Text color={titleColor}>{item.label}</Text>
                </Box>
              );
            })}
          </Box>
          {authError && (
            <Box marginTop={1}>
              <Text color={theme.status.error}>{authError}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>(Use Enter to select)</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.text.primary}>
              Terms of Services and Privacy Notice for Gemini CLI
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.text.link}>
              {
                'https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md'
              }
            </Text>
          </Box>
        </Scrollable>
      </Box>
    );
  }

  // Non-alternate buffer mode: original UI
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="row"
      padding={1}
      width="100%"
      alignItems="flex-start"
    >
      <Text color={theme.text.accent}>? </Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={theme.text.primary}>
          Get started
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            How would you like to authenticate for this project?
          </Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={items}
            initialIndex={initialAuthIndex}
            onSelect={handleAuthSelect}
            onHighlight={() => {
              onAuthError(null);
            }}
          />
        </Box>
        {authError && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>{authError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>(Use Enter to select)</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            Terms of Services and Privacy Notice for Gemini CLI
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.link}>
            {
              'https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md'
            }
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
