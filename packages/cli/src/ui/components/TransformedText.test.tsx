/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { TransformedText } from './TransformedText.js';

describe('TransformedText', () => {
  it('renders plain text unchanged', () => {
    const { lastFrame } = render(
      <TransformedText>Hello, world!</TransformedText>,
    );
    expect(lastFrame()).toBe('Hello, world!');
  });

  it('transforms image path to collapsed form', () => {
    const { lastFrame } = render(
      <TransformedText>
        Check this image @/path/to/screenshot.png
      </TransformedText>,
    );
    expect(lastFrame()).toContain('[Image screenshot.png]');
    expect(lastFrame()).not.toContain('@/path/to/screenshot.png');
  });

  it('transforms long image filename with truncation', () => {
    const { lastFrame } = render(
      <TransformedText>@/path/to/very-long-filename-here.png</TransformedText>,
    );
    expect(lastFrame()).toContain('[Image');
    expect(lastFrame()).toContain('.png]');
    expect(lastFrame()).toContain('...');
  });

  it('handles multiple image paths', () => {
    const { lastFrame } = render(
      <TransformedText>@first.png and @second.jpg</TransformedText>,
    );
    expect(lastFrame()).toContain('[Image first.png]');
    expect(lastFrame()).toContain('[Image second.jpg]');
  });

  it('passes through text props', () => {
    const { lastFrame } = render(
      <TransformedText color="red">styled text</TransformedText>,
    );
    // The text should still render (props are passed to inner Text component)
    expect(lastFrame()).toContain('styled text');
  });

  it('handles text without image paths', () => {
    const text = 'Just some regular text with @mentions that are not images';
    const { lastFrame } = render(<TransformedText>{text}</TransformedText>);
    // Non-image @ mentions should remain as-is
    expect(lastFrame()).toBe(text);
  });
});
