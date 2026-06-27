import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import Plotly from 'plotly.js-dist-min';
import { Database, Plus, RefreshCw, BarChart2, Table } from 'lucide-react';

const API = 'http://127.0.0.1:8088/api';

const DARK_LAYOUT = (title: string) => ({
  title: { text: title, font: { color: '#e2e8f0', size: 13 } },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0.15)',
  font: { color: '#94a3b8', size: 11 },
  xaxis: { gridcolor: 'rgba(255,255,255,0.07)', tickfont: { size: 10 } },
  yaxis: { gridcolor: 'rgba(255,255,255,0.07)', tickfont: { size: 10 } },
  margin: { l: 55, r: 15, t: 45, b: 55 },
  legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'rgba(0,0,0,0)' },
  hovermode: 'x unified',
});

const DAYS_OPTIONS = [30, 60, 90, 180, 365];

const ALL_COLS = [
  { key: 'date', label: 'Date' },
  { key: 'day_of_week', label: 'Day' },
  { key: 'is_promo_period', label: 'Promo' },
  { key: 'new_enterpriser_count', label: 'New Enterprisers' },
  { key: 'new_bee_count', label: 'New Bees' },
  { key: 'transaction_volume_online', label: 'Online Tx' },
  { key: 'transaction_volume_offline', label: 'Offline Tx' },
  { key: 'sales_ep_thousand_idr', label: 'EP Sales (K IDR)' },
  { key: 'top_product_id', label: 'Top Product' },
];

