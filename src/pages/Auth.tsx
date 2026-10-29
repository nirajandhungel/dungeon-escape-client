import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const register = mode === 'register';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      const user = register
        ? await api.register(email, name, password)
        : await api.login(email, password);
      setUser(user);
      nav('/play');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Network error. Is the server running?');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth" onSubmit={submit} aria-label={register ? 'Registration form' : 'Login form'}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>{register ? '⚔️' : '🗝️'}</div>
          <h2>{register ? 'Create Your Adventurer' : 'Welcome Back'}</h2>
          <p className="muted" style={{ marginTop: '.25rem' }}>
            {register ? 'Your legend begins here.' : 'The dungeon awaits.'}
          </p>
        </div>

        <hr className="divider" />

        <label htmlFor="auth-email">Email
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="adventurer@example.com"
          />
        </label>

        {register && (
          <label htmlFor="auth-name">Display Name
            <input
              id="auth-name"
              required
              minLength={2}
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your adventurer name"
            />
          </label>
        )}

        <label htmlFor="auth-password">
          Password {register && <span className="muted" style={{ fontWeight: 400 }}>(12+ characters)</span>}
          <input
            id="auth-password"
            type={show ? 'text' : 'password'}
            required
            minLength={register ? 12 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={register ? 'new-password' : 'current-password'}
            placeholder={register ? 'At least 12 characters' : 'Your password'}
          />
        </label>

        <label className="check">
          <input
            id="auth-show-pw"
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />
          Show password
        </label>

        {error && <p className="msg bad" role="alert" aria-live="assertive">{error}</p>}

        <button type="submit" id="auth-submit-btn" disabled={pending} style={{ width: '100%', padding: '.7rem' }}>
          {pending ? 'Please wait…' : register ? 'Create Adventurer' : 'Enter the Dungeon'}
        </button>

        <p className="muted" style={{ textAlign: 'center' }}>
          {register
            ? <><span>Already an adventurer? </span><Link to="/login" id="auth-switch-login">Login</Link></>
            : <><span>New here? </span><Link to="/register" id="auth-switch-register">Register</Link></>
          }
        </p>
      </form>
    </div>
  );
}
