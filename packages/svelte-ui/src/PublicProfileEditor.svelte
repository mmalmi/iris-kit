<script lang="ts">
  import { untrack } from 'svelte';
  import { buildRawProfileDraft, compareRawProfileEvents, diffRawProfileFields, equalJsonValues, readRawProfileFields, validateJsonValue } from '@iris/profile-events';
  type RawEvent = {id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][]; sig: string};
  type Row = {id: number; key: string; text: string; type: 'Text' | 'JSON'};
  interface Props {
    event: RawEvent | null | undefined;
    onsaveraw?: (edits: Record<string, string | undefined>, base: RawEvent | null) => Promise<unknown>;
    onsave?: (edits: Record<string, unknown>, base: RawEvent | null) => Promise<unknown>;
    disabled?: boolean;
    oncancel?: () => void;
    blockedReason?: string;
    lightningAddress?: string;
  }
  let { event, onsaveraw, onsave, disabled = false, oncancel, blockedReason = '', lightningAddress = '' }: Props = $props();
  const standard = [
    ['name', 'Username'], ['display_name', 'Display name'], ['about', 'Bio'],
    ['website', 'Website'], ['picture', 'Picture URL'], ['banner', 'Banner URL'],
    ['nip05', 'Nostr address (NIP-05)'], ['lud16', 'Lightning address'],
  ];
  const empty = {content:'{}',tags:[],created_at:0};
  let base = $state.raw<RawEvent | null | undefined>(undefined);
  let original = $state.raw<Record<string,string>>({});
  let text = $state<Record<string,string>>({});
  let rows = $state<Row[]>([]);
  let dirty = $state(false);
  let busy = $state(false);
  let error = $state('');
  let success = $state('');
  let malformed = $state(false);
  let reviewing = $state(false);
  let nextId = 0;
  const common = (key:string, data:Record<string,string>) => standard.some(([name])=>name===key) &&
    (!Object.hasOwn(data,key) || data[key].startsWith('"'));
  function load(value:RawEvent|null|undefined) {
    base=value;
    try { original=readRawProfileFields(value?.content ?? '{}'); malformed=false; }
    catch { original={}; malformed=true; }
    text=Object.fromEntries(standard.filter(([key])=>common(key,original)).map(([key])=>[key,(Object.hasOwn(original,key)?JSON.parse(original[key]):'')]));
    rows=Object.entries(original).filter(([key])=>!common(key,original)).map(([key,value])=>({
      id:nextId++, key, type:value.startsWith('"')?'Text':'JSON', text:value.startsWith('"')?JSON.parse(value):value,
    }));
    dirty=false; reviewing=false; error=''; success='';
  }
  $effect(()=>{
    const latest=event;
    untrack(()=>{
      if (!dirty && !busy && (base===undefined || (base?.id??null)!==(latest?.id??null))) load(latest);
    });
  });
  const remoteChanged = $derived(event !== undefined && base !== undefined && (base?.id??null)!==(event?.id??null));
  function changed() { dirty=true; reviewing=false; error=''; success=''; }
  function preview() {
    const result=Object.create(null) as Record<string,string>;
    for(const [key] of standard) {
      if(!common(key,original)) continue;
      if(text[key] || original[key]==='""') result[key]=JSON.stringify(text[key]);
    }
    for(const row of rows) {
      if(!row.key.trim()) throw Error('Give each custom field a name.');
      if(Object.hasOwn(result,row.key) || common(row.key,original)) throw Error('Duplicate field: '+row.key);
      try { result[row.key]=row.type==='Text'?JSON.stringify(row.text):validateJsonValue(row.text); }
      catch { throw Error('Enter valid JSON for '+row.key+'.'); }
    }
    const edits=diffRawProfileFields(original,result);
    const next=buildRawProfileDraft(base??null,edits);
    if(/nsec1/i.test(next.content)||/nsec1/i.test(JSON.stringify(next.tags))) throw Error('Remove the secret key before publishing.');
    return {edits,changes:compareRawProfileEvents(base??empty,next)};
  }
  let draft=$state.raw<ReturnType<typeof preview>>();
  function review() {
    try {
      draft=preview();
      if (!draft.changes.fields.length) { error='There are no changes to publish.'; return; }
      error=''; reviewing=true;
    } catch(e) { error=e instanceof Error?e.message:String(e); }
  }
  async function publish() {
    if (!draft || busy || disabled || blockedReason || base===undefined || !reviewing) return;
    busy=true; error='';
    try {
      let saved: unknown;
      if (onsaveraw) saved=await onsaveraw(draft.edits,base);
      else {
        if (!onsave) throw Error('This app has no profile publisher.');
        const values: Record<string, unknown> = Object.create(null);
        for (const [key, raw] of Object.entries(draft.edits)) {
          if (raw===undefined) { values[key]=undefined; continue; }
          const value=JSON.parse(raw), encoded=JSON.stringify(value);
          if (!equalJsonValues(raw,encoded) || numberTokens(raw)!==numberTokens(encoded))
            throw Error('This app needs an update to publish this exact number.');
          values[key]=value;
        }
        saved=await onsave(values,base);
      }
      if(saved && typeof saved==='object' && 'id' in saved && 'tags' in saved && 'sig' in saved && 'content' in saved)
        load(saved as RawEvent);
      else if (event !== undefined && event?.id !== base?.id) load(event);
      else { dirty=false; reviewing=false; }
      success='Profile saved.';
    } catch(e) { error=e instanceof Error?e.message:String(e); }
    finally { busy=false; }
  }
  function numberTokens(raw: string): string {
    const tokens=raw.match(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g)??[];
    return tokens.filter(token=>!token.startsWith('"')).join(',');
  }
  const display = (key:string, raw:string|undefined) => raw?.startsWith('"') && standard.some(([name])=>name===key) ? JSON.parse(raw) : raw;
