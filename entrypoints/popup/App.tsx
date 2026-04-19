import { useState, useEffect } from 'react';
import type { Intervention } from '@/lib/types';
import type { AIAvailability } from '@/lib/claude';
import { sendMessage, type StateResponse } from '@/utils/messaging';

function hoursLeft(releaseAt?: number): number {
  if (!releaseAt) return 0;
  return Math.max(0, Math.ceil((releaseAt - Date.now()) / (60 * 60 * 1000)));
}

function App() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState<AIAvailability>('ready');

  useEffect(() => {
    sendMessage('getState', undefined)
      .then(setState)
      .finally(() => setLoading(false));
    sendMessage('checkAIStatus', undefined).then(setAiStatus);
  }, []);

  if (loading) return <div className="loading">Loading...</div>;
  if (!state) return <div className="error">Could not load data.</div>;

  const aiUnavailable = aiStatus !== 'ready';
  const recentInterventions = state.interventions.slice(0, 5);

  return (
    <div className="popup">
      <header className="header">
        <h1>Manic Spending Buddy</h1>
      </header>

      {aiUnavailable && (
        <div className="warning">
          {aiStatus === 'no-key' ? 'Add your MiniMax API key' : 'MiniMax unreachable'}{' '}
          <a href="#" onClick={() => chrome.runtime.openOptionsPage()}>
            Open Options
          </a>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card stat-saved">
          <div className="stat-value">${state.totalSaved.toFixed(2)}</div>
          <div className="stat-label">Total saved</div>
        </div>
        <div className="stat-card stat-streak">
          <div className="stat-value">{state.currentStreak}</div>
          <div className="stat-label">Day streak</div>
        </div>
        <div className="stat-card stat-budget">
          <div className="stat-value">${(state.settings.dailyBudget - (state.spentToday ?? 0)).toFixed(0)}</div>
          <div className="stat-label">Left today</div>
        </div>
        <div className="stat-card stat-total">
          <div className="stat-value">{state.interventions.length}</div>
          <div className="stat-label">Interventions</div>
        </div>
      </div>

      {(() => {
        const active = state.savedForLater.filter(
          (i) => i.kind === 'hold' && i.releaseAt && i.releaseAt > Date.now(),
        );
        if (active.length === 0) return null;
        return (
          <section className="section">
            <h2>On ice ({active.length})</h2>
            {active.map((item) => (
              <div key={item.id} className="on-ice-item">
                <div className="on-ice-title">{item.product.title.slice(0, 50)}</div>
                <div className="on-ice-meta">
                  <span>{item.product.price}</span>
                  <span>·</span>
                  <span>{hoursLeft(item.releaseAt)}h left</span>
                  <button
                    className="on-ice-release"
                    onClick={async () => {
                      const reason = window.prompt('Why the emergency? (logged for your own reflection)');
                      if (reason === null) return;
                      await sendMessage('releaseHold', { id: item.id, overrideReason: reason });
                      const fresh = await sendMessage('getState', undefined);
                      setState(fresh);
                    }}
                  >
                    Release
                  </button>
                </div>
              </div>
            ))}
          </section>
        );
      })()}

      {(() => {
        const wishlist = state.savedForLater.filter((i) => i.kind !== 'hold');
        if (wishlist.length === 0) return null;
        return (
          <section className="section">
            <h2>Saved for Later ({wishlist.length})</h2>
            {wishlist.slice(0, 3).map((item) => (
              <div key={item.id} className="saved-item">
                <span className="saved-title">{item.product.title.slice(0, 50)}...</span>
                <span className="saved-price">{item.product.price}</span>
              </div>
            ))}
          </section>
        );
      })()}

      {recentInterventions.length > 0 && (
        <section className="section">
          <h2>Recent</h2>
          {recentInterventions.map((i) => (
            <InterventionRow key={i.id} intervention={i} />
          ))}
        </section>
      )}

      <footer className="footer">
        <a href="#" onClick={() => chrome.runtime.openOptionsPage()}>Settings</a>
      </footer>
    </div>
  );
}

function InterventionRow({ intervention: i }: { intervention: Intervention }) {
  const icon = i.decision === 'skipped' ? 'pass' : i.decision === 'saved' ? 'save' : 'cart';
  const label = i.decision === 'skipped' ? 'Skipped' : i.decision === 'saved' ? 'Saved' : 'Added';
  const timeAgo = getTimeAgo(i.timestamp);

  return (
    <div className={`intervention-row decision-${i.decision}`}>
      <div className="intervention-icon">{icon === 'pass' ? '\u2714' : icon === 'save' ? '\u23F0' : '\u{1F6D2}'}</div>
      <div className="intervention-detail">
        <div className="intervention-title">{i.product.title.slice(0, 40)}...</div>
        <div className="intervention-meta">{label} {i.product.price} — {timeAgo}</div>
      </div>
    </div>
  );
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default App;
