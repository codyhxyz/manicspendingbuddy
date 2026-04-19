import { useState, useEffect, useRef } from 'react';
import type { ProductInfo, Intervention, SavedItem } from '@/lib/types';
import { sendMessage } from '@/utils/messaging';

interface Props {
  product: ProductInfo;
  onClose: () => void;
  onAddAnyway: () => void;
}

function BuddyIcon() {
  return (
    <svg
      className="msb-buddy"
      width="84"
      height="84"
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        className="msb-buddy-shadow"
        cx="64"
        cy="122"
        rx="26"
        ry="3"
        fill="#1b3a1e"
        opacity="0.22"
      />

      <ellipse cx="64" cy="88" rx="28" ry="30" fill="#4CAF50" />

      <g className="msb-buddy-arms">
        <line
          x1="42"
          y1="72"
          x2="30"
          y2="36"
          stroke="#4CAF50"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <line
          x1="86"
          y1="72"
          x2="98"
          y2="36"
          stroke="#4CAF50"
          strokeWidth="6"
          strokeLinecap="round"
        />

        <g className="msb-buddy-eye msb-buddy-eye-left">
          <circle cx="30" cy="28" r="12" fill="#fff" stroke="#333" strokeWidth="1.5" />
          <circle className="msb-buddy-pupil" cx="32" cy="27" r="5" fill="#333" />
          <circle cx="34" cy="25" r="1.5" fill="#fff" />
        </g>

        <g className="msb-buddy-eye msb-buddy-eye-right">
          <circle cx="98" cy="28" r="12" fill="#fff" stroke="#333" strokeWidth="1.5" />
          <circle className="msb-buddy-pupil" cx="96" cy="27" r="5" fill="#333" />
          <circle cx="94" cy="25" r="1.5" fill="#fff" />
        </g>
      </g>

      <path
        d="M50 94 Q64 106 78 94"
        stroke="#2E7D32"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InterventionOverlay({ product, onClose, onAddAnyway }: Props) {
  const [step, setStep] = useState<'ask' | 'thinking' | 'response' | 'degraded'>('ask');
  const [userGoal, setUserGoal] = useState('');
  const [claudeResponse, setClaudeResponse] = useState('');
  const [error, setError] = useState('');
  const [dailyBudget, setDailyBudget] = useState(20);
  const [spentToday, setSpentToday] = useState(0);
  const [holdModeEnabled, setHoldModeEnabled] = useState(false);
  const [heldConfirmation, setHeldConfirmation] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus the text input when overlay opens
    setTimeout(() => inputRef.current?.focus(), 100);

    sendMessage('getState', undefined).then((state) => {
      setDailyBudget(state.settings?.dailyBudget ?? 20);
      setSpentToday(state.spentToday ?? 0);
      setHoldModeEnabled(state.settings?.holdModeEnabled ?? false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!userGoal.trim()) return;

    setStep('thinking');
    setError('');

    try {
      const response = await sendMessage('analyzePurchase', {
        product,
        userGoal: userGoal.trim(),
        dailyBudget,
        spentToday,
      });
      setClaudeResponse(response);
      setStep('response');
    } catch (err: any) {
      console.warn('[MSB] analyzePurchase failed, degrading', err);
      setError(err?.message || 'Something went wrong.');
      setStep('degraded');
    }
  };

  const handleSkip = async () => {
    const intervention: Intervention = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      product,
      userGoal,
      claudeResponse,
      decision: 'skipped',
      savedAmount: product.priceNumeric,
    };
    await sendMessage('logIntervention', intervention);
    onClose();
  };

  const handleAddAnyway = async () => {
    if (holdModeEnabled) {
      await sendMessage('createHold', {
        product,
        userGoal,
      });
      const intervention: Intervention = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        product,
        userGoal,
        claudeResponse,
        decision: 'held',
        savedAmount: 0,
      };
      await sendMessage('logIntervention', intervention);
      setHeldConfirmation(true);
      return;
    }

    const intervention: Intervention = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      product,
      userGoal,
      claudeResponse,
      decision: 'added',
      savedAmount: 0,
    };
    await sendMessage('logIntervention', intervention);
    onAddAnyway();
  };

  const handleSaveForLater = async () => {
    const item: SavedItem = {
      id: crypto.randomUUID(),
      kind: 'wishlist',
      product,
      userGoal,
      savedAt: Date.now(),
      reminderAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    const intervention: Intervention = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      product,
      userGoal,
      claudeResponse,
      decision: 'saved',
      savedAmount: product.priceNumeric,
    };
    await sendMessage('saveForLater', item);
    await sendMessage('logIntervention', intervention);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const budgetRemaining = Math.max(0, dailyBudget - spentToday);
  const overBudget = product.priceNumeric > budgetRemaining;

  if (heldConfirmation) {
    return (
      <>
        <style>{overlayStyles}</style>
        <div className="msb-backdrop" onClick={onClose} />
        <div className="msb-overlay">
          <div className="msb-response-section" style={{ textAlign: 'center', padding: '28px 20px' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#2a1f0a', marginBottom: 8 }}>
              OK — 48h hold.
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              I'll ping you when it's time. Most of these don't survive the wait — that's the feature working.
            </div>
            <button className="msb-submit-btn" onClick={onClose}>Got it</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{overlayStyles}</style>
      <div className="msb-backdrop" onClick={onClose} />
      <div className="msb-overlay">
        {/* Product Info Bar */}
        <div className="msb-product-bar">
          {product.imageUrl && (
            <img src={product.imageUrl} alt="" className="msb-product-img" />
          )}
          <div className="msb-product-info">
            <div className="msb-product-title">{product.title}</div>
            <div className="msb-product-price">{product.price}</div>
          </div>
          <div className="msb-budget-badge" data-over={overBudget}>
            <div className="msb-budget-label">Today's budget</div>
            <div className="msb-budget-amount">
              ${budgetRemaining.toFixed(0)} left
            </div>
          </div>
        </div>

        {/* Step 1: Ask the goal */}
        {step === 'ask' && (
          <div className="msb-ask-section">
            <div className="msb-buddy-wrapper">
              <BuddyIcon />
            </div>
            <div className="msb-question">
              What are you trying to accomplish with this?
            </div>
            <textarea
              ref={inputRef}
              className="msb-input"
              placeholder="e.g. I need a better way to organize my desk, my current setup is a mess..."
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button
              className="msb-submit-btn"
              onClick={handleSubmit}
              disabled={!userGoal.trim()}
            >
              Tell me what you think
            </button>
          </div>
        )}

        {/* Loading */}
        {step === 'thinking' && (
          <div className="msb-thinking">
            <div className="msb-spinner" />
            <span>Thinking about this...</span>
          </div>
        )}

        {/* AI failed — give user the decision themselves */}
        {step === 'degraded' && (
          <div className="msb-response-section">
            <div className="msb-degraded-note">
              Buddy's offline — you decide this one.{' '}
              {error ? <span className="msb-degraded-reason">({error})</span> : null}
            </div>
            <div className="msb-actions">
              <button className="msb-btn msb-btn-skip" onClick={handleSkip}>
                Skip it — save {product.price}
              </button>
              <button className="msb-btn msb-btn-save" onClick={handleSaveForLater}>
                Save for later
              </button>
              <button className="msb-btn msb-btn-add" onClick={handleAddAnyway}>
                Add anyway
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Response + Actions */}
        {step === 'response' && (
          <div className="msb-response-section">
            <div className="msb-response">{claudeResponse}</div>
            <div className="msb-actions">
              <button className="msb-btn msb-btn-skip" onClick={handleSkip}>
                Skip it — save {product.price}
              </button>
              <button className="msb-btn msb-btn-save" onClick={handleSaveForLater}>
                Save for later
              </button>
              <button className="msb-btn msb-btn-add" onClick={handleAddAnyway}>
                Add anyway
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const overlayStyles = `
  .msb-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 99998;
    animation: msb-fade-in 0.2s ease;
  }

  .msb-overlay {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    max-width: calc(100vw - 40px);
    background: #fffbf5;
    border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: msb-slide-down 0.3s ease;
    overflow: hidden;
  }

  @keyframes msb-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes msb-slide-down {
    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .msb-product-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: #fff;
    border-bottom: 1px solid #f0e8dd;
  }

  .msb-product-img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    border-radius: 8px;
    background: #f5f5f5;
    flex-shrink: 0;
  }

  .msb-product-info {
    flex: 1;
    min-width: 0;
  }

  .msb-product-title {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .msb-product-price {
    font-size: 15px;
    font-weight: 700;
    color: #b12704;
    margin-top: 2px;
  }

  .msb-budget-badge {
    text-align: center;
    padding: 8px 12px;
    border-radius: 10px;
    background: #e8f5e9;
    flex-shrink: 0;
  }

  .msb-budget-badge[data-over="true"] {
    background: #fff3e0;
  }

  .msb-budget-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    font-weight: 600;
  }

  .msb-budget-amount {
    font-size: 14px;
    font-weight: 700;
    color: #2e7d32;
  }

  .msb-budget-badge[data-over="true"] .msb-budget-amount {
    color: #e65100;
  }

  .msb-ask-section {
    padding: 20px 16px 22px;
  }

  .msb-buddy-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 10px;
    animation: msb-buddy-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
  }

  .msb-buddy {
    display: block;
    animation: msb-buddy-bob 2.6s ease-in-out 0.6s infinite;
    transform-origin: center bottom;
    filter: drop-shadow(0 3px 4px rgba(27, 58, 30, 0.18));
    overflow: visible;
  }

  .msb-buddy-shadow {
    transform-origin: 64px 122px;
    transform-box: fill-box;
    animation: msb-buddy-shadow-pulse 2.6s ease-in-out 0.6s infinite;
  }

  .msb-buddy-arms {
    transform-origin: 64px 78px;
    transform-box: fill-box;
    animation: msb-buddy-wiggle 2.6s ease-in-out 0.6s infinite;
  }

  .msb-buddy-pupil {
    transform-origin: center;
    transform-box: fill-box;
    animation: msb-buddy-blink 5s ease-in-out 1s infinite;
  }

  @keyframes msb-buddy-pop {
    0%   { opacity: 0; transform: scale(0.3) translateY(8px) rotate(-8deg); }
    55%  { opacity: 1; transform: scale(1.15) rotate(4deg); }
    100% { opacity: 1; transform: scale(1) translateY(0) rotate(0deg); }
  }

  @keyframes msb-buddy-bob {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-5px); }
  }

  @keyframes msb-buddy-shadow-pulse {
    0%, 100% { transform: scale(1); opacity: 0.22; }
    50%      { transform: scale(0.78); opacity: 0.14; }
  }

  @keyframes msb-buddy-wiggle {
    0%, 100% { transform: rotate(-4deg); }
    50%      { transform: rotate(4deg); }
  }

  @keyframes msb-buddy-blink {
    0%, 91%, 97%, 100% { transform: scaleY(1); }
    94%                { transform: scaleY(0.08); }
  }

  .msb-question {
    font-size: 17px;
    font-weight: 600;
    color: #2a1f0a;
    margin-bottom: 12px;
    text-align: center;
    letter-spacing: -0.01em;
  }

  .msb-input {
    width: 100%;
    padding: 12px;
    border: 2px solid #e0d6ca;
    border-radius: 10px;
    font-size: 14px;
    font-family: inherit;
    resize: none;
    outline: none;
    background: #fff;
    color: #333;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .msb-input:focus {
    border-color: #8b6914;
  }

  .msb-input::placeholder {
    color: #aaa;
  }

  .msb-error {
    margin-top: 8px;
    padding: 8px 12px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #b91c1c;
    font-size: 13px;
  }

  .msb-submit-btn {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 12px;
    background: #8b6914;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .msb-submit-btn:hover {
    background: #725610;
  }

  .msb-submit-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .msb-thinking {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 16px;
    color: #666;
    font-size: 14px;
  }

  .msb-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid #e0d6ca;
    border-top-color: #8b6914;
    border-radius: 50%;
    animation: msb-spin 0.8s linear infinite;
  }

  @keyframes msb-spin {
    to { transform: rotate(360deg); }
  }

  .msb-response-section {
    padding: 16px;
  }

  .msb-response {
    font-size: 14px;
    line-height: 1.6;
    color: #333;
    padding: 16px;
    background: #fff;
    border-radius: 10px;
    border: 1px solid #f0e8dd;
    white-space: pre-wrap;
  }

  .msb-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .msb-btn {
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .msb-btn-skip {
    flex: 2;
    background: #2e7d32;
    color: #fff;
  }

  .msb-btn-skip:hover {
    background: #1b5e20;
  }

  .msb-btn-save {
    flex: 1;
    background: #fff3e0;
    color: #e65100;
    border: 1px solid #ffe0b2;
  }

  .msb-btn-save:hover {
    background: #ffe0b2;
  }

  .msb-btn-add {
    flex: 1;
    background: #f5f5f5;
    color: #888;
    border: 1px solid #e0e0e0;
    font-size: 12px;
  }

  .msb-btn-add:hover {
    background: #eee;
    color: #666;
  }

  .msb-degraded-note {
    font-size: 13px;
    color: #6b6357;
    padding: 14px 16px;
    background: #fffaf0;
    border: 1px solid #f0e8dd;
    border-radius: 10px;
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .msb-degraded-reason {
    color: #a38b4a;
    font-size: 12px;
  }
`;
