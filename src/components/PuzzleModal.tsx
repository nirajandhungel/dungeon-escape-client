/**
 * PuzzleModal — Banana API interoperability UI
 *
 * INTEROPERABILITY BOUNDARY:
 * This component is the client-side face of the Banana API integration.
 * It does NOT call the Banana API directly. Instead:
 *   1. It calls api.requestPuzzle(gameId)  → POST /api/v1/games/:id/puzzles
 *   2. Express fetches from Banana API server-side (BananaClient.fetchPuzzle)
 *   3. Express stores the puzzle+solution in MongoDB, returns PuzzleDto (no solution)
 *   4. Component renders the puzzle image via the server image proxy
 *   5. Player submits an answer digit
 *   6. Component calls api.verify(puzzleId, answer) → POST /api/v1/puzzles/:id/verify
 *   7. Express compares answer against stored solution — result returned
 *   8. If correct → onSolved() → bus.emit('puzzle:solved') → DungeonScene.unlockDoor()
 *
 * WHY SERVER-SIDE VALIDATION:
 * The solution never reaches the browser. Even if the player inspects network
 * traffic, they only see the puzzle image URL and attempt counts — not the answer.
 *
 * IMAGE PROXY:
 * Banana API images come from sanfoh.com (may be plain HTTP). The browser would
 * block these as mixed-content. We route them through /api/v1/puzzle-image which
 * fetches server-side and serves via the same HTTPS origin.
 *
 * EVENT PRODUCERS from this component:
 *   puzzle:solved    → via onSolved() prop → Play.tsx → bus.emit('puzzle:solved')
 *   puzzle:dismissed → via onClose() prop  → Play.tsx → bus.emit('puzzle:dismissed')
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type PuzzleDto } from '../api';

interface Props {
  gameId: string;
  onSolved: () => void;
  onClose: () => void;
}

const MAX_ATTEMPTS = 3;

export default function PuzzleModal({ gameId, onSolved, onClose }: Props) {
  const [puzzle, setPuzzle] = useState<PuzzleDto | null>(null);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'neutral' | 'bad' | 'good'>('neutral');
  const [pending, setPending] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // ── Fetch puzzle from server (which calls Banana API) ─────────────────
  const load = useCallback(async () => {
    setPending(true);
    setPuzzle(null);
    setAnswer('');
    setImgLoaded(false);
    setMessage('Summoning a puzzle from the Banana Oracle…');
    setMsgType('neutral');
    try {
      const p = await api.requestPuzzle(gameId);
      setPuzzle(p);
      setMessage('Find the missing digit in the image.');
      setMsgType('neutral');
    } catch (e) {
      setMsgType('bad');
      if (e instanceof ApiError && e.status === 429) {
        setMessage(e.message);
      } else {
        setMessage('The puzzle oracle is unreachable. Try again in a moment.');
      }
    } finally {
      setPending(false);
    }
  }, [gameId]);

  useEffect(() => { void load(); }, [load]);

  // Auto-focus the input once the puzzle image arrives
  useEffect(() => { if (puzzle && imgLoaded) input.current?.focus(); }, [puzzle, imgLoaded]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Submit answer ───────────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puzzle || pending || answer === '') return;
    setPending(true);
    try {
      const res = await api.verify(puzzle.id, Number(answer));
      if (res.correct) {
        setMessage('Correct! The seal shatters!');
        setMsgType('good');
        setTimeout(onSolved, 600); // brief pause so player sees the confirmation
        return;
      }
      setMsgType('bad');
      setAnswer('');
      const left = res.attemptsRemaining ?? 0;
      if (left <= 0) {
        setMessage('No attempts remaining. A new puzzle will be summoned.');
        setPuzzle(null);
      } else {
        setMessage(`Wrong. ${left} attempt${left === 1 ? '' : 's'} remaining.`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        // Puzzle expired or exhausted — get a fresh one
        await load();
        return;
      }
      setMsgType('bad');
      setMessage(err instanceof ApiError ? err.message : 'Network error. Try again.');
    } finally {
      setPending(false);
    }
  };

  const attemptsUsed = puzzle ? MAX_ATTEMPTS - puzzle.attemptsRemaining : 0;
  const proxyImageUrl = puzzle ? api.puzzleImageUrl(puzzle.imageUrl) : '';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="puzzle-title">
      <form className="card puzzle-card" onSubmit={submit}>
        {/* Header */}
        <div className="puzzle-header">
          <div className="puzzle-rune" aria-hidden="true">⚙️</div>
          <div>
            <h2 id="puzzle-title">The Rune Door</h2>
            <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
              Powered by the Banana API — puzzle fetched from an external service
            </p>
          </div>
        </div>

        {/* Puzzle image area */}
        <div className="puzzle-img-wrap" aria-label="Puzzle image">
          {puzzle && (
            <img
              className="puzzle-img"
              src={proxyImageUrl}
              alt="Banana puzzle: find the missing digit"
              onLoad={() => setImgLoaded(true)}
              style={{ display: imgLoaded ? 'block' : 'none' }}
            />
          )}
          {(!puzzle || !imgLoaded) && (
            <div className="puzzle-loading">
              {pending ? <div className="puzzle-spinner" aria-label="Loading puzzle" /> : '⚠️'}
            </div>
          )}
        </div>

        {/* Status message */}
        <p className={`msg ${msgType === 'bad' ? 'bad' : msgType === 'good' ? 'good' : ''}`} role="status">
          {message}
        </p>

        {/* Attempt pips */}
        {puzzle && (
          <div className="attempts-bar" aria-label={`${puzzle.attemptsRemaining} attempts remaining`}>
            {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
              <div
                key={i}
                className={`attempt-pip ${i < attemptsUsed ? 'used' : 'active'}`}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Answer input */}
        <div className="answer-row">
          <input
            ref={input}
            className="answer-input"
            value={answer}
            onChange={(e) => setAnswer(e.target.value.replace(/\D/g, '').slice(0, 1))}
            inputMode="numeric"
            aria-label="Enter the missing digit (0–9)"
            placeholder="?"
            disabled={!puzzle || pending}
            maxLength={1}
            id="puzzle-answer-input"
          />
          <button
            type="submit"
            id="puzzle-submit-btn"
            disabled={!puzzle || pending || answer === ''}
          >
            Break the Seal
          </button>
          {!puzzle && !pending && (
            <button type="button" id="puzzle-retry-btn" onClick={load}>Retry</button>
          )}
          <button
            type="button"
            id="puzzle-close-btn"
            className="ghost sm"
            onClick={onClose}
            style={{ marginLeft: 'auto' }}
          >
            Step Back
          </button>
        </div>

        <p className="muted" style={{ marginTop: '1rem', fontSize: '.75rem' }}>
          Tip: Look for the number sequence in the puzzle image. Enter a single digit 0–9.
        </p>
      </form>
    </div>
  );
}
