/**
 * BananaChallengeModal — the client face of the Banana API integration (INTEROPERABILITY).
 *
 * The browser never talks to the Banana service. The flow is:
 *   1. api.requestPuzzle(gameId)  → POST /api/v1/games/:id/puzzles
 *   2. Express calls https://marcconrad.com/uob/banana/api.php (base64 mode), keeps the SOLUTION and the
 *      image bytes in MongoDB, and returns only { id, imageUrl, expiresAt, attemptsRemaining, maxAttempts }.
 *   3. This component shows the image from our own owner-checked route (/api/v1/puzzles/:id/image).
 *   4. The player submits a digit → api.verify() → the SERVER compares it with its stored solution.
 *   5. { correct: true } → onSolved() → engine.unlockDoor(). The UI never decides correctness.
 *
 * EVENT PRODUCERS: onSolved → 'puzzle:solved', onClose → 'puzzle:dismissed' (wired in Play.tsx).
 *
 * Robustness: AbortController + a request token stop stale/duplicate requests (React re-renders, retries);
 * a synchronous ref blocks double submission; every failure shows an honest message with a retry.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Dialog from './Dialog';
import { CloseIcon, ClockIcon } from './icons';
import { api, ApiError, type PuzzleDto, type VerifyResult } from '../services/api.service';
import { sfx } from '../services/audio.service';

interface Props {
  gameId: string;
  levelLabel: string;
  onSolved: (result: VerifyResult) => void;
  onClose: () => void;
}

type Feedback = { kind: 'info' | 'bad' | 'good'; text: string };
type Load = 'loading' | 'ready' | 'error' | 'solved';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function BananaChallengeModal({ gameId, levelLabel, onSolved, onClose }: Props) {
  const [load, setLoad] = useState<Load>('loading');
  const [puzzle, setPuzzle] = useState<PuzzleDto | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'info', text: 'Summoning a riddle from the Banana Oracle…' });
  const [submitting, setSubmitting] = useState(false);
  const [img, setImg] = useState<'loading' | 'ok' | 'broken'>('loading');
  const [imgKey, setImgKey] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  // Client clock ahead of the server's → a fresh puzzle would look expired. Then we hide the countdown and let the server decide.
  const [skewed, setSkewed] = useState(false);

  const input = useRef<HTMLInputElement>(null);
  const inflight = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);

  const fetchPuzzle = useCallback(async (message?: string) => {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    setLoad('loading'); setPuzzle(null); setAnswer(''); setInvalid(false); setImg('loading'); setCooldownUntil(null);
    setFeedback({ kind: 'info', text: message ?? 'Summoning a riddle from the Banana Oracle…' });
    try {
      const p = await api.requestPuzzle(gameId, ctl.signal);
      if (ctl.signal.aborted) return;
      setNow(Date.now());
      setSkewed(Date.parse(p.expiresAt) - Date.now() < 5000);
      setPuzzle(p);
      setLoad('ready');
      setFeedback({ kind: 'info', text: 'Study the equations. Each banana hides the same digit — which one?' });
    } catch (e) {
      if (ctl.signal.aborted) return;
      setLoad('error');
      if (e instanceof ApiError && e.status === 429) {
        const until = /until (\S+)/.exec(e.message)?.[1];
        const t = until ? Date.parse(until) : NaN;
        setCooldownUntil(Number.isNaN(t) ? Date.now() + 30_000 : t);
        setFeedback({ kind: 'bad', text: 'The seal rejects you. The oracle needs a moment to recover.' });
      } else if (e instanceof ApiError && e.status === 502) {
        setFeedback({ kind: 'bad', text: 'The Banana puzzle service could not be reached. Nothing was lost — try again.' });
      } else if (e instanceof ApiError) {
        setFeedback({ kind: 'bad', text: e.message });
      } else {
        setFeedback({ kind: 'bad', text: 'Could not reach the game server. Check your connection and try again.' });
      }
    }
  }, [gameId]);

  useEffect(() => {
    void fetchPuzzle();
    return () => { inflight.current?.abort(); timers.current.forEach(clearTimeout); };
  }, [fetchPuzzle]);

  // One-second clock for the expiry and cooldown countdowns (only runs while something is counting down).
  const counting = (puzzle && load === 'ready') || cooldownUntil;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [counting]);

  const secondsLeft = puzzle ? Math.max(0, Math.ceil((Date.parse(puzzle.expiresAt) - now) / 1000)) : 0;
  const cooldownLeft = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  // The puzzle faded: fetch a fresh one automatically.
  useEffect(() => {
    if (load === 'ready' && puzzle && !skewed && secondsLeft === 0) void fetchPuzzle('The riddle faded. A new one has been summoned.');
  }, [load, puzzle, skewed, secondsLeft, fetchPuzzle]);

  useEffect(() => { if (load === 'ready' && img === 'ok') input.current?.focus(); }, [load, img]);

  /** Shake without remounting the input (a remount would drop keyboard focus). Skipped under reduced motion. */
  const shakeInput = () => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
    if (calm) return;
    input.current?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: 380 });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || load !== 'ready' || !puzzle) return;
    if (!/^[0-9]$/.test(answer)) { setFeedback({ kind: 'bad', text: 'Enter a single digit from 0 to 9.' }); return; }
    busy.current = true;
    setSubmitting(true);
    try {
      const res = await api.verify(puzzle.id, Number(answer));
      if (res.correct) {
        sfx.correct();
        setLoad('solved');
        setFeedback({ kind: 'good', text: 'Correct! The seal shatters.' });
        timers.current.push(window.setTimeout(() => onSolved(res), 1300));
        return;
      }
      sfx.wrong();
      setInvalid(true);
      shakeInput();
      setAnswer('');
      const left = res.attemptsRemaining ?? 0;
      setPuzzle({ ...puzzle, attemptsRemaining: left });
      if (left <= 0) { busy.current = false; setSubmitting(false); await fetchPuzzle(); return; }
      setFeedback({ kind: 'bad', text: `Not that digit. ${left} attempt${left === 1 ? '' : 's'} remaining.` });
      input.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        busy.current = false; setSubmitting(false);
        await fetchPuzzle('That riddle is no longer valid. A new one has been summoned.');
        return;
      }
      setFeedback({ kind: 'bad', text: err instanceof ApiError ? err.message : 'Network error — your answer was not submitted. Try again.' });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const used = puzzle ? puzzle.maxAttempts - puzzle.attemptsRemaining : 0;
  const ready = load === 'ready' && !!puzzle;

  return (
    <Dialog className="challenge-overlay" labelledBy="challenge-title" onClose={onClose} locked={submitting || load === 'solved'}>
      <div className={`challenge ${load === 'solved' ? 'is-solved' : ''}`}>
        <header className="challenge-head">
          <div>
            <p className="eyebrow">{levelLabel}</p>
            <h2 id="challenge-title">The Rune Seal</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={submitting || load === 'solved'} aria-label="Step back from the door">
            <CloseIcon />
          </button>
        </header>

        <div className="challenge-body">
          <figure className="challenge-art">
            <div className="art-frame">
              {puzzle && (
                <img
                  key={imgKey}
                  className="art-img"
                  src={puzzle.imageUrl}
                  alt="Banana puzzle: a grid of six arithmetic equations in which a banana stands for one hidden digit"
                  onLoad={() => setImg('ok')}
                  onError={() => setImg('broken')}
                  style={{ visibility: img === 'ok' ? 'visible' : 'hidden' }}
                />
              )}
              {(load === 'loading' || (ready && img === 'loading')) && (
                <div className="art-state" role="status"><span className="spinner" aria-hidden="true" /><span>Summoning the riddle…</span></div>
              )}
              {ready && img === 'broken' && (
                <div className="art-state"><span>The riddle image failed to load.</span>
                  <button type="button" onClick={() => { setImg('loading'); setImgKey((k) => k + 1); }}>Reload image</button></div>
              )}
              {load === 'error' && (
                <div className="art-state">
                  <span aria-hidden="true" className="art-glyph">ᚦ</span>
                  <span>{cooldownLeft > 0 ? `Try again in ${cooldownLeft}s` : 'The riddle could not be summoned.'}</span>
                  <button type="button" onClick={() => void fetchPuzzle()} disabled={cooldownLeft > 0}>Try again</button>
                </div>
              )}
              {load === 'solved' && <div className="art-burst" aria-hidden="true" />}
            </div>
            <figcaption>Riddle served by the Banana API (University of Bedfordshire) · checked on our server</figcaption>
          </figure>

          <form className="challenge-side" onSubmit={submit} noValidate>
            <p className="instruction">
              Six equations share one secret: every <span aria-label="banana">🍌</span> stands for the <strong>same digit</strong>.
              Solve for it, then speak the digit to break the seal.
            </p>

            <div className="answer">
              <label htmlFor="challenge-answer">Your answer (0–9)</label>
              <div className="answer-row">
                <input
                  ref={input}
                  id="challenge-answer"
                  className="answer-input"
                  value={answer}
                  aria-invalid={invalid || undefined}
                  onChange={(e) => { setInvalid(false); setAnswer(e.target.value.replace(/\D/g, '').slice(-1)); }}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={1}
                  placeholder="?"
                  disabled={!ready}
                  readOnly={submitting}   // not disabled: a disabled field would drop keyboard focus mid-request
                  aria-describedby="challenge-feedback"
                />
                <button type="submit" className="primary" disabled={!ready || submitting || answer === ''}>
                  {submitting ? 'Checking…' : 'Break the seal'}
                </button>
              </div>
              <div className="digit-pad" role="group" aria-label="Digit pad">
                {Array.from({ length: 10 }, (_, d) => (
                  <button key={d} type="button" className="ghost digit" onClick={() => { setInvalid(false); setAnswer(String(d)); input.current?.focus(); }}
                    disabled={!ready || submitting} aria-label={`Digit ${d}`} aria-pressed={answer === String(d)}>{d}</button>
                ))}
              </div>
            </div>

            <div className="meta">
              <div className="pips" role="img" aria-label={puzzle ? `${puzzle.attemptsRemaining} of ${puzzle.maxAttempts} attempts remaining` : 'Attempts'}>
                {Array.from({ length: puzzle?.maxAttempts ?? 3 }, (_, i) => <span key={i} className={`pip ${i < used ? 'used' : ''}`} />)}
                <span className="pip-label">{puzzle ? `${puzzle.attemptsRemaining} attempt${puzzle.attemptsRemaining === 1 ? '' : 's'} left` : '—'}</span>
              </div>
              {ready && !skewed && <span className="expiry"><ClockIcon /> Seal fades in {fmt(secondsLeft)}</span>}
            </div>

            <p id="challenge-feedback" className={`feedback ${feedback.kind}`} role="status" aria-live="polite">{feedback.text}</p>

            <div className="challenge-actions">
              <button type="button" className="ghost" onClick={onClose} disabled={submitting || load === 'solved'}>Step back</button>
              <span className="hint">Esc closes · Enter submits</span>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  );
}
