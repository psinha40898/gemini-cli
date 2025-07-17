/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';

import { MessageType, type HistoryItemHelp } from '../types.js';

// helpCommand.ts
export const helpCommand: SlashCommand = {
  name: 'help',
  altName: '?',
  description: 'for help on gemini-cli',
  action: async (context) => {
    const helpItem: Omit<HistoryItemHelp, 'id'> = {
      type: MessageType.HELP,
      timestamp: new Date(),
    };

    context.ui.addItem(helpItem, Date.now());
  },
};
