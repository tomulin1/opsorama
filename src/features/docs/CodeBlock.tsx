'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
export function CodeBlock({ code, language = 'typescript' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false); const [error, setError] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(code); setCopied(true); setError(false); setTimeout(() => setCopied(false), 2000); } catch { setError(true); } }
  return <div className="docs-code-block"><div><span>{language.toUpperCase()}</span><button onClick={() => void copy()} aria-label="Copy code">{copied ? <Check size={13} /> : <Copy size={13} />}{error ? 'Copy failed' : copied ? 'Copied' : 'Copy'}</button></div><pre><code>{code}</code></pre></div>;
}
