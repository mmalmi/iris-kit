import {
  clearCopyReset,
  copyToClipboard,
  DEFAULT_COPY_RESET_MS,
  scheduleCopyReset,
  type CopyResetTimer,
} from './clipboard';

export type MarkdownCopyTimerMap = Map<HTMLButtonElement, Exclude<CopyResetTimer, null>>;

export interface MarkdownCopyOptions {
  resetMs?: number;
  label?: string;
  copiedLabel?: string;
}

const defaultOptions = {
  resetMs: DEFAULT_COPY_RESET_MS,
  label: 'Copy',
  copiedLabel: 'Copied',
};

export function markdownCopyButtonHtml(options: Pick<MarkdownCopyOptions, 'label'> = {}): string {
  const label = options.label ?? defaultOptions.label;
  return `<button type="button" class="markdown-copy-button" aria-label="Copy code" title="Copy code"><span class="markdown-copy-button-label">${label}</span></button>`;
}

export function setMarkdownCopyButtonLabel(button: HTMLButtonElement, label: string): void {
  const labelEl = button.querySelector('.markdown-copy-button-label');
  if (labelEl) {
    labelEl.textContent = label;
  }
}

export function resetMarkdownCopyButton(
  button: HTMLButtonElement,
  timers: MarkdownCopyTimerMap,
  options: Pick<MarkdownCopyOptions, 'label'> = {},
): void {
  clearCopyReset(timers.get(button) ?? null);
  timers.delete(button);
  button.classList.remove('is-copied');
  setMarkdownCopyButtonLabel(button, options.label ?? defaultOptions.label);
}

export function markMarkdownCopyButtonCopied(
  button: HTMLButtonElement,
  timers: MarkdownCopyTimerMap,
  options: MarkdownCopyOptions = {},
): void {
  resetMarkdownCopyButton(button, timers, options);
  button.classList.add('is-copied');
  setMarkdownCopyButtonLabel(button, options.copiedLabel ?? defaultOptions.copiedLabel);
  const timer = scheduleCopyReset(
    null,
    () => {
      button.classList.remove('is-copied');
      setMarkdownCopyButtonLabel(button, options.label ?? defaultOptions.label);
      timers.delete(button);
    },
    options.resetMs ?? defaultOptions.resetMs,
  );
  timers.set(button, timer);
}

export async function handleMarkdownCopyButtonClick(
  button: HTMLButtonElement,
  timers: MarkdownCopyTimerMap,
  options: MarkdownCopyOptions = {},
): Promise<boolean> {
  const code = button.closest('.markdown-code-block')?.querySelector('code');
  const copyText = code?.textContent?.replace(/\n$/, '');
  const result = await copyToClipboard(copyText);
  if (result !== 'copied') return false;
  markMarkdownCopyButtonCopied(button, timers, options);
  return true;
}

export function clearMarkdownCopyButtonTimers(timers: MarkdownCopyTimerMap): void {
  for (const timer of timers.values()) {
    clearCopyReset(timer);
  }
  timers.clear();
}
