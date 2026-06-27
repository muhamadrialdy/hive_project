import React, { useState } from 'react';
import { BookOpen, ExternalLink, RefreshCw } from 'lucide-react';

const DocsWidget: React.FC = () => {
  const [iframeKey, setIframeKey] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid var(--border-glass)',
        flexShrink: 0,
      }}>
        <BookOpen size={16} color="var(--secondary)" />
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Documentation</span>
        <span style={{
          fontSize: '0.72rem', color: 'var(--text-muted)',
          fontFamily: 'monospace',
          padding: '2px 8px', background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px', border: '1px solid var(--border-glass)',
        }}>
          /docs/
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => setIframeKey(k => k + 1)}
            title="Reload"
            className="glass-button secondary"
            style={{ padding: '5px 10px', fontSize: '0.82rem' }}
          >
            <RefreshCw size={13} />
          </button>
          <a
            href="/docs/index.html"
            target="_blank"
            rel="noreferrer"
            title="Open in new tab"
            className="glass-button secondary"
            style={{
              padding: '5px 12px', fontSize: '0.82rem',
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={13} /> Open
          </a>
        </div>
      </div>

      {/* Iframe */}
      <iframe
        key={iframeKey}
        src="/docs/index.html"
        title="HIVE Documentation"
        style={{
          flex: 1, width: '100%', border: 'none',
          background: 'var(--bg-dark)',
        }}
      />
    </div>
  );
};

export default DocsWidget;
