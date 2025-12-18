/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useMemo, useSyncExternalStore } from 'react';
import type {
  DeepReadonly,
  LoadableSettingScope,
  LoadedSettings,
  LoadedSettingsSnapshot,
  SettingsFile,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';

export type SettingsState = DeepReadonly<LoadedSettingsSnapshot> & {
  forScope: (scope: LoadableSettingScope) => DeepReadonly<SettingsFile>;
};

/**
 * Creates a SettingsState from a LoadedSettings instance.
 * Used by SettingsProvider (React) and non-interactive CLI (non-React).
 */
export function createSettingsState(settings: LoadedSettings): SettingsState {
  const snapshot = settings.getSnapshot();
  return {
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
  };
}

export interface SettingsContextValue {
  settings: SettingsState;
  setSetting: (
    scope: LoadableSettingScope,
    key: string,
    value: unknown,
  ) => void;
}

export const SettingsContext = React.createContext<
  SettingsContextValue | undefined
>(undefined);

export function SettingsProvider({
  value,
  children,
}: {
  value: LoadedSettings;
  children: React.ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    (listener) => value.subscribe(listener),
    () => value.getSnapshot(),
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

  const api: SettingsContextValue = useMemo(
    () => ({
      settings,
      setSetting: value.setSetting.bind(value),
    }),
    [settings, value],
  );

  return (
    <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
  );
}

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
