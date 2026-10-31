import { useState } from 'react';
import { api, ApiError, type Stats } from '../services/api.service';
import { sfx } from '../services/audio.service';

/**
 * The Armory: capes are cosmetic REWARDS. The server decides which are unlocked (from achievements) and re-checks on equip,
 * so the client can only offer the choice — never grant one. The equipped colour is applied to the hero in the 3D scene.
 */
export default function CapePicker({ stats, onChange }: { stats: Stats; onChange(next: Stats): void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const equip = async (id: string) => {
    if (busy || id === stats.cape) return;
    setBusy(id); setError('');
    try {
      const { cape } = await api.setCape(id);
      sfx.correct();
      onChange({ ...stats, cape });
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'cape_locked' ? 'That cape is still locked.' : 'Could not equip that cape. Try again.');
    } finally { setBusy(''); }
  };

  return (
    <div className="capes">
      <ul role="radiogroup" aria-label="Hero cape">
        {stats.capes.map((c) => {
          const on = c.id === stats.cape, locked = !c.unlocked;
          return (
            <li key={c.id}>
              <button type="button" role="radio" aria-checked={on} className={`cape ${on ? 'on' : ''}`} disabled={locked || !!busy} onClick={() => equip(c.id)}>
                <i className="swatch" style={{ background: c.color }} aria-hidden="true" />
                <span className="cape-name">{c.name}</span>
                <small>{on ? 'Equipped' : locked ? 'Locked' : 'Equip'}</small>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted">Earn achievements to unlock more capes. Your choice is saved to your account.</p>
      {error && <p className="feedback bad" role="alert">{error}</p>}
    </div>
  );
}
