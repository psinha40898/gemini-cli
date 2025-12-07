/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useState, useCallback, useMemo } from 'react';
import type {
  LoadedSettings,
  LoadableSettingScope,
} from '../../config/settings.js';

/**
 * The value provided by SettingsContext.
 * - `settings`: The LoadedSettings instance (read-only access for consumers)
 * - `updateSetting`: Method to update a setting (handles mutation + re-render trigger)
 * - `version`: A counter that increments on each update, useful for memoization dependencies
 */
export interface SettingsContextValue {
  settings: LoadedSettings;
  updateSetting: (
    scope: LoadableSettingScope,
    key: string,
    value: unknown,
  ) => void;
  version: number;
}

export const SettingsContext = React.createContext<
  SettingsContextValue | undefined
>(undefined);

/**
 * Props for SettingsProvider
 */
interface SettingsProviderProps {
  initialSettings: LoadedSettings;
  children: React.ReactNode;
}

/**
 * SettingsProvider manages settings state and provides a clean API for updating settings.
 * It encapsulates the "mutation + version bump" pattern so consumers don't need to manage it.
 *
 * This solves the architectural smell of mutating props:
 * - The LoadedSettings object is mutable (legacy requirement for persistence)
 * - This provider owns the version state that triggers React re-renders
 * - Consumers call `updateSetting` instead of directly mutating settings
 */
export function SettingsProvider({
  initialSettings,
  children,
}: SettingsProviderProps): React.JSX.Element {
  const [version, setVersion] = useState(0);

  const updateSetting = useCallback(
    (scope: LoadableSettingScope, key: string, value: unknown) => {
      // 1. Mutate the underlying LoadedSettings object (handles persistence)
      initialSettings.setValue(scope, key, value);
      // 2. Bump version to trigger re-renders for all consumers
      setVersion((v) => v + 1);
    },
    [initialSettings],
  );

  // Create a stable context value that changes when version changes
  const contextValue = useMemo<SettingsContextValue>(
    () => ({
      settings: initialSettings,
      updateSetting,
      version,
    }),
    [initialSettings, updateSetting, version],
  );

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access settings context.
 * Returns the full context value with settings, updateSetting, and version.
 */
export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
