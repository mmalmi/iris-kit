export const DEFAULT_COPY_RESET_MS = 2000;

export type CopyResult = 'copied' | 'prompted' | 'failed';
export type CopyResetTimer = ReturnType<typeof setTimeout> | null;

export interface CopyToClipboardOptions {
  legacyCommand?: boolean;
  promptLabel?: string;
}

export async function copyToClipboard(
  text: string | null | undefined,
  options: CopyToClipboardOptions = {},
): Promise<CopyResult> {
  const copyText = text ?? '';
  if (!copyText) return 'failed';

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyText);
      return 'copied';
    }
  } catch {
    // Fall through to the prompt fallback when a caller opts into it.
  }

  if (options.legacyCommand && typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    const input = document.createElement('input');
    input.value = copyText;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(input);
    if (copied) return 'copied';
  }

  if (options.promptLabel && typeof window !== 'undefined' && typeof window.prompt === 'function') {
    window.prompt(options.promptLabel, copyText);
    return 'prompted';
  }

  return 'failed';
}

export function scheduleCopyReset(
  timer: CopyResetTimer,
  reset: () => void,
  resetMs = DEFAULT_COPY_RESET_MS,
): ReturnType<typeof setTimeout> {
  clearCopyReset(timer);
  return setTimeout(reset, resetMs);
}

export function clearCopyReset(timer: CopyResetTimer): void {
  if (timer) {
    clearTimeout(timer);
  }
}

export function truncateMiddle(text: string, maxLength: number | null | undefined): string {
  if (!maxLength || text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  const half = Math.floor((maxLength - 3) / 2);
  return `${text.slice(0, half)}...${text.slice(-half)}`;
}