const DataWidget: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'data' | 'charts' | 'ingest'>('data');
  const [tableData, setTableData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [chartDays, setChartDays] = useState(90);

  // Ingest form
  const [form, setForm] = useState({
    date: '', is_promo_period: '0', new_enterpriser_count: '',
    new_bee_count: '', transaction_volume_online: '', transaction_volume_offline: '',
    sales_ep_thousand_idr: '', top_product_id: '',
  });
  const [ingestMsg, setIngestMsg] = useState('');

  const chart1Ref = useRef<HTMLDivElement>(null);
  const chart2Ref = useRef<HTMLDivElement>(null);
  const chart3Ref = useRef<HTMLDivElement>(null);

  const LIMIT = 50;

  const fetchTable = useCallback(async (p = 0) => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API}/data/table?limit=${LIMIT}&offset=${p * LIMIT}`);
      setTableData(res.data.records);
      setTotal(res.data.total);
      setPage(p);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchChartData = useCallback(async (days: number) => {
    try {
      const res = await axios.get(`${API}/data/chart?days=${days}`);
      setChartData(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { fetchTable(0); }, [fetchTable]);

  useEffect(() => {
    if (activeTab === 'charts') fetchChartData(chartDays);
  }, [activeTab, chartDays, fetchChartData]);

  useEffect(() => {
    if (activeTab !== 'charts' || !chartData) return;

    const promoX = chartData.dates.filter((_: string, i: number) => chartData.is_promo_period[i] === 1);
    const promoY = chartData.new_enterpriser_count.filter((_: number, i: number) => chartData.is_promo_period[i] === 1);

    if (chart1Ref.current) {
      Plotly.newPlot(chart1Ref.current, [
        { x: chartData.dates, y: chartData.new_enterpriser_count, type: 'scatter', mode: 'lines', name: 'New Enterprisers', line: { color: '#E8312A', width: 2 } },
        { x: chartData.dates, y: chartData.new_bee_count, type: 'scatter', mode: 'lines', name: 'New Bees', line: { color: '#F0921E', width: 1.5, dash: 'dot' } },
        { x: promoX, y: promoY, type: 'scatter', mode: 'markers', name: 'Promo Day', marker: { color: '#fbbf24', size: 5, symbol: 'diamond' } },
      ] as any, { ...DARK_LAYOUT('Registrations'), height: 240 } as any, { responsive: true, displayModeBar: false });
    }

    if (chart2Ref.current) {
      Plotly.newPlot(chart2Ref.current, [
        { x: chartData.dates, y: chartData.sales_ep_thousand_idr, type: 'scatter', mode: 'lines', name: 'EP Sales (K IDR)', line: { color: '#60a5fa', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(96,165,250,0.08)' },
      ] as any, { ...DARK_LAYOUT('EP Sales Trend (Thousand IDR)'), height: 240 } as any, { responsive: true, displayModeBar: false });
    }

    if (chart3Ref.current) {
      Plotly.newPlot(chart3Ref.current, [
        { x: chartData.dates, y: chartData.transaction_volume_online, type: 'scatter', mode: 'lines', name: 'Online', line: { color: '#34d399', width: 2 } },
        { x: chartData.dates, y: chartData.transaction_volume_offline, type: 'scatter', mode: 'lines', name: 'Offline', line: { color: '#a78bfa', width: 2 } },
      ] as any, { ...DARK_LAYOUT('Transaction Volume'), height: 240 } as any, { responsive: true, displayModeBar: false });
    }

    return () => {
      if (chart1Ref.current) Plotly.purge(chart1Ref.current);
      if (chart2Ref.current) Plotly.purge(chart2Ref.current);
      if (chart3Ref.current) Plotly.purge(chart3Ref.current);
    };
  }, [activeTab, chartData]);

  const handleIngest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIngestMsg('');
    try {
      await axios.post(`${API}/data/ingest`, {
        date: form.date,
        is_promo_period: parseFloat(form.is_promo_period),
        new_enterpriser_count: parseInt(form.new_enterpriser_count) || 0,
        new_bee_count: parseInt(form.new_bee_count) || 0,
        transaction_volume_online: parseInt(form.transaction_volume_online) || 0,
        transaction_volume_offline: parseInt(form.transaction_volume_offline) || 0,
        sales_ep_thousand_idr: parseFloat(form.sales_ep_thousand_idr) || 0,
        top_product_id: form.top_product_id || null,
      });
      setIngestMsg('Row ingested successfully.');
      fetchTable(0);
      setForm({ date: '', is_promo_period: '0', new_enterpriser_count: '', new_bee_count: '', transaction_volume_online: '', transaction_volume_offline: '', sales_ep_thousand_idr: '', top_product_id: '' });
    } catch (err) {
      setIngestMsg('Ingestion failed.');
      console.error(err);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  const tabBtn = (id: 'data' | 'charts' | 'ingest', icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`glass-button ${activeTab !== id ? 'secondary' : ''}`}
      style={{ padding: '6px 14px', fontSize: '0.85rem' }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Data Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Browse all {total.toLocaleString()} records, view visualizations, or ingest new data.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {tabBtn('data', <Table size={15} />, 'Table')}
          {tabBtn('charts', <BarChart2 size={15} />, 'Charts')}
          {tabBtn('ingest', <Plus size={15} />, 'Ingest')}
        </div>
      </div>

      {/* DATA TABLE TAB */}
      {activeTab === 'data' && (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
              <Database size={16} color="var(--primary)" /> All Operational Data
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Page {page + 1} / {totalPages || 1} ({total.toLocaleString()} rows)
              </span>
              <button onClick={() => fetchTable(0)} className="glass-button secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(15,23,42,0.95)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  {ALL_COLS.map(c => (
                    <th key={c.key} style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.length === 0 && (
                  <tr><td colSpan={ALL_COLS.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No data.</td></tr>
                )}
                {tableData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {ALL_COLS.map(c => (
                      <td key={c.key} style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
                        {c.key === 'is_promo_period' ? (
                          <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '0.72rem', background: row[c.key] ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)', color: row[c.key] ? 'var(--accent-success)' : 'inherit' }}>
                            {row[c.key] ? 'Yes' : 'No'}
                          </span>
                        ) : row[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button onClick={() => fetchTable(page - 1)} disabled={page === 0} className="glass-button secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Prev</button>
            <button onClick={() => fetchTable(page + 1)} disabled={page >= totalPages - 1} className="glass-button secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Next</button>
          </div>
        </div>
      )}

      {/* CHARTS TAB */}
      {activeTab === 'charts' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Last</span>
            {DAYS_OPTIONS.map(d => (
              <button key={d} onClick={() => setChartDays(d)} className={`glass-button ${chartDays !== d ? 'secondary' : ''}`} style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                {d}d
              </button>
            ))}
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>days</span>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <div ref={chart1Ref} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <div ref={chart2Ref} style={{ width: '100%' }} />
            </div>
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <div ref={chart3Ref} style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      )}

      {/* INGEST TAB */}
      {activeTab === 'ingest' && (
        <div style={{ flex: 1, display: 'flex', gap: '1.5rem', overflow: 'auto' }}>
          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem' }}>
            <h3 style={{ fontWeight: 'bold', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={17} color="var(--primary)" /> Manual Data Ingestion
            </h3>
            <form onSubmit={handleIngest} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { label: 'Date', field: 'date', type: 'date', required: true },
                { label: 'Top Product ID', field: 'top_product_id', type: 'text', required: false },
                { label: 'New Enterpriser Count', field: 'new_enterpriser_count', type: 'number', required: true },
                { label: 'New Bee Count', field: 'new_bee_count', type: 'number', required: false },
                { label: 'Online Transactions', field: 'transaction_volume_online', type: 'number', required: false },
                { label: 'Offline Transactions', field: 'transaction_volume_offline', type: 'number', required: false },
                { label: 'EP Sales (Thousand IDR)', field: 'sales_ep_thousand_idr', type: 'number', required: false },
              ].map(({ label, field, type, required }) => (
                <div key={field}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</label>
                  <input
                    type={type} required={required}
                    value={(form as any)[field]}
                    onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="glass-input"
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Promo Active</label>
                <select value={form.is_promo_period} onChange={e => setForm(f => ({ ...f, is_promo_period: e.target.value }))} className="glass-input" style={{ width: '100%' }}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" className="glass-button">Ingest Row</button>
                {ingestMsg && <span style={{ fontSize: '0.85rem', color: ingestMsg.includes('success') ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{ingestMsg}</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataWidget;
