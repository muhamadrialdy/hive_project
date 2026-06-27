import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Play, Archive, Terminal, CheckCircle2, Shield, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import NotebookWidget from './NotebookWidget';
import { API_URL as API } from '../../config';

const MLWidget: React.FC = () => {
  const [tab, setTab] = useState<'forecast' | 'notebook'>('forecast');
  const [metrics, setMetrics] = useState<any>(null);
  const [forecast, setForecast] = useState<any[]>([]);
  const [forecastMeta, setForecastMeta] = useState<{ source?: string; warning?: string | null }>({});
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [backupVersion, setBackupVersion] = useState<number | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [forecastDays, setForecastDays] = useState(7);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
    fetchArtifacts();
  }, []);

  useEffect(() => {
    fetchForecast();
  }, [forecastDays]);

  const fetchMetrics = async () => {
    try {
      const res = await axios.get(`${API}/ml/metrics`);
      setMetrics(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchForecast = async () => {
    try {
      const res = await axios.get(`${API}/forecast/enterprisers?days=${forecastDays}`);
      const formatted = res.data.dates.map((date: string, i: number) => ({
        date,
        forecast: res.data.forecasted_new_enterprisers[i],
      }));
      setForecast(formatted);
      setForecastMeta({ source: res.data.model_source, warning: res.data.warning });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchArtifacts = async () => {
    try {
      const res = await axios.get(`${API}/ml/artifacts`);
      setArtifacts(res.data.artifacts ?? []);
      setActiveVersion(res.data.active_version ?? null);
      setBackupVersion(res.data.backup_version ?? null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetrain = async () => {
    setIsTraining(true);
    setActionMsg(null);
    try {
      await axios.post(`${API}/ml/train`);
      await Promise.all([fetchMetrics(), fetchForecast(), fetchArtifacts()]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTraining(false);
    }
  };

  const activateModel = async (version: number) => {
    setActionMsg(null);
    try {
      await axios.post(`${API}/ml/artifacts/${version}/activate`);
      setActionMsg(`v${version} is now active.`);
      await Promise.all([fetchMetrics(), fetchForecast(), fetchArtifacts()]);
    } catch (err: any) {
      setActionMsg(err?.response?.data?.detail ?? 'Activate failed');
    }
  };

  const setAsBackup = async (version: number) => {
    setActionMsg(null);
    try {
      await axios.post(`${API}/ml/artifacts/${version}/backup`);
      setActionMsg(`v${version} is now the backup.`);
      await fetchArtifacts();
    } catch (err: any) {
      setActionMsg(err?.response?.data?.detail ?? 'Set-backup failed');
    }
  };

  const deleteModel = async (version: number) => {
    if (!window.confirm(`Delete model v${version}? This cannot be undone.`)) return;
    setActionMsg(null);
    try {
      await axios.delete(`${API}/ml/artifacts/${version}`);
      setActionMsg(`v${version} deleted.`);
      await fetchArtifacts();
    } catch (err: any) {
      setActionMsg(err?.response?.data?.detail ?? 'Delete failed');
    }
  };

  // Convert active model's importances dict into chart-ready array
  const importanceData = metrics?.feature_importances
    ? Object.entries(metrics.feature_importances as Record<string, number>)
        .map(([feature, importance]) => ({ feature, importance }))
        .sort((a, b) => b.importance - a.importance)
    : [];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
        <button
          onClick={() => setTab('forecast')}
          className={`glass-button ${tab !== 'forecast' ? 'secondary' : ''}`}
          style={{ padding: '6px 18px', fontSize: '0.82rem' }}
        >
          <Activity size={14} /> Forecast & Artifacts
        </button>
        <button
          onClick={() => setTab('notebook')}
          className={`glass-button ${tab !== 'notebook' ? 'secondary' : ''}`}
          style={{ padding: '6px 18px', fontSize: '0.82rem' }}
        >
          <Terminal size={14} /> Notebook
        </button>
      </div>

      {tab === 'notebook' && (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <NotebookWidget />
        </div>
      )}

      {tab === 'forecast' && (
      <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>MLOps & Tuning</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Monitor model health, view forecasts, and manage trained artifacts.</p>
        </div>
        <button onClick={handleRetrain} disabled={isTraining} className="glass-button">
          <Play size={16} fill={isTraining ? 'transparent' : 'currentColor'} />
          {isTraining ? 'Training...' : 'Trigger Retrain'}
        </button>
      </div>

      {/* Metrics + Forecast row */}
      <div style={{ display: 'flex', gap: '1.5rem', minHeight: 0 }}>
        {/* Model Health */}
        <div className="glass-panel" style={{ width: '220px', flexShrink: 0, padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>Model Health</h3>
          {metrics ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.75rem', fontWeight: 'bold', color: metrics.mae < 50 ? 'var(--accent-success)' : 'var(--accent-warning)' }}>
                {metrics.mae}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>Mean Absolute Error</div>
              <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{metrics.rmse}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RMSE</div>
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{metrics.mape}%</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>MAPE</div>
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: metrics.status === 'Healthy' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{metrics.status}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</div>
                </div>
              </div>
              <div style={{ marginTop: '1rem', padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Active: {activeVersion ? `v${activeVersion}` : '—'}
                {backupVersion ? ` | Backup: v${backupVersion}` : ''}
                <br />
                {metrics.artifact_count} artifact{metrics.artifact_count !== 1 ? 's' : ''}
              </div>
              {forecastMeta.warning && (
                <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: 'rgba(245,158,11,0.15)', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--accent-warning)' }}>
                  {forecastMeta.warning}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading...</div>
          )}
        </div>

        {/* Forecast Chart */}
        <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '0.95rem' }}>
              <Activity size={16} color="var(--primary)" /> {forecastDays}-Day Forward Forecast
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Days:</label>
              <input
                type="number" min="1" max="90"
                value={forecastDays}
                onChange={(e) => setForecastDays(Number(e.target.value) || 7)}
                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', color: 'white', padding: '3px 6px', borderRadius: '4px', width: '55px', fontSize: '0.85rem' }}
              />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-dark)', borderColor: 'var(--border-glass)', borderRadius: '8px', fontSize: '0.8rem' }} itemStyle={{ color: 'var(--primary)' }} />
                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                <Line type="monotone" dataKey="forecast" name="Forecasted Enterprisers" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--primary)' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Feature Importances (active model) */}
      {importanceData.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
            <Activity size={16} color="var(--secondary)" /> Feature Importances
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
              From active model {activeVersion ? `v${activeVersion}` : '(fresh train)'}
            </span>
          </h3>
          <div style={{ height: Math.max(200, importanceData.length * 24) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={importanceData} layout="vertical" margin={{ left: 110, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={11} domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="feature" stroke="var(--text-muted)" fontSize={11} width={100} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-dark)', borderColor: 'var(--border-glass)', borderRadius: '8px', fontSize: '0.8rem' }}
                  formatter={(v) => typeof v === 'number' ? v.toFixed(4) : String(v ?? '')}
                />
                <Bar dataKey="importance" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Artifacts */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
          <Archive size={16} color="var(--secondary)" /> Model Artifacts
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
            {artifacts.length} version{artifacts.length !== 1 ? 's' : ''} stored
          </span>
        </h3>
        {actionMsg && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{actionMsg}</div>
        )}
        {artifacts.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1.5rem 0' }}>
            No artifacts yet. Trigger a retrain to save the first model version.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  {['Version', 'Trained At', 'Rows', 'MAE', 'RMSE', 'MAPE', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {artifacts.map((a) => {
                  const isActive = a.version === activeVersion;
                  const isBackup = a.version === backupVersion;
                  return (
                    <tr key={a.version} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isActive ? 'rgba(232,49,42,0.05)' : isBackup ? 'rgba(96,165,250,0.04)' : undefined,
                    }}>
                      <td style={{ padding: '0.55rem 0.75rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        v{a.version}
                        {isActive && <span style={{ marginLeft: '6px', padding: '1px 7px', borderRadius: '8px', fontSize: '0.65rem', background: 'rgba(232,49,42,0.25)', color: 'var(--primary)' }}>active</span>}
                        {isBackup && <span style={{ marginLeft: '6px', padding: '1px 7px', borderRadius: '8px', fontSize: '0.65rem', background: 'rgba(96,165,250,0.25)', color: '#60a5fa' }}>backup</span>}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.trained_at}</td>
                      <td style={{ padding: '0.55rem 0.75rem' }}>{a.training_rows?.toLocaleString()}</td>
                      <td style={{ padding: '0.55rem 0.75rem', color: a.metrics?.mae < 50 ? 'var(--accent-success)' : 'var(--accent-warning)' }}>{a.metrics?.mae}</td>
                      <td style={{ padding: '0.55rem 0.75rem' }}>{a.metrics?.rmse}</td>
                      <td style={{ padding: '0.55rem 0.75rem' }}>{a.metrics?.mape}%</td>
                      <td style={{ padding: '0.55rem 0.75rem' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '0.72rem', background: a.status === 'Healthy' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color: a.status === 'Healthy' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => activateModel(a.version)}
                          disabled={isActive}
                          className="glass-button"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', marginRight: '4px', opacity: isActive ? 0.4 : 1 }}
                          title={isActive ? 'Already active' : 'Make this the active model'}
                        >
                          <CheckCircle2 size={11} /> Activate
                        </button>
                        <button
                          onClick={() => setAsBackup(a.version)}
                          disabled={isActive || isBackup}
                          className="glass-button secondary"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', marginRight: '4px', opacity: (isActive || isBackup) ? 0.4 : 1 }}
                          title={isActive ? 'Cannot be backup while active' : isBackup ? 'Already backup' : 'Set as backup'}
                        >
                          <Shield size={11} /> Backup
                        </button>
                        <button
                          onClick={() => deleteModel(a.version)}
                          disabled={isActive}
                          className="glass-button secondary"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', opacity: isActive ? 0.4 : 1, color: '#fca5a5' }}
                          title={isActive ? 'Activate another model before deleting' : 'Delete artifact'}
                        >
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
};

export default MLWidget;
