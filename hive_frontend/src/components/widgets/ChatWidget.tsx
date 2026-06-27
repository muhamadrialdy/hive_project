import React, { useState, useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import axios from 'axios';
import { Send, User, Bot, Loader2, PlusCircle, MessageSquare, Trash2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
}

interface ChatSession {
  id: number;
  title: string;
  messages?: ChatMessage[];
  created_at: string;
}

const MessageContent = React.memo(({ msg }: { msg: ChatMessage }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (containerRef.current) {
      const containers = containerRef.current.querySelectorAll('.plotly-chart-container');
      containers.forEach((container) => {
        const bconfig = container.getAttribute('data-bconfig');
        // Wait briefly to ensure DOM is ready
        setTimeout(() => {
            if (bconfig && !container.hasAttribute('data-rendered')) {
              try {
                const config = JSON.parse(atob(bconfig));
                Plotly.newPlot(container as HTMLElement, config.data, config.layout, { responsive: true });
                container.setAttribute('data-rendered', 'true');
              } catch (e) {
                console.error("Failed to render Plotly chart", e);
              }
            }
        }, 50);
      });
    }
  }, [msg.content]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: msg.role === 'user' ? msg.content.replace(/\n/g, '<br/>') : msg.content }} />;
});

const ChatWidget: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchSessionHistory(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8088/api/chat/sessions');
      setSessions(res.data);
      if (res.data.length > 0 && !activeSessionId) {
        setActiveSessionId(res.data[0].id);
      }
    } catch (err) {
      console.error("Failed to load sessions", err);
    }
  };

  const fetchSessionHistory = async (id: number) => {
    try {
      const res = await axios.get(`http://127.0.0.1:8088/api/chat/sessions/${id}`);
      setMessages(res.data.messages);
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  const createNewSession = async () => {
    try {
      const title = `Session ${new Date().toLocaleString()}`;
      const res = await axios.post('http://127.0.0.1:8088/api/chat/sessions', { title });
      setSessions([res.data, ...sessions]);
      setActiveSessionId(res.data.id);
    } catch (err) {
      console.error("Failed to create session", err);
    }
  };

  const deleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.delete(`http://127.0.0.1:8088/api/chat/sessions/${id}`);
      setSessions(sessions.filter(s => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(sessions.find(s => s.id !== id)?.id || null);
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeSessionId) return;

    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await axios.post(`http://127.0.0.1:8088/api/chat/sessions/${activeSessionId}/ask`, { question: userMsg });
      setMessages(prev => [...prev, { role: 'agent', content: res.data.response }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'agent', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Gemini Interactive Agent</h2>
        <p style={{ color: 'var(--text-muted)' }}>Ask questions about HDI operations or forecasts.</p>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '1rem', overflow: 'hidden' }}>
        
        {/* Sidebar */}
        <div className="glass-panel" style={{ width: '250px', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
          <button onClick={createNewSession} className="glass-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.75rem' }}>
            <PlusCircle size={18} /> New Chat
          </button>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sessions.map(s => (
              <div 
                key={s.id} 
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem',
                  background: activeSessionId === s.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s',
                  color: 'white'
                }}
                onClick={() => setActiveSessionId(s.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                  <MessageSquare size={16} style={{ flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' }}>
                    {s.title}
                  </span>
                </div>
                <button 
                  onClick={(e) => deleteSession(s.id, e)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--danger, #ff4d4f)', cursor: 'pointer', padding: '4px' }}
                  title="Delete Session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.length === 0 && (
               <div style={{ margin: 'auto', color: 'var(--text-muted)', textAlign: 'center' }}>
                 <Bot size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                 <p>Start a conversation. Ask for a visualization!</p>
               </div>
            )}
            
            {messages.map((msg, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                gap: '1rem', 
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
              }}>
                <div style={{ 
                  width: '36px', height: '36px', borderRadius: '50%', 
                  background: msg.role === 'user' ? 'var(--primary)' : 'var(--secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {msg.role === 'user' ? <User size={18} color="white" /> : <Bot size={18} color="white" />}
                </div>
                <div style={{ 
                  background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  padding: '1rem', borderRadius: '12px',
                  border: msg.role === 'agent' ? '1px solid var(--border-glass)' : 'none',
                  color: 'white',
                  lineHeight: '1.5'
                }}>
                  {/* Handle HTML rendering safely for graphs and parsed markdown */}
                  <MessageContent msg={msg} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', gap: '1rem', alignSelf: 'flex-start' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={18} color="white" />
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <Loader2 size={20} className="animate-spin text-text-muted" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border-glass)' }}>
            <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Ask anything..." 
                className="glass-input" 
                style={{ flex: 1 }}
                disabled={isLoading || !activeSessionId}
              />
              <button type="submit" className="glass-button" disabled={isLoading || !input.trim() || !activeSessionId}>
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWidget;
