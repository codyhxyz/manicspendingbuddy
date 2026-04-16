import { useState, useEffect } from 'react';
import type { AIAvailability } from '@/lib/claude';
import { sendMessage } from '@/utils/messaging';

function App() {
  const [dailyBudget, setDailyBudget] = useState('20');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState<AIAvailability>('unsupported');

  useEffect(() => {
    sendMessage('getSettings', undefined)
      .then((settings) => setDailyBudget(String(settings.dailyBudget || 20)))
      .finally(() => setLoading(false));

    sendMessage('checkAIStatus', undefined).then(setAiStatus);
  }, []);

  const handleSave = async () => {
    await sendMessage('saveSettings', { dailyBudget: parseFloat(dailyBudget) || 20 });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="options loading">Loading...</div>;

  return (
    <div className="options">
      <h1>Manic Spending Buddy</h1>
      <p className="subtitle">Settings</p>

      <div className="field">
        <label>Chrome AI Status</label>
        <div className={`ai-status ai-status-${aiStatus}`}>
          {aiStatus === 'readily' && 'Ready — Gemini Nano is available on this device'}
          {aiStatus === 'after-download' && 'Downloading model — this may take a few minutes...'}
          {aiStatus === 'no' && 'Not available on this device'}
          {aiStatus === 'unsupported' && 'Not supported in this browser'}
        </div>
        {(aiStatus === 'no' || aiStatus === 'unsupported') && (
          <p className="hint">
            Chrome's built-in AI requires a recent version of Google Chrome. Try updating Chrome and restarting.
          </p>
        )}
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

      <button className="save-btn" onClick={handleSave}>
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

export default App;
