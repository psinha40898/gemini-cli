/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useMemo, useSyncExternalStore } from 'react';
import type {
  LoadableSettingScope,
  LoadedSettings,
  LoadedSettingsSnapshot,
  SettingsFile,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

type DeepReadonlyObject<T> = {
  readonly [K in keyof T]: DeepReadonly<T[K]>;
};

export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends AnyFunction
    ? T
    : T extends Date
      ? T
      : T extends Map<infer K, infer V>
        ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends Array<infer U>
            ? ReadonlyArray<DeepReadonly<U>>
            : T extends object
              ? DeepReadonlyObject<T>
              : T;

export type SettingsState = DeepReadonly<LoadedSettingsSnapshot> & {
  forScope: (scope: LoadableSettingScope) => DeepReadonly<SettingsFile>;
};

export interface SettingsContextValue {
  state: SettingsState;
  setValue: (scope: LoadableSettingScope, key: string, value: unknown) => void;
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
    () => value.getSnapshot(),
  );

  const state: SettingsState = useMemo(
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
      state,
      setValue: value.setValue.bind(value),
    }),
    [state, value],
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