</script>

<div class="profile-editor">
  {#if blockedReason}<p role="status">{blockedReason}</p>{/if}
  {#if base===undefined}<p role="status">{blockedReason ? '' : 'Loading your profile…'}</p>
  {:else if malformed}<p role="alert">This profile contains unreadable metadata.</p>
  {:else}
    {#if remoteChanged && dirty}
      <p role="status">A newer profile is available. <button type="button" class="link" onclick={()=>load(event)}>Discard edits and load it</button></p>
    {/if}
    {#if reviewing && draft}
      <section aria-label="Review profile changes">
        <h3>Review profile changes</h3>
        {#if draft.changes.massRemoval}<p role="alert"><strong>This update clears a large part of your profile.</strong></p>{/if}
        <dl>{#each draft.changes.fields as field}
          <dt>{standard.find(([key])=>key===field.key)?.[1]??field.key}</dt>
          <dd>{#if Object.hasOwn(field,'before')}<del>{display(field.key,field.before) || '(empty)'}</del>{/if}
            {#if Object.hasOwn(field,'after')}<ins>{display(field.key,field.after) || '(empty)'}</ins>{:else}<span>Removed</span>{/if}</dd>
        {/each}</dl>
        {#each draft.changes.tagsRemoved as tag}<p>Remove image metadata <code>{JSON.stringify(tag)}</code></p>{/each}
        <p>Publishing shares these changes on your Nostr relays.</p>
        <div class="buttons">
          <button type="button" disabled={busy||disabled||!!blockedReason} onclick={publish}>{busy?'Saving…':'Publish profile'}</button>
          <button type="button" disabled={busy} onclick={()=>{reviewing=false;error=''}}>Back to editing</button>
        </div>
      </section>
    {:else}
      <form onsubmit={e=>{e.preventDefault();review()}}>
        <fieldset disabled={disabled||busy||!!blockedReason}>
          <div class="grid">
            {#each standard.filter(([key])=>common(key,original)) as [key,label]}
              <label class:wide={key==='about'}>{label}
                {#if key==='about'}<textarea rows="3" bind:value={text[key]} oninput={changed}></textarea>
                {:else}<input bind:value={text[key]} oninput={changed} />{/if}
              </label>
            {/each}
          </div>
          {#if lightningAddress && common('lud16',original) && !text.lud16 && !original.lud06}
            <button type="button" class="link" onclick={()=>{text.lud16=lightningAddress;changed()}}>Use {lightningAddress}</button>
          {/if}
          <details><summary>Custom fields ({rows.length})</summary>
            {#each rows as row (row.id)}
              <div class="custom">
                <div class="grid"><label>Field name<input bind:value={row.key} oninput={changed} spellcheck="false" /></label>
                  <label>Value type<select bind:value={row.type} onchange={changed}><option>Text</option><option>JSON</option></select></label></div>
                <label>Value<textarea rows="2" bind:value={row.text} oninput={changed}></textarea></label>
                <button type="button" class="link" onclick={()=>{rows=rows.filter(item=>item.id!==row.id);changed()}}>Remove field</button>
              </div>
            {/each}
            <button type="button" onclick={()=>{rows.push({id:nextId++,key:'',type:'Text',text:''});changed()}}>Add field</button>
          </details>
          {#if base?.tags.length}<details><summary>Event tags ({base.tags.length})</summary>
            {#each base.tags as tag}<p><strong>{tag[0]==='imeta'?'Image metadata':tag[0]==='i'?'External identity claim':tag[0]}</strong>
              <code>{JSON.stringify(tag)}</code></p>{/each}
          </details>{/if}
          <div class="buttons"><button type="submit" disabled={!dirty}>Review changes</button>
          {#if oncancel}<button type="button" onclick={oncancel}>Cancel</button>{/if}</div>
        </fieldset>
      </form>
    {/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if success}<p role="status">{success}</p>{/if}
</div>

<style>
  .profile-editor { min-width:0; color:inherit; font:inherit; }
  fieldset { padding:0; border:0; margin:0; min-width:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr)); gap:.7rem; }
  label { display:grid; gap:.28rem; min-width:0; font-size:.9em; }
  .wide { grid-column:1/-1; }
  input, textarea, select { box-sizing:border-box; width:100%; min-width:0; border:1px solid color-mix(in srgb,currentColor 30%,transparent);
    border-radius:.45rem; background:transparent; color:inherit; padding:.5rem .65rem; font:inherit; }
  textarea { resize:vertical; }
  select option { color:CanvasText; background:Canvas; }
  details { margin:.9rem 0; }
  summary { cursor:pointer; font-weight:600; }
  .custom { display:grid; gap:.45rem; padding:.6rem 0; border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent); }
  button { color:inherit; background:transparent; border:1px solid color-mix(in srgb,currentColor 35%,transparent); padding:.4rem .72rem; border-radius:.5rem; font:inherit; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  .link { border:0; text-decoration:underline; padding:.3rem 0; justify-self:start; overflow-wrap:anywhere; }
  .buttons { display:flex; flex-wrap:wrap; gap:.55rem; margin-top:.9rem; }
  .buttons button:first-child { background:var(--profile-editor-accent,#5737b5); color:var(--profile-editor-on-accent,#fff); border-color:transparent; }
  .custom + button, summary + button { margin-top:.5rem; }
  dt { font-weight:600; margin-top:.5rem; }
  dd { margin:.16rem 0 .4rem; }
  del, ins, code { display:block; white-space:pre-wrap; overflow-wrap:anywhere; }
  del { opacity:.72; }
  ins { text-decoration:none; }
  p { overflow-wrap:anywhere; }
</style>
