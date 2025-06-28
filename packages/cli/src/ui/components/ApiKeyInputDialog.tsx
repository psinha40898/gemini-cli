/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Colors } from '../colors.js';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { GEMINI_CONFIG_DIR } from '@google/gemini-cli-core';

interface ApiKeyInputDialogProps {
  onSave: (apiKey: string) => void;
  onCancel: () => void;
  initialApiKey?: string;
}

// Use GEMINI_CONFIG_DIR for storing the .env file
const envFilePath = path.join(GEMINI_CONFIG_DIR, '.env');

export function ApiKeyInputDialog({
  onSave,
  onCancel,
  initialApiKey = '',
}: ApiKeyInputDialogProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [isSaving, setIsSaving] = useState(false);

  useInput(async (input, key) => {
    if (key.return) {
      if (apiKey.trim() !== '') {
        setIsSaving(true);
        try {
          // Ensure the config directory exists
          await fsp.mkdir(GEMINI_CONFIG_DIR, { recursive: true });
          // Write the API key to the .env file with secure permissions
          await fsp.writeFile(envFilePath, `GEMINI_API_KEY=${apiKey.trim()}`.trim(), { 
            flag: 'w',
            mode: 0o600 // Restrict permissions to owner only
          });
          process.env.GEMINI_API_KEY = apiKey.trim();
          onSave(apiKey.trim());
        } catch (error) {
          console.error('Failed to save API key:', error);
          onCancel();
        }
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Enter Gemini API Key</Text>
      <Box marginTop={1}>
        <Text>API Key: </Text>
        <TextInput
          value={apiKey}
          onChange={setApiKey}
          mask="*"
          placeholder="YOUR_GEMINI_API_KEY"
          focus={!isSaving}
        />
      </Box>
      {isSaving && (
        <Box marginTop={1}>
          <Text color={Colors.Gray}>Saving...</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Press Enter to save, Esc to cancel)</Text>
      </Box>
    </Box>
  );
}