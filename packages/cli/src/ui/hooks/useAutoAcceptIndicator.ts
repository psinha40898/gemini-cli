/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useInput } from 'ink';
import { ApprovalMode, type Config } from '@google/gemini-cli-core';

export interface UseAutoAcceptIndicatorArgs {
  config: Config;
}

export function useAutoAcceptIndicator({
  config,
}: UseAutoAcceptIndicatorArgs): ApprovalMode {
  const currentConfigValue = config.getApprovalMode();
  const [showAutoAcceptIndicator, setShowAutoAcceptIndicator] =
    useState(currentConfigValue);

  useEffect(() => {
    setShowAutoAcceptIndicator(currentConfigValue);
  }, [currentConfigValue]);

  useInput((input, key) => {
    let nextApprovalMode: ApprovalMode | undefined;

    if (key.ctrl && input === 'y') {
      nextApprovalMode =
        config.getApprovalMode() === ApprovalMode.YOLO
          ? ApprovalMode.DEFAULT
          : ApprovalMode.YOLO;
    } else if (key.tab && key.shift) {
      const currentMode = config.getApprovalMode();
      switch (currentMode) {
        case ApprovalMode.DEFAULT:
          nextApprovalMode = ApprovalMode.AUTO_EDIT;
          break;
        case ApprovalMode.AUTO_EDIT:
          nextApprovalMode = ApprovalMode.PLAN;
          break;
        case ApprovalMode.PLAN:
        default:
          nextApprovalMode = ApprovalMode.DEFAULT;
          break;
      }
    }

    if (nextApprovalMode) {
      config.setApprovalMode(nextApprovalMode);
      // Update local state immediately for responsiveness
      setShowAutoAcceptIndicator(nextApprovalMode);
    }
  });

  return showAutoAcceptIndicator;
}
