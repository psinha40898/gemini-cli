/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type {
  LoadableSettingScope,
  LoadedSettings,
  Settings,
} from '../../config/settings.js';

export interface SettingsContextValue {
  merged: Settings;
  raw: LoadedSettings;
  updateSetting: (
    scope: LoadableSettingScope,
    key: string,
    value: unknown,
  ) => void;
  updateSettingsBatch: (
    scope: LoadableSettingScope,
    updates: Array<{ key: string; value: unknown }>,
  ) => void;
}

const SettingsContext = React.createContext<SettingsContextValue | undefined>(
  undefined,
);

export const SettingsProvider = ({
  initialSettings,
  children,
}: PropsWithChildren<{ initialSettings: LoadedSettings }>) => {
  const [merged, setMerged] = useState<Settings>(() =>
    structuredClone(initialSettings.merged),
  );

  const updateSetting = useCallback(
    (scope: LoadableSettingScope, key: string, value: unknown) => {
      initialSettings.setValue(scope, key, value);
      setMerged(structuredClone(initialSettings.merged));
    },
    [initialSettings],
  );

  const updateSettingsBatch = useCallback(
    (
      scope: LoadableSettingScope,
      updates: Array<{ key: string; value: unknown }>,
    ) => {
      updates.forEach(({ key, value }) => {
        initialSettings.setValue(scope, key, value);
      });
      setMerged(structuredClone(initialSettings.merged));
    },
    [initialSettings],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      merged,
      raw: initialSettings,
      updateSetting,
      updateSettingsBatch,
    }),
    [merged, initialSettings, updateSetting, updateSettingsBatch],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export { SettingsContext };
