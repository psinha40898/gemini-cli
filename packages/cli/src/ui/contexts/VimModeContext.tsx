/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { SettingScope } from '../../config/settings.js';
import { useSettings } from './SettingsContext.js';

export type VimMode = 'NORMAL' | 'INSERT';

interface VimModeContextType {
  vimEnabled: boolean;
  vimMode: VimMode;
  toggleVimEnabled: () => Promise<boolean>;
  setVimMode: (mode: VimMode) => void;
}

const VimModeContext = createContext<VimModeContextType | undefined>(undefined);

export const VimModeProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { settings, setSetting } = useSettings();
  const initialVimEnabled = settings.merged.general?.vimMode ?? false;
  const [vimEnabled, setVimEnabled] = useState(initialVimEnabled);
  const [vimMode, setVimMode] = useState<VimMode>(
    initialVimEnabled ? 'NORMAL' : 'INSERT',
  );

  useEffect(() => {
    // Initialize vimEnabled from settings on mount
    const enabled = settings.merged.general?.vimMode ?? false;
    setVimEnabled(enabled);
    // When vim mode is enabled, always start in NORMAL mode
    if (enabled) {
      setVimMode('NORMAL');
    }
  }, [settings.merged.general?.vimMode]);

  const toggleVimEnabled = useCallback(async () => {
    const newValue = !vimEnabled;
    setVimEnabled(newValue);
    // When enabling vim mode, start in NORMAL mode
    if (newValue) {
      setVimMode('NORMAL');
    }
    setSetting(SettingScope.User, 'general.vimMode', newValue);
    return newValue;
  }, [vimEnabled, setSetting]);

  const value = {
    vimEnabled,
    vimMode,
    toggleVimEnabled,
    setVimMode,
  };

  return (
    <VimModeContext.Provider value={value}>{children}</VimModeContext.Provider>
  );
};

export const useVimMode = () => {
  const context = useContext(VimModeContext);
  if (context === undefined) {
    throw new Error('useVimMode must be used within a VimModeProvider');
  }
  return context;
};
