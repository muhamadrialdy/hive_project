import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Key, Save, AlertCircle } from 'lucide-react';
import { API_URL } from '../../config';

const AdminWidget: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-3.0-flash');
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/config`);
      setApiKey(res.data.api_key || '');
      setModel(res.data.model || 'gemini-3.0-flash');
    } catch (err) {
      console.error('Failed to load config', err);
    }
  };

  const handleSave = async () => {
    setStatus(null);
    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/admin/config`, { api_key: apiKey, model });
      setStatus({ type: 'success', msg: 'Configuration saved successfully!' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Failed to save configuration.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Admin Configuration</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Configure API keys and model parameters for the LLM agent.</p>

      <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Gemini API Key</label>
          <div style={{ position: 'relative' }}>
            <Key style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="glass-input" 
              style={{ paddingLeft: '40px' }}
              placeholder="AIzaSy..."
            />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Your key is securely stored in the local SQLite database.</p>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>LLM Model Selection</label>
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value)}
            className="glass-input"
            style={{ appearance: 'none' }}
          >
            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Free Tier - Fastest)</option>
            <option value="gemini-3.0-flash">Gemini 3.0 Flash (Free Tier Recommended)</option>
            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Free Tier - Efficient)</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Legacy Free Tier)</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', color: 'var(--accent-warning)', fontSize: '0.8rem' }}>
            <AlertCircle size={14} />
            <span>Currently restricted to free tier models per system requirement.</span>
          </div>
        </div>

        {status && (
          <div style={{ 
            padding: '1rem', 
            borderRadius: '8px', 
            background: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: status.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)',
            border: `1px solid ${status.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)'}`
          }}>
            {status.msg}
          </div>
        )}

        <button 
          onClick={handleSave} 
          className="glass-button" 
          style={{ alignSelf: 'flex-start' }}
          disabled={isLoading}
        >
          <Save size={18} /> {isLoading ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};

export default AdminWidget;
