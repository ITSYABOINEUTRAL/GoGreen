import React, { useState } from 'react';
import { useConfirm } from './hooks/useConfirm';

export default function AdminDashboard({ users = [], onBan = () => {}, onUnban = () => {} }) {
  const { confirm, confirmDialog } = useConfirm();
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState(null);

  async function handleBan(u) {
    const ok = await confirm({
      title: `Ban ${u.name}?`,
      description: 'They will lose access immediately.',
      confirmLabel: 'Ban',
      destructive: true,
    });
    if (!ok) return;
    setPendingId(u.id);
    setError(null);
    try {
      await onBan(u);
    } catch (e) {
      setError(e?.message || 'Failed to ban user');
    } finally {
      setPendingId(null);
    }
  }

  async function handleUnban(u) {
    setPendingId(u.id);
    setError(null);
    try {
      await onUnban(u);
    } catch (e) {
      setError(e?.message || 'Failed to unban user');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      {error && <div role="alert">{error}</div>}
      {users.map((u) =>
        u.isBanned ? (
          <button key={u.id} onClick={() => handleUnban(u)} disabled={pendingId === u.id}>
            Unban
          </button>
        ) : (
          <button key={u.id} onClick={() => handleBan(u)} disabled={pendingId === u.id}>
            Ban
          </button>
        )
      )}
      {confirmDialog}
    </div>
  );
}
