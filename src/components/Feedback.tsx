import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Branded loading state (used for route chunks and game bootstrap). */
export function LoadingScreen({ label = 'Lighting the torches…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-flame" aria-hidden="true"><i /><i /><i /></div>
      <p>{label}</p>
    </div>
  );
}

/** A friendly full-screen error with real actions. */
export function ErrorScreen({ title, message, actions }: { title: string; message: string; actions?: ReactNode }) {
  return (
    <div className="loading error-screen" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="row">{actions ?? <Link className="btn ghost" to="/">Back to menu</Link>}</div>
    </div>
  );
}

/** Catches rendering/WebGL crashes so a scene failure never white-screens the app. */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error('Scene crashed', err.message, info.componentStack?.split('\n')[1]?.trim()); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorScreen
        title="The dungeon failed to render"
        message="Something went wrong while drawing the scene. Your progress is saved on the server."
        actions={<><button type="button" onClick={() => location.reload()}>Reload</button><Link className="btn ghost" to="/">Back to menu</Link></>}
      />
    );
  }
}
