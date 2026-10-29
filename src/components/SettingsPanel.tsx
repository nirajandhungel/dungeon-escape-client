import Dialog from './Dialog';
import { CloseIcon } from './icons';
import { sfx } from '../audio';
import { updateSettings, useSettings } from '../settings';

/** Every control here changes real behaviour (see settings.ts). Changes apply instantly and persist. */
export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  return (
    <Dialog className="menu-overlay" labelledBy="settings-title" onClose={onClose}>
      <div className="panel settings">
        <header className="panel-head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings"><CloseIcon /></button>
        </header>

        <div className="setting">
          <div><strong>Sound effects</strong><p>Footsteps, the key chime, the door and the oracle.</p></div>
          <label className="switch">
            <input type="checkbox" checked={s.sound} onChange={(e) => { updateSettings({ sound: e.target.checked }); if (e.target.checked) setTimeout(sfx.key, 30); }} />
            <span className="switch-ui" /><span className="sr">Sound effects</span>
          </label>
        </div>
        <div className="setting">
          <div><strong>Volume</strong></div>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} disabled={!s.sound}
            onChange={(e) => updateSettings({ volume: Number(e.target.value) })} onPointerUp={sfx.click} aria-label="Volume" />
        </div>
        <div className="setting">
          <div><strong>Reduce motion</strong><p>No camera shake, flame flicker or drifting dust. Also follows your system setting.</p></div>
          <label className="switch">
            <input type="checkbox" checked={s.reduceMotion} onChange={(e) => updateSettings({ reduceMotion: e.target.checked })} />
            <span className="switch-ui" /><span className="sr">Reduce motion</span>
          </label>
        </div>
        <fieldset className="setting stack">
          <legend><strong>Graphics</strong><p>Balanced lowers resolution, shadow detail and particles for slower laptops.</p></legend>
          <div className="seg">
            {(['balanced', 'high'] as const).map((g) => (
              <label key={g} className={s.graphics === g ? 'on' : ''}>
                <input type="radio" name="graphics" checked={s.graphics === g} onChange={() => updateSettings({ graphics: g })} />
                {g === 'high' ? 'High' : 'Balanced'}
              </label>
            ))}
          </div>
        </fieldset>
        <footer className="panel-foot"><button type="button" onClick={onClose} data-autofocus>Done</button></footer>
      </div>
    </Dialog>
  );
}
