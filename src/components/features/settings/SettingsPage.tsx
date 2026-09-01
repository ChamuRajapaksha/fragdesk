import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function SettingsPage() {
  const [recordHotkey, setRecordHotkey] = useState<string>('F9');
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<string>('get_record_hotkey')
      .then(setRecordHotkey)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isCapturing) return;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsCapturing(false);
        return;
      }
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;

      const mods: string[] = [];
      if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      const combo = [...mods, e.code].join('+');

      setSaved(false);
      invoke('set_record_hotkey', { hotkey: combo })
        .then(() => {
          setRecordHotkey(combo);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        })
        .catch((err) => setError(String(err)))
        .finally(() => setIsCapturing(false));
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isCapturing]);

  return (
    <div className="max-w-2xl w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-frag-text">Settings</h1>
        <p className="text-frag-muted mt-2">Configure how FragDesk behaves.</p>
      </div>

      {error && (
        <div className="bg-frag-danger/10 border border-frag-danger/40 text-frag-danger text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Recording */}
      <section className="bg-frag-surface border border-frag-border rounded-lg p-6 space-y-3">
        <h2 className="text-lg font-semibold text-frag-text">Macro Recording</h2>
        <p className="text-sm text-frag-muted break-words">
          This hotkey starts and stops macro recording from anywhere, even while
          FragDesk isn't focused — without it, you'd have to click a button
          on-screen, which gets captured as part of the recording itself.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-frag-muted">Record toggle:</span>
          {isCapturing ? (
            <span className="font-mono text-sm text-frag-accent animate-pulse break-words">
              Press a key combo... (Esc to cancel)
            </span>
          ) : (
            <button
              onClick={() => setIsCapturing(true)}
              className="font-mono text-sm px-3 py-1.5 rounded-lg bg-frag-bg border border-frag-border text-frag-primary hover:border-frag-primary transition-colors"
            >
              {recordHotkey}
            </button>
          )}
          {saved && <span className="text-xs text-frag-success">Saved ✓</span>}
        </div>
      </section>

      {/* About */}
      <section className="bg-frag-surface border border-frag-border rounded-lg p-6 space-y-2">
        <h2 className="text-lg font-semibold text-frag-text">About</h2>
        <div className="text-sm text-frag-muted space-y-1">
          <p className="break-words">
            <span className="text-frag-text font-medium">FragDesk</span> — a gaming
            companion, productivity utility, and community fragment aggregator.
          </p>
          <p className="break-words">Version 0.1.0 · Alpha Build</p>
        </div>
      </section>
    </div>
  );
}