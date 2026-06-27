import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Settings, Database, Activity, MessageSquare, Menu, BookOpen, Users } from 'lucide-react';
import HdiLogo from './HdiLogo';
import AdminWidget from './widgets/AdminWidget';
import DataWidget from './widgets/DataWidget';
import MLWidget from './widgets/MLWidget';
import ChatWidget from './widgets/ChatWidget';
import DocsWidget from './widgets/DocsWidget';
import UsersWidget from './widgets/UsersWidget';

interface NavItem { id: string; icon: React.ElementType; label: string; superAdminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { id: 'data',  icon: Database,      label: 'Data Management' },
  { id: 'ml',    icon: Activity,      label: 'MLOps & Tuning'  },
  { id: 'chat',  icon: MessageSquare, label: 'Gemini Agent'    },
  { id: 'docs',  icon: BookOpen,      label: 'Documentation'   },
  { id: 'users', icon: Users,         label: 'Users',           superAdminOnly: true },
];

const Dashboard: React.FC = () => {
  const { logout, user, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab]     = useState('data');
  const [collapsed, setCollapsed]     = useState(false);

  // Hide super-admin-only entries (Users widget + Settings & API) from regular users.
  const visibleNavItems = NAV_ITEMS.filter(n => !n.superAdminOnly || isSuperAdmin);

  const renderWidget = () => {
    // Guard: regular users can't reach super-admin widgets even via URL state.
    if ((activeTab === 'admin' || activeTab === 'users') && !isSuperAdmin) {
      return <DataWidget />;
    }
    switch (activeTab) {
      case 'admin': return <AdminWidget />;
      case 'data':  return <DataWidget />;
      case 'ml':    return <MLWidget />;
      case 'chat':  return <ChatWidget />;
      case 'docs':  return <DocsWidget />;
      case 'users': return <UsersWidget />;
      default:      return <DataWidget />;
    }
  };

  const btnStyle: React.CSSProperties = {
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding:        collapsed ? '10px' : '10px 16px',
    gap:            collapsed ? 0 : '0.6rem',
    width:          '100%',
    transition:     'all 0.2s ease',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div
        className="glass-panel"
        style={{
          width:          collapsed ? '64px' : '260px',
          minWidth:       collapsed ? '64px' : '260px',
          display:        'flex',
          flexDirection:  'column',
          margin:         '1rem',
          marginRight:    '0',
          padding:        collapsed ? '1rem 0.5rem' : '1.25rem',
          zIndex:         10,
          overflow:       'hidden',
          transition:     'width 0.25s ease, min-width 0.25s ease, padding 0.25s ease',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', marginBottom: '1.5rem' }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '36px', height: '36px', background: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(232,49,42,0.3)' }}>
                <HdiLogo size={22} color="white" />
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>HIVE</h2>
            </div>
          )}
          {collapsed && (
            <div style={{ width: '36px', height: '36px', background: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(232,49,42,0.3)' }}>
              <HdiLogo size={22} color="white" />
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', borderRadius: '6px', flexShrink: 0 }}
            >
              <Menu size={18} />
            </button>
          )}
        </div>

        {/* Hamburger toggle when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', display: 'flex', justifyContent: 'center', marginBottom: '0.75rem', borderRadius: '6px' }}
          >
            <Menu size={18} />
          </button>
        )}

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
          {visibleNavItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`glass-button ${activeTab !== id ? 'secondary' : ''}`}
              style={btnStyle}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
            </button>
          ))}

          {isSuperAdmin && (
            <>
              <div style={{ margin: '0.75rem 0', height: '1px', background: 'var(--border-glass)' }} />
              <button
                onClick={() => setActiveTab('admin')}
                className={`glass-button ${activeTab !== 'admin' ? 'secondary' : ''}`}
                style={btnStyle}
                title={collapsed ? 'Settings & API' : undefined}
              >
                <Settings size={18} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>Settings & API</span>}
              </button>
            </>
          )}
        </nav>

        {/* User badge + Logout */}
        {!collapsed && user && (
          <div style={{
            marginBottom: '0.5rem', padding: '0.5rem 0.65rem',
            background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
            fontSize: '0.72rem', color: 'var(--text-muted)',
            display: 'flex', flexDirection: 'column', gap: '2px',
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
            <span style={{
              alignSelf: 'flex-start', fontSize: '0.65rem',
              padding: '1px 6px', borderRadius: '8px',
              background: isSuperAdmin ? 'rgba(232,49,42,0.2)' : 'rgba(148,163,184,0.15)',
              color: isSuperAdmin ? 'var(--primary)' : 'var(--text-muted)',
            }}>
              {user.role}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="glass-button secondary"
          style={{ ...btnStyle, color: 'var(--text-muted)' }}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>Logout</span>}
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="glass-panel animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {renderWidget()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
