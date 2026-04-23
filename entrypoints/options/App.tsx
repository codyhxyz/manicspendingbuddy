import { useState, useEffect } from 'react';
import type { AIAvailability } from '@/lib/claude';
import { sendMessage } from '@/utils/messaging';

function App() {
  const [dailyBudget, setDailyBudget] = useState('20');
  const [holdModeEnabled, setHoldModeEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState<AIAvailability>('ready');

  useEffect(() => {
    sendMessage('getSettings', undefined)
      .then((settings) => {
        setDailyBudget(String(settings.dailyBudget || 20));
        setHoldModeEnabled(settings.holdModeEnabled ?? false);
      })
      .finally(() => setLoading(false));

    sendMessage('checkAIStatus', undefined).then(setAiStatus);
  }, []);

  const handleSave = async () => {
    await sendMessage('saveSettings', {
      dailyBudget: parseFloat(dailyBudget) || 20,
      holdModeEnabled,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="options loading">Loading...</div>;

  return (
    <div className="options">
      <h1>Manic Spending Buddy</h1>
      <p className="subtitle">Settings</p>

      <div className="field">
        <label>Buddy status</label>
        <div className={`ai-status ai-status-${aiStatus}`}>
          {aiStatus === 'ready' && 'Ready'}
          {aiStatus === 'error' && 'Unreachable right now — we\'ll retry automatically.'}
        </div>
      </div>

      <div className="field">
        <label htmlFor="budget">Daily Discretionary Budget ($)</label>
        <input
          id="budget"
          type="number"
          min="0"
          step="5"
          value={dailyBudget}
          onChange={(e) => setDailyBudget(e.target.value)}
        />
        <p className="hint">
          How much you're OK spending per day on non-essentials. The buddy uses this for context.
        </p>
      </div>

      <div className="field">
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={holdModeEnabled}
            onChange={(e) => setHoldModeEnabled(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>Second-thought mode (48-hour hold)</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              When on, "Add anyway" puts the item on ice for 48 hours instead of adding it right now.
              You'll get a heads-up when time's up. You can release early if it's a real emergency.
            </div>
          </div>
        </label>
      </div>

      <button className="save-btn" onClick={handleSave}>
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

export default App;
