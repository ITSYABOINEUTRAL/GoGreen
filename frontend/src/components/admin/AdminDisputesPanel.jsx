import React from 'react';

export const DISPUTE_STATUS_STYLES = {
  resolved: { color: '#2d6a4f', bg: '#d8f3dc' },
  under_review: { color: '#7a5800', bg: '#ffeaa7' },
  open: { color: '#555', bg: '#e8e8e8' },
};

export const DEFAULT_STATUS_STYLE = { color: '#555', bg: '#e8e8e8' };

export const RESOLVABLE_STATUSES = new Set(['under_review', 'open']);

export function formatStatus(status) {
  if (!status) return 'unknown';
  return String(status).replace('_', ' ');
}

export function disputeStatusStyle(status) {
  return DISPUTE_STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE;
}

/**
 * AdminDisputesPanel — disputes table with resolve action.
 * Extracted from AdminDashboard.jsx (#1060).
 *
 * Props:
 *   disputes  – array of dispute objects
 *   onResolve – (dispute) => void  (opens resolve modal in parent)
 */
export default function AdminDisputesPanel({ disputes = [], onResolve }) {
  const s = {
    card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 8px #0001', marginTop: 32 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
    th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #eee', color: '#555', fontWeight: 600 },
    td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0' },
    deactivate: { background: '#fee', color: '#c0392b', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
    badge: (status) => {
      const { color, bg } = disputeStatusStyle(status);
      return { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color };
    },
  };

  return (
    <div style={s.card}>
      <h3 style={{ marginBottom: 16, color: '#333' }}>⚖️ Disputes ({disputes.length})</h3>
      {disputes.length === 0 ? (
        <div style={{ color: '#888', fontSize: 14 }}>No disputes filed.</div>
      ) : (
        <table style={s.table}>
          <caption
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            Customer disputes
          </caption>
          <thead>
            <tr>
              <th style={s.th}>ID</th>
              <th style={s.th}>Buyer</th>
              <th style={s.th}>Product</th>
              <th style={s.th}>Qty</th>
              <th style={s.th}>Total (XLM)</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Reason</th>
              <th style={s.th}>Resolution</th>
              <th style={s.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.id}>
                <td style={s.td}>{d.id}</td>
                <td style={s.td}>
                  {d.buyer_name}<br />
                  <span style={{ fontSize: 11, color: '#aaa' }}>{d.buyer_email}</span>
                </td>
                <td style={s.td}>{d.product_name}</td>
                <td style={s.td}>{d.quantity}</td>
                <td style={s.td}>{Number(d.total_price).toFixed(2)}</td>
                <td style={s.td}>
                  <span style={s.badge(d.status)}>{formatStatus(d.status)}</span>
                </td>
                <td style={{ ...s.td, maxWidth: 160, wordBreak: 'break-word', fontSize: 13 }}>
                  {d.reason}
                </td>
                <td style={{ ...s.td, maxWidth: 160, wordBreak: 'break-word', fontSize: 13, color: '#555' }}>
                  {d.resolution || '—'}
                </td>
                <td style={s.td}>
                  {RESOLVABLE_STATUSES.has(d.status) && (
                    <button
                      style={s.deactivate}
                      onClick={() => onResolve?.(d)}
                      aria-label={`Resolve dispute ${d.id}`}
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}