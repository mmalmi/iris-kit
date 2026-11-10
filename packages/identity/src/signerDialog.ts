import { pairBrowserSigner, type BrowserSignerOptions, type BrowserSignerSession } from './browserSigner.ts';

function signerDialog(title: string) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', title);
  dialog.style.cssText = 'color-scheme:light dark;color:CanvasText;background:Canvas;border:1px solid GrayText;border-radius:12px;padding:1.25rem;width:min(24rem,calc(100% - 2rem));margin:auto;font:inherit;box-sizing:border-box';
  const form = document.createElement('form');
  form.style.cssText = 'display:grid;gap:1rem';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  dialog.append(form);
  form.append(heading);
  document.body.append(dialog);
  return { dialog, form, cancel };
}

function approvalLink(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open signer to approve';
  link.style.textDecoration = 'underline';
  return link;
}

export function showSignerApproval(url: string, onCancel: () => void) {
  const { dialog, form, cancel } = signerDialog('Approve in your signer');
  form.append(approvalLink(url), cancel);
  dialog.addEventListener('cancel', onCancel);
  cancel.onclick = onCancel;
  dialog.showModal();
  return { close() { dialog.close(); dialog.remove(); } };
}

/** Shared existing-account dialog. Cancellation leaves the current account intact. */
export async function requestBrowserSigner(options: BrowserSignerOptions = {}): Promise<BrowserSignerSession | null> {
  options.signal?.throwIfAborted();
  const { dialog, form, cancel } = signerDialog('Sign in with remote signer');
  const label = document.createElement('label');
  label.textContent = 'Signer connection link';
  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = 'bunker://…';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.autofocus = true;
  input.required = true;
  input.style.cssText = 'display:block;width:100%;margin-top:.5rem;padding:.55rem;border:1px solid GrayText;border-radius:6px;box-sizing:border-box';
  label.append(input);
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  const connect = document.createElement('button');
  connect.type = 'submit';
  connect.textContent = 'Connect';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;gap:1rem';
  actions.append(cancel, connect);
  form.append(label, status, actions);
  const controller = new AbortController();
  try {
    return await new Promise<BrowserSignerSession | null>(resolve => {
      const dismiss = () => { controller.abort(); resolve(null); };
      controller.signal.addEventListener('abort', () => resolve(null), { once: true });
      options.signal?.addEventListener('abort', dismiss, { once: true, signal: controller.signal });
      dialog.addEventListener('cancel', dismiss);
      cancel.onclick = dismiss;
      form.onsubmit = async event => {
        event.preventDefault();
        if (connect.disabled) return;
        connect.disabled = input.disabled = true;
        status.textContent = 'Waiting for your signer…';
        try {
          const session = await pairBrowserSigner(input.value, { ...options, signal: controller.signal,
            onAuth: url => status.replaceChildren(approvalLink(url)) });
          resolve(session);
        } catch (error) {
          if (!controller.signal.aborted) {
            status.textContent = error instanceof Error ? error.message : 'Could not connect.';
            connect.disabled = input.disabled = false;
            input.focus();
          }
        }
      };
      dialog.showModal();
    });
  } finally {
    controller.abort();
    input.value = '';
    dialog.close();
    dialog.remove();
  }
}
