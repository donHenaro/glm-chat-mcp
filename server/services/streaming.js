/**
 * server/services/streaming.js
 * SSE streaming + non-streaming response polling via Playwright page.
 */

const state = require('../state');
const { estimateTokens, buildToolPrompt, parseToolCalls } = require('./helpers');

const TIMEOUT_MS = 300000; // 5 minutes max

// === Injected into the page ===
const NETWORK_HOOKS_SCRIPT = `
if (window.__netHooksInstalled) return;
if (!window.__origFetch) window.__origFetch = window.fetch;
const patterns = ['/api/v2/chat/completions', '/api/chat/', '/completions'];
function parseSSE(text) {
  const tokens = [];
  for (const line of text.split('\\n')) {
    if (!line.startsWith('data:')) continue;
    const d = line.slice(5).trim();
    if (d === '[DONE]') break;
    try { const j = JSON.parse(d); const gc = j?.data?.delta_content; if (gc) { tokens.push({text:gc,phase:j?.data?.phase||'answer'}); continue; } const oc = j?.choices?.[0]?.delta?.content||''; if (oc) tokens.push({text:oc,phase:'answer'}); } catch {}
  }
  return tokens;
}
window.__netBuffer = { entries:[], _max:50, add(e){this.entries.push(e);if(this.entries.length>this._max)this.entries.shift();}, getLatest(){const ce=this.entries.filter(e=>patterns.some(p=>e.url.includes(p)));const entry=ce[ce.length-1]||null;if(entry&&(!entry.sseTokens||entry.sseTokens.length===0)&&entry.body)entry.sseTokens=parseSSE(entry.body);return entry;}, getLatestTokens(){const l=this.getLatest();if(!l?.sseTokens?.length)return null;return l.sseTokens.filter(t=>t.phase!=='thinking').map(t=>typeof t==='string'?t:t.text).join('');}, getLatestThinking(){const l=this.getLatest();if(!l?.sseTokens?.length)return null;return l.sseTokens.filter(t=>t.phase==='thinking').map(t=>typeof t==='string'?t:t.text).join('');}, flush(){this.entries=[];}, stats(){return{totalEntries:this.entries.length};} };
const origFetch = window.__origFetch;
window.fetch = async function(...args) {
  const url = typeof args[0]==='string'?args[0]:args[0]?.url||'';
  const response = await origFetch.apply(this, args);
  if (patterns.some(p=>url.includes(p))) {
    try { const [s1,s2]=response.body.tee(); const reader=s2.getReader(); const decoder=new TextDecoder(); let tokens=[],body=''; (async()=>{ try{let buf='';while(true){const{done,value}=await reader.read();if(done)break;const chunk=decoder.decode(value,{stream:true});body+=chunk;buf+=chunk;const lines=buf.split('\\n');buf=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const d=line.slice(5).trim();if(d==='[DONE]')break;try{const j=JSON.parse(d);const gc=j?.data?.delta_content;if(gc){tokens.push({text:gc,phase:j?.data?.phase||'answer'});continue;}const oc=j?.choices?.[0]?.delta?.content||'';if(oc)tokens.push({text:oc,phase:'answer'});}catch{}}} window.__netBuffer.add({url,status:response.status,body:body.slice(0,10000),sseTokens:tokens,timestamp:Date.now(),method:'fetch-stream',complete:true}); }catch(e){} })();
    return new Response(s1,{status:response.status,statusText:response.statusText,headers:response.headers});
    } catch { const cloned=response.clone(); cloned.text().then(b=>{const t=parseSSE(b);window.__netBuffer.add({url,status:response.status,body:b.slice(0,10000),sseTokens:t,timestamp:Date.now(),method:'fetch-clone',complete:true});}).catch(()=>{}); return response; }
  }
  return response;
};
if (!window.__origEventSource) window.__origEventSource = window.EventSource;
window.EventSource = function(url, opts) {
  const es = new window.__origEventSource(url, opts);
  if (patterns.some(p => url.includes(p))) {
    let tokens = [];
    es.addEventListener('message', (e) => {
      const d = e.data;
      if (d === '[DONE]') { window.__netBuffer.add({url, body:'', sseTokens:tokens, timestamp:Date.now(), method:'eventsource', complete:true}); return; }
      try { const j = JSON.parse(d); const gc = j?.data?.delta_content; if (gc) { tokens.push({text:gc, phase:j?.data?.phase||'answer'}); return; } const oc = j?.choices?.[0]?.delta?.content || ''; if (oc) tokens.push({text:oc, phase:'answer'}); } catch {}
    });
  }
  return es;
};
window.__netHooksInstalled = true;
`;

/**
 * Inject network hooks into the page.
 */
async function injectHooks(page) {
  await page.evaluate(NETWORK_HOOKS_SCRIPT);
}

/**
 * Flush the network buffer.
 */
async function flushBuffer(page) {
  await page.evaluate(() => { window.__netBuffer?.flush?.(); });
}

/**
 * Send prompt via textarea/contenteditable and press Enter.
 */
async function sendPrompt(page, prompt, adapter) {
  await page.evaluate(({ text, adapter }) => {
    if (adapter === 'kimi') {
      const editor = document.querySelector('.chat-input-editor, [contenteditable="true"]');
      if (!editor) throw new Error('Contenteditable input not found');
      editor.focus();
      document.execCommand('insertText', false, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const textarea = document.querySelector('#chat-input, textarea');
      if (!textarea) throw new Error('Textarea not found');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { text: prompt, adapter });

  await page.waitForTimeout(300);
  await page.evaluate((adapter) => {
    if (adapter === 'kimi') {
      const editor = document.querySelector('.chat-input-editor, [contenteditable="true"]');
      if (editor) editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
      const textarea = document.querySelector('#chat-input, textarea');
      if (textarea) textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  }, adapter);
}

module.exports = { injectHooks, flushBuffer, sendPrompt };
