import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Play, Archive, Terminal } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import NotebookWidget from './NotebookWidget';

const API = 'http://127.0.0.1:8088/api';

const MLWidget: React.FC = () => {
  const [tab, setTab] = useState<'forecast' | 'notebook'>('forecast');
  const [metrics, setMetrics] = useState<any>(null);
  const [forecast, setForecast] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [forecastDays, setForecastDays] = useState(7);

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
    } catch (err) {
      console.error(err);
    }
  };

  const fetchArtifacts = async () => {
    try {
      const res = await axios.get(`${API}/ml/artifacts`);
      setArtifacts(res.data.artifacts);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetrain = async () => {
    setIsTraining(true);
    try {
      const res = await axios.post(`${API}/ml/train`);
      setMetrics(res.data.metrics);
      await Promise.all([fetchForecast(), fetchArtifacts()]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTraining(false);
    }
  };

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
              {metrics.latest_version && (
                <div style={{ marginTop: '1rem', padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Active: v{metrics.latest_version} &nbsp;|&nbsp; {metrics.artifact_count} artifacts
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

      {/* Artifacts */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
          <Archive size={16} color="var(--secondary)" /> Model Artifacts
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
            {artifacts.length} version{artifacts.length !== 1 ? 's' : ''} stored — newest first
          </span>
        </h3>
        {artifacts.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1.5rem 0' }}>
            No artifacts yet. Trigger a retrain to save the first model version.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  {['Version', 'Trained At', 'Training Rows', 'MAE', 'RMSE', 'MAPE', 'Status', 'File'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {artifacts.map((a, i) => (
                  <tr key={a.version} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i === 0 ? 'rgba(232,49,42,0.05)' : undefined }}>
                    <td style={{ padding: '0.55rem 0.75rem', fontWeight: 'bold' }}>
                      v{a.version}
                      {i === 0 && <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '8px', fontSize: '0.68rem', background: 'rgba(232,49,42,0.25)', color: 'var(--primary)' }}>latest</span>}
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-muted)' }}>{a.trained_at}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{a.training_rows?.toLocaleString()}</td>
                    <td style={{ padding: '0.55rem 0.75rem', color: a.metrics?.mae < 50 ? 'var(--accent-success)' : 'var(--accent-warning)' }}>{a.metrics?.mae}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{a.metrics?.rmse}</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>{a.metrics?.mape}%</td>
                    <td style={{ padding: '0.55rem 0.75rem' }}>
                      <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '0.72rem', background: a.status === 'Healthy' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color: a.status === 'Healthy' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                        {a.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{a.file}</td>
                  </tr>
                ))}
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
