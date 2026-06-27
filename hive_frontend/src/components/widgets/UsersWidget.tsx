import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Users, CheckCircle2, XCircle, Trash2, RefreshCw, ShieldCheck, User as UserIcon } from 'lucide-react';
import { API_URL as API } from '../../config';

interface UserRow {
  id: number;
  email: string;
  role: 'super_admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
}

const statusColor = (s: UserRow['status']): string => {
  if (s === 'approved') return 'var(--accent-success)';
  if (s === 'pending') return 'var(--accent-warning)';
  return 'var(--accent-danger)';
};

const statusBg = (s: UserRow['status']): string => {
  if (s === 'approved') return 'rgba(16,185,129,0.15)';
  if (s === 'pending') return 'rgba(245,158,11,0.15)';
  return 'rgba(239,68,68,0.15)';
};

const UsersWidget: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/users`);
      setUsers(res.data);
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.detail ?? 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const act = async (id: number, kind: 'approve' | 'reject' | 'delete') => {
    setMsg(null);
    try {
      if (kind === 'delete') {
        if (!window.confirm(`Delete user #${id}? This cannot be undone.`)) return;
        await axios.delete(`${API}/admin/users/${id}`);
      } else {
        await axios.post(`${API}/admin/users/${id}/${kind}`);
      }
      setMsg({ ok: true, text: `User ${kind}d.` });
      fetchUsers();
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.detail ?? `${kind} failed` });
    }
  };

  const pending = users.filter(u => u.status === 'pending');

  return (
    <div style={{ padding: '2rem', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>User Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {users.length} account{users.length !== 1 ? 's' : ''} · {pending.length} pending approval
          </p>
        </div>
        <button onClick={fetchUsers} className="glass-button secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {msg && (
        <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', background: msg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: msg.ok ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
          {msg.text}
        </div>
      )}

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
              {['Email', 'Role', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '0.6rem 0.85rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No users.</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '0.6rem 0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {u.role === 'super_admin' ? <ShieldCheck size={14} color="var(--primary)" /> : <UserIcon size={14} color="var(--text-muted)" />}
                    {u.email}
                  </div>
                </td>
                <td style={{ padding: '0.6rem 0.85rem' }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: u.role === 'super_admin' ? 'rgba(232,49,42,0.2)' : 'rgba(148,163,184,0.15)', color: u.role === 'super_admin' ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: '0.6rem 0.85rem' }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: statusBg(u.status), color: statusColor(u.status) }}>
                    {u.status}
                  </span>
                </td>
                <td style={{ padding: '0.6rem 0.85rem', display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => act(u.id, 'approve')}
                    disabled={u.status === 'approved'}
                    className="glass-button"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', opacity: u.status === 'approved' ? 0.4 : 1 }}
                  >
                    <CheckCircle2 size={11} /> Approve
                  </button>
                  <button
                    onClick={() => act(u.id, 'reject')}
                    disabled={u.role === 'super_admin'}
                    className="glass-button secondary"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', opacity: u.role === 'super_admin' ? 0.4 : 1 }}
                  >
                    <XCircle size={11} /> Reject
                  </button>
                  <button
                    onClick={() => act(u.id, 'delete')}
                    disabled={u.role === 'super_admin'}
                    className="glass-button secondary"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#fca5a5', opacity: u.role === 'super_admin' ? 0.4 : 1 }}
                    title={u.role === 'super_admin' ? 'Super admin cannot be deleted from UI' : 'Delete user'}
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        <Users size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
        Self-registered accounts arrive as pending. Approve to grant login access; reject to deny.
      </p>
    </div>
  );
};

export default UsersWidget;
