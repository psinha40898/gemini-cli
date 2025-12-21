/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useMemo, useSyncExternalStore } from 'react';
import type {
  LoadedSettings,
  LoadedSettingsSnapshot,
  LoadableSettingScope,
  SettingsFile,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';

export const SettingsContext = React.createContext<LoadedSettings | undefined>(
  undefined,
);

/**
 * Original hook - returns LoadedSettings directly.
 * Does NOT trigger re-renders on settings changes.
 * Use this for components that only read settings at render time.
 */
export const useSettings = (): LoadedSettings => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

/**
 * The state shape returned by useSettingsStore.
 * Extends the snapshot with a forScope helper method.
 */
export interface SettingsState extends LoadedSettingsSnapshot {
  forScope: (scope: LoadableSettingScope) => SettingsFile;
}

/**
 * The value returned by useSettingsStore hook.
 */
export interface SettingsStoreValue {
  settings: SettingsState;
  setSetting: (
    scope: LoadableSettingScope,
    key: string,
    value: unknown,
  ) => void;
}

/**
 * Reactive hook - triggers re-renders when settings change.
 * Use this for components that need to update when settings are modified
 * (e.g., SettingsDialog).
 */
export const useSettingsStore = (): SettingsStoreValue => {
  const store = useContext(SettingsContext);
  if (store === undefined) {
    throw new Error('useSettingsStore must be used within a SettingsProvider');
  }

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const settings: SettingsState = useMemo(
    () => ({
      ...snapshot,
      forScope: (scope: LoadableSettingScope) => {
        switch (scope) {
          case SettingScope.User:
            return snapshot.user;
          case SettingScope.Workspace:
            return snapshot.workspace;
          case SettingScope.System:
            return snapshot.system;
          case SettingScope.SystemDefaults:
            return snapshot.systemDefaults;
          default:
            throw new Error(`Invalid scope: ${scope}`);
        }
      },
    }),
    [snapshot],
  );

  return useMemo(
    () => ({
      settings,
      setSetting: (scope: LoadableSettingScope, key: string, value: unknown) =>
        store.setValue(scope, key, value),
    }),
    [settings, store],
  );
};
