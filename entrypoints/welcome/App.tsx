import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  hasPermissions,
  requestPermissions,
  watchPermissions,
} from '@/utils/permissions';
import { welcomeConfig, type PermissionStep, type WelcomeConfig } from './config';

type StepStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'error';

function App() {
  const { name, version } = chrome.runtime.getManifest();
  const { valueProp, activationSurfaces, steps, links } = welcomeConfig;

  const [statuses, setStatuses] = useState<Record<string, StepStatus>>(() =>
    Object.fromEntries(steps.map((s) => [s.id, 'idle' as StepStatus])),
  );

  const refreshGranted = useCallback(async () => {
    const results = await Promise.all(
      steps.map((s) => hasPermissions(s.permissions)),
    );
    setStatuses((prev) => {
      let changed = false;
      const next = { ...prev };
      steps.forEach((s, i) => {
        if (next[s.id] === 'pending') return;
        const status: StepStatus = results[i] ? 'granted' : 'idle';
        if (next[s.id] !== status) {
          next[s.id] = status;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [steps]);

  useEffect(() => {
    refreshGranted();
    return watchPermissions(refreshGranted);
  }, [refreshGranted]);

  const allGranted = useMemo(
    () => steps.length > 0 && steps.every((s) => statuses[s.id] === 'granted'),
    [statuses, steps],
  );

  return (
    <div className="welcome">
      <header className="welcome-header">
        <BuddyIcon />
        <h1>Welcome to {name}</h1>
        <p className="welcome-value">{valueProp}</p>
      </header>

      {activationSurfaces.length > 0 && (
        <section className="welcome-surfaces">
          <h2>Where this activates</h2>
          <ul>
            {activationSurfaces.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {steps.length > 0 && (
        <ol className="welcome-steps" aria-label="Setup steps">
          {steps.map((step) => (
            <Step
              key={step.id}
              step={step}
              status={statuses[step.id]}
              onClick={() => {
                // Synchronous user-gesture chain: no awaits before request.
                setStatuses((prev) => ({ ...prev, [step.id]: 'pending' }));
                requestPermissions(step.permissions).then(
                  (granted) =>
                    setStatuses((prev) => ({
                      ...prev,
                      [step.id]: granted ? 'granted' : 'denied',
                    })),
                  () =>
                    setStatuses((prev) => ({
                      ...prev,
                      [step.id]: 'error',
                    })),
                );
              }}
            />
          ))}
        </ol>
      )}

      {allGranted && <AllSetState />}

      <TrustFooter links={links} version={version} />
    </div>
  );
}

function Step({
  step,
  status,
  onClick,
}: {
  step: PermissionStep;
  status: StepStatus;
  onClick: () => void;
}) {
  const granted = status === 'granted';
  const pending = status === 'pending';

  return (
    <li className={`welcome-step welcome-step-${status}`}>
      <StatusIcon status={status} />
      <div className="welcome-step-body">
        <div className="welcome-step-label">{step.label}</div>
        <p className="welcome-step-justification">{step.justification}</p>

        {!granted && (
          <div className="welcome-step-actions">
            <button
              onClick={onClick}
              disabled={pending}
              className="welcome-step-btn"
            >
              {pending ? 'Waiting…' : (step.cta ?? 'Allow')}
            </button>
            {step.privacyNote && (
              <span className="welcome-step-privacy">{step.privacyNote}</span>
            )}
          </div>
        )}

        {status === 'denied' && (
          <p className="welcome-step-hint welcome-step-hint-warn">
            Not granted. Click the button to try again — features needing this
            access will stay disabled.
          </p>
        )}
        {status === 'error' && (
          <p className="welcome-step-hint welcome-step-hint-error">
            Something went wrong. Reload this tab and try again.
          </p>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'granted') {
    return (
      <svg viewBox="0 0 16 16" className="welcome-icon welcome-icon-granted" aria-label="Granted">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l4.5-4.5z"
        />
      </svg>
    );
  }
  if (status === 'pending') {
    return (
      <svg viewBox="0 0 16 16" className="welcome-icon welcome-icon-pending" aria-label="Waiting">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.25" />
        <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="welcome-icon welcome-icon-idle" aria-label="Not yet granted">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function AllSetState() {
  return (
    <section className="welcome-all-set" aria-live="polite">
      <p>You're all set.</p>
      <p className="welcome-pin-hint">
        <PuzzleIcon />
        <span>
          Tip: click the puzzle-piece icon in your toolbar and pin this
          extension so you can reach it in one click. Then reload any open
          Amazon tab and the buddy will start watching.
        </span>
      </p>
    </section>
  );
}

function PuzzleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="welcome-puzzle" aria-hidden>
      <path
        fill="currentColor"
        d="M20.5 11h-1.7V8.6a1.6 1.6 0 0 0-1.6-1.6h-2.4V5.3a2.3 2.3 0 1 0-4.6 0V7H7.6A1.6 1.6 0 0 0 6 8.6V11H4.5a2.5 2.5 0 1 0 0 5H6v2.4A1.6 1.6 0 0 0 7.6 20H10v-1.7a2.3 2.3 0 0 1 4.6 0V20h2.6a1.6 1.6 0 0 0 1.6-1.6V16h1.7a2.5 2.5 0 1 0 0-5z"
      />
    </svg>
  );
}

function TrustFooter({
  links,
  version,
}: {
  links: WelcomeConfig['links'];
  version: string;
}) {
  return (
    <footer className="welcome-footer">
      <span>v{version}</span>
      <a href={links.repo}>Source</a>
      <a href={links.issues}>Report an issue</a>
      <a href={links.privacy}>Privacy</a>
      <span className="welcome-footer-spacer">
        Revoke access anytime in <code>chrome://extensions</code>.
      </span>
    </footer>
  );
}

function BuddyIcon() {
  return (
    <svg
      className="welcome-buddy"
      width="96"
      height="96"
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="64" cy="88" rx="28" ry="30" fill="#4CAF50" />
      <circle cx="30" cy="28" r="12" fill="#fff" stroke="#333" strokeWidth="1.5" />
      <circle cx="32" cy="27" r="5" fill="#333" />
      <circle cx="98" cy="28" r="12" fill="#fff" stroke="#333" strokeWidth="1.5" />
      <circle cx="96" cy="27" r="5" fill="#333" />
      <path d="M50 94 Q64 106 78 94" stroke="#2E7D32" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default App;
