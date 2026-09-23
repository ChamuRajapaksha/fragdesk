import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings } from 'lucide-react';
import { applyPalette, PALETTES, type Palette } from '../../../themes';
import { PageHeader, useToast } from '../../../components/ui';
import type { NavId } from '../../../features/registry';
import AccountSection from './AccountSection';

interface SettingsPageProps {
  setActiveTab?: (tab: NavId) => void;
}

export default function SettingsPage({ setActiveTab }: SettingsPageProps) {
  const { toast } = useToast();
  const [recordHotkey, setRecordHotkey] = useState<string>('F9');
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paletteId, setPaletteId] = useState<string>('neon');
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    invoke<string>('get_record_hotkey')
      .then(setRecordHotkey)
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke<string>('get_ui_theme')
      .then(setPaletteId)
      .catch(() => {});
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    },
    []
  );

  function selectPalette(palette: Palette) {
    applyPalette(palette);
    setPaletteId(palette.id);
    setJustSaved(true);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setJustSaved(false), 2000);
    invoke('set_ui_theme', { theme: palette.id })
      .then(() => toast(`"${palette.name}" palette applied`, 'success'))
      .catch((err) => toast(String(err), 'error'));
  }

  function handleAccountDeleted() {
    setPaletteId('neon');
    setRecordHotkey('F9');
  }

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

      setError(null);
      invoke('set_record_hotkey', { hotkey: combo })
        .then(() => {
          setRecordHotkey(combo);
          toast(`Recording hotkey set to ${combo}`, 'success');
        })
        .catch((err) => {
          setError(String(err));
          toast(String(err), 'error');
        })
        .finally(() => setIsCapturing(false));
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isCapturing]);

  return (
    <div className="min-h-full bg-frag-bg text-frag-text p-4 md:p-6">
      <div className="max-w-2xl w-full mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Settings"
          subtitle="Configure how FragDesk behaves."
          accent={<Settings size={22} />}
        />

        {error && (
          <div
            role="alert"
            className="bg-frag-danger/10 border border-frag-danger/40 text-frag-danger text-sm rounded-lg px-4 py-2"
          >
            {error}
          </div>
        )}

        {/* Recording */}
        <section className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 space-y-3">
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
                aria-label={`Change recording hotkey. Current: ${recordHotkey}`}
                className="font-mono text-sm px-3 py-1.5 rounded-lg bg-frag-bg border border-frag-border text-frag-primary hover:border-frag-primary focus-visible:ring-2 focus-visible:ring-frag-primary/60 focus-visible:outline-none transition-colors"
              >
                {recordHotkey}
              </button>
            )}
          </div>
        </section>

        {/* Appearance / Colour Palette */}
        <section className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-frag-text">Appearance / Colour Palette</h2>
            {justSaved && (
              <span className="text-xs text-frag-success" aria-live="polite">
                Saved
              </span>
            )}
          </div>
          <p className="text-sm text-frag-muted">
            Pick how FragDesk is coloured. The palette applies across the whole app and is saved
            automatically.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PALETTES.map((palette) => {
              const selected = palette.id === paletteId;
              return (
                <button
                  key={palette.id}
                  onClick={() => selectPalette(palette)}
                  aria-pressed={selected}
                  aria-label={`${palette.name} palette${selected ? ', currently selected' : ''}`}
                  className={`text-left rounded-lg p-3 border focus-visible:ring-2 focus-visible:ring-frag-primary/60 focus-visible:outline-none transition-colors ${
                    selected
                      ? 'border-frag-primary ring-1 ring-frag-primary'
                      : 'border-frag-border hover:border-frag-primary/60'
                  }`}
                >
                  <div className="flex gap-1.5 mb-2">
                    <span
                      role="img"
                      aria-label={`${palette.name} background colour`}
                      className="h-5 w-5 rounded-full border border-frag-border"
                      style={{ backgroundColor: `rgb(${palette.colors.bg})` }}
                    />
                    <span
                      role="img"
                      aria-label={`${palette.name} primary colour`}
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: `rgb(${palette.colors.primary})` }}
                    />
                    <span
                      role="img"
                      aria-label={`${palette.name} accent colour`}
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: `rgb(${palette.colors.accent})` }}
                    />
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      selected ? 'text-frag-primary' : 'text-frag-text'
                    }`}
                  >
                    {palette.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Account */}
        <AccountSection setActiveTab={setActiveTab} onAccountDeleted={handleAccountDeleted} />

        {/* About */}
        <section className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 space-y-2">
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
    </div>
  );
}