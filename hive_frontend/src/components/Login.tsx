import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Lock, User } from 'lucide-react';
import HdiLogo from './HdiLogo';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

type Mode = 'login' | 'register';

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('admin.hive@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
    if (m === 'register') {
      setEmail('');
      setPassword('');
    } else {
      setEmail('admin.hive@gmail.com');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setIsLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      const response = await axios.post(`${API_URL}/auth/login`, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      login(response.data.access_token, response.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/auth/register`, { email, password });
      setInfo("Account created. Wait for a super admin to approve it, then log in.");
      setMode('login');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '420px', padding: '2rem', animationDelay: '0.1s' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--primary)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 8px 16px rgba(232, 49, 42, 0.3)' }}>
            <HdiLogo size={36} color="white" />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIVE Platform</h1>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`glass-button ${mode !== 'login' ? 'secondary' : ''}`}
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`glass-button ${mode !== 'register' ? 'secondary' : ''}`}
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
          >
            Register
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', textAlign: 'center', fontSize: '0.825rem', lineHeight: 1.4 }}>
          {mode === 'login'
            ? 'Sign in with your account. Super admin: admin.hive@gmail.com — first login sets the password.'
            : 'Create a new account. A super admin must approve it before you can log in.'}
        </p>

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <User style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input"
              style={{ paddingLeft: '40px' }}
              placeholder="email@example.com"
              required
              readOnly={mode === 'login' && email === 'admin.hive@gmail.com' && false}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input"
              style={{ paddingLeft: '40px' }}
              placeholder="Enter password"
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </div>

          {error && <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>{error}</div>}
          {info && <div style={{ color: 'var(--accent-success)', fontSize: '0.85rem', textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>{info}</div>}

          <button type="submit" className="glass-button" style={{ width: '100%', marginTop: '0.25rem' }} disabled={isLoading}>
            {isLoading
              ? (mode === 'login' ? 'Authenticating…' : 'Creating account…')
              : (mode === 'login' ? 'Secure Login' : 'Register')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
