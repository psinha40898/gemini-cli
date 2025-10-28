/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type Config,
  type FallbackModelHandler,
  type FallbackIntent,
  TerminalQuotaError,
  UserTierId,
  RetryableQuotaError,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { AuthState, MessageType } from '../types.js';
import { type ProQuotaDialogRequest } from '../contexts/UIStateContext.js';
import { SettingScope } from '../../config/settings.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setAuthState: (state: AuthState) => void;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  settings: {
    setValue: (scope: SettingScope, key: string, value: unknown) => void;
  };
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  setAuthState,
  setModelSwitchedFromQuotaError,
  settings,
}: UseQuotaAndFallbackArgs) {
  const [proQuotaRequest, setProQuotaRequest] =
    useState<ProQuotaDialogRequest | null>(null);
  const isDialogPending = useRef(false);

  // Set up Flash fallback handler
  useEffect(() => {
    const fallbackHandler: FallbackModelHandler = async (
      failedModel,
      fallbackModel,
      error,
    ): Promise<FallbackIntent | null> => {
      if (config.isInFallbackMode()) {
        return null;
      }

      // Fallbacks are currently only handled for OAuth users.
      const contentGeneratorConfig = config.getContentGeneratorConfig();
      if (
        !contentGeneratorConfig ||
        contentGeneratorConfig.authType !== AuthType.LOGIN_WITH_GOOGLE
      ) {
        return null;
      }

      // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

      let message: string;

      if (error instanceof TerminalQuotaError) {
        // Pro Quota specific messages (Interactive)
        if (isPaidTier) {
          message = `⚡ You have reached your daily ${failedModel} quota limit.
⚡ You can choose to authenticate with a paid API key or continue with the fallback model.
⚡ To continue accessing the ${failedModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `⚡ You have reached your daily ${failedModel} quota limit.
⚡ You can choose to authenticate with a paid API key or continue with the fallback model.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
        }
      } else if (error instanceof RetryableQuotaError) {
        // Short term quota retries exhausted (Automatic fallback)
        const actionMessage = `⚡ Your requests are being throttled right now due to server being at capacity for ${failedModel}.\n⚡ Automatically switching from ${failedModel} to ${fallbackModel} for the remainder of this session.`;

        if (isPaidTier) {
          message = `${actionMessage}
⚡ To continue accessing the ${failedModel} model, retry your request after some time or consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `${actionMessage}
⚡ Retry your requests after some time. Otherwise consider upgrading to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ You can switch authentication methods by typing /auth`;
        }
      } else {
        // Other errors (Automatic fallback)
        const actionMessage = `⚡ Automatically switching from ${failedModel} to ${fallbackModel} for faster responses for the remainder of this session.`;

        if (isPaidTier) {
          message = `${actionMessage}
⚡ Your requests are being throttled temporarily due to server being at capacity for ${failedModel} or there is a service outage.
⚡ To continue accessing the ${failedModel} model, you can retry your request after some time or consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `${actionMessage}
⚡ Your requests are being throttled temporarily due to server being at capacity for ${failedModel} or there is a service outage.
⚡ To avoid being throttled, you can retry your request after some time or upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
        }
      }

      // Add message to UI history
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: message,
        },
        Date.now(),
      );

      setModelSwitchedFromQuotaError(true);
      config.setQuotaErrorOccurred(true);

      // Interactive Fallback for Pro quota
      if (error instanceof TerminalQuotaError) {
        if (isDialogPending.current) {
          return 'stop'; // A dialog is already active, so just stop this request.
        }
        isDialogPending.current = true;

        const intent: FallbackIntent = await new Promise<FallbackIntent>(
          (resolve) => {
            setProQuotaRequest({
              failedModel,
              fallbackModel,
              resolve,
            });
          },
        );

        return intent;
      }

      return 'stop';
    };

    config.setFallbackModelHandler(fallbackHandler);
  }, [config, historyManager, userTier, setModelSwitchedFromQuotaError]);

  const handleProQuotaChoice = useCallback(
    async (choice: 'auth' | 'continue' | 'gemini-api-key' | 'vertex-ai') => {
      if (!proQuotaRequest) return;

      if (choice === 'gemini-api-key') {
        // Set auto fallback to Gemini API key
        await settings.setValue(
          SettingScope.User,
          'security.auth.autoFallback',
          { enabled: true, type: 'gemini-api-key' },
        );

        // Immediately switch to Gemini API key auth for this session
        if (process.env['GEMINI_API_KEY']) {
          try {
            await config.refreshAuth(AuthType.USE_GEMINI);
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: '✓ Switched to Gemini API key authentication. This session will now use your API key, and future sessions will automatically fallback when quota is exceeded.',
              },
              Date.now(),
            );
          } catch (error) {
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: `Failed to switch to Gemini API key: ${error instanceof Error ? error.message : String(error)}. Setting saved for future sessions.`,
              },
              Date.now(),
            );
          }
        } else {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: 'Enabled Gemini API key fallback for future sessions. Set GEMINI_API_KEY environment variable to use API key authentication.',
            },
            Date.now(),
          );
        }

        // After setting the flag and switching auth, proceed with retry
        proQuotaRequest.resolve('retry');
      } else if (choice === 'vertex-ai') {
        // Set auto fallback to Vertex AI
        await settings.setValue(
          SettingScope.User,
          'security.auth.autoFallback',
          { enabled: true, type: 'vertex-ai' },
        );

        // Immediately switch to Vertex AI auth for this session
        const hasVertexEnv =
          process.env['GOOGLE_API_KEY'] ||
          (process.env['GOOGLE_CLOUD_PROJECT'] &&
            process.env['GOOGLE_CLOUD_LOCATION']);
        if (hasVertexEnv) {
          try {
            await config.refreshAuth(AuthType.USE_VERTEX_AI);
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: '✓ Switched to Vertex AI authentication. This session will now use Vertex AI, and future sessions will automatically fallback when quota is exceeded.',
              },
              Date.now(),
            );
          } catch (error) {
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: `Failed to switch to Vertex AI: ${error instanceof Error ? error.message : String(error)}. Setting saved for future sessions.`,
              },
              Date.now(),
            );
          }
        } else {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: 'Enabled Vertex AI fallback for future sessions. Set GOOGLE_API_KEY or (GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION) environment variables to use Vertex AI authentication.',
            },
            Date.now(),
          );
        }

        // After setting the flag and switching auth, proceed with retry
        proQuotaRequest.resolve('retry');
      } else {
        const intent: FallbackIntent = choice === 'auth' ? 'auth' : 'retry';
        proQuotaRequest.resolve(intent);

        if (choice === 'auth') {
          setAuthState(AuthState.Updating);
        } else {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: 'Switched to fallback model. Tip: Press Ctrl+P (or Up Arrow) to recall your previous prompt and submit it again if you wish.',
            },
            Date.now(),
          );
        }
      }

      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here
    },
    [proQuotaRequest, setAuthState, historyManager, settings, config],
  );

  const openProQuotaDialogForTesting = useCallback(
    (overrides?: { failedModel?: string; fallbackModel?: string }) => {
      if (isDialogPending.current) {
        return Promise.resolve<'stop'>('stop');
      }

      isDialogPending.current = true;

      return new Promise<FallbackIntent>((resolve) => {
        setProQuotaRequest({
          failedModel: overrides?.failedModel ?? DEFAULT_GEMINI_MODEL,
          fallbackModel: overrides?.fallbackModel ?? DEFAULT_GEMINI_FLASH_MODEL,
          resolve,
        });
      });
    },
    [],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
    openProQuotaDialogForTesting,
  };
}
