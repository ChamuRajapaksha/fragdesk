import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clipboard,
  Copy,
  Pin,
  Trash2,
  Search,
  PlayCircle,
  StopCircle,
  Share2,
  X,
} from 'lucide-react';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  StatCard,
  useToast,
} from '../../ui';
import { extractErrorMessage, isSupabaseConfigured, supabase } from '../../../community/supabaseClient';
import { useAuth } from '../../../community/useAuth';
import type { NavId } from '../../../features/registry';

interface ClipboardItem {
  id: number;
  content: string;
  timestamp: number;
  is_pinned: boolean;
}

interface ClipboardHistoryProps {
  setActiveTab: (tab: NavId) => void;
}

export default function ClipboardHistory({ setActiveTab }: ClipboardHistoryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sharing: which item is currently showing the "name it" prompt, plus
  // the draft name, plus which item id is mid-submit / already shared.
  const [sharingItemId, setSharingItemId] = useState<number | null>(null);
  const [shareNameDraft, setShareNameDraft] = useState('');
  const [submittingShareId, setSubmittingShareId] = useState<number | null>(null);
  const [sharedIds, setSharedIds] = useState<Set<number>>(new Set());

  // Delete requires two confirm clicks; the second click on the same item acts.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    loadClipboardHistory();

    const unlisten = listen('clipboard-updated', () => {
      loadClipboardHistory();
    });

    return () => {
      unlisten.then(fn => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the delete confirmation after a short window so a missed click
  // doesn't leave a button in "confirm" state forever.
  useEffect(() => {
    if (confirmDeleteId === null) return;
    const t = window.setTimeout(() => setConfirmDeleteId(null), 2500);
    return () => window.clearTimeout(t);
  }, [confirmDeleteId]);

  const loadClipboardHistory = async () => {
    try {
      const result = await invoke<ClipboardItem[]>('get_clipboard_items', { limit: 100 });
      const sorted = result.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return b.timestamp - a.timestamp;
      });
      setItems(sorted);
    } catch (error) {
      setError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMonitoring = async () => {
    try {
      if (isMonitoring) {
        await invoke('stop_clipboard_monitor');
        setIsMonitoring(false);
        toast('Clipboard monitoring stopped.', 'info');
      } else {
        await invoke('start_clipboard_monitor');
        setIsMonitoring(true);
        toast('Clipboard monitoring started.', 'success');
      }
    } catch (error) {
      setError(extractErrorMessage(error));
    }
  };

  const saveCurrentClipboard = async () => {
    try {
      const text = await invoke<string>('get_current_clipboard');
      await invoke('save_clipboard_text', { text });
      loadClipboardHistory();
      toast('Current clipboard saved to history.', 'success');
    } catch (error) {
      setError(extractErrorMessage(error));
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await invoke('copy_to_clipboard', { text });
      toast('Copied to clipboard.', 'success');
    } catch (error) {
      setError(extractErrorMessage(error));
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await invoke('delete_clipboard', { id });
      loadClipboardHistory();
      toast('Item deleted.', 'success');
    } catch (error) {
      setError(extractErrorMessage(error));
    }
  };

  const togglePin = async (id: number) => {
    try {
      await invoke('toggle_pin', { id });
      loadClipboardHistory();
    } catch (error) {
      setError(extractErrorMessage(error));
    }
  };

  function handleShareClick(item: ClipboardItem) {
    if (!isSupabaseConfigured) {
      setError("Community sharing isn't set up yet — add Supabase credentials to .env first.");
      return;
    }
    if (!user) {
      setActiveTab('community');
      return;
    }
    setSharingItemId(item.id);
    setShareNameDraft('');
  }

  function handleCancelShare() {
    setSharingItemId(null);
    setShareNameDraft('');
  }

  async function handleSubmitShare(item: ClipboardItem) {
    if (!supabase || !user) return;
    const name = shareNameDraft.trim();
    if (!name) return;

    setSubmittingShareId(item.id);
    setError(null);
    try {
      const json = await invoke<string>('export_clipboard_snippet_json', {
        content: item.content,
        name,
        tags: [],
      });
      const fragment = JSON.parse(json) as {
        fragment_type: string;
        name: string;
        tags: string[];
        format_version: number;
        payload: unknown;
      };

      const { error: insertError } = await supabase.from('fragments').insert({
        fragment_type: fragment.fragment_type,
        name: fragment.name,
        tags: fragment.tags,
        format_version: fragment.format_version,
        payload: fragment.payload,
        submitted_by: user.id,
      });

      if (insertError) throw insertError;
      setSharedIds((prev) => new Set(prev).add(item.id));
      handleCancelShare();
      toast('Snippet shared to the community library.', 'success');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingShareId(null);
    }
  }

  const filteredItems = items.filter(item =>
    item.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const sharingItem = sharingItemId !== null ? items.find((i) => i.id === sharingItemId) : null;

  return (
    <div className="min-h-full bg-frag-bg text-frag-text p-4 md:p-6">
      <PageHeader
        title="Clipboard Manager"
        subtitle={
          isMonitoring
            ? 'Auto-monitoring clipboard changes'
            : 'Click Start to automatically save clipboard changes'
        }
        accent={<Clipboard size={22} />}
        actions={
          <>
            <button
              onClick={toggleMonitoring}
              aria-pressed={isMonitoring}
              className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                isMonitoring
                  ? 'bg-frag-danger text-frag-bg hover:bg-frag-danger/90'
                  : 'bg-frag-success text-frag-bg hover:bg-frag-success/90'
              }`}
            >
              {isMonitoring ? (
                <>
                  <StopCircle size={18} />
                  Stop Monitoring
                </>
              ) : (
                <>
                  <PlayCircle size={18} />
                  Start Monitoring
                </>
              )}
            </button>
            <button
              onClick={saveCurrentClipboard}
              className="px-4 py-2 bg-frag-primary text-frag-bg rounded-lg font-semibold hover:bg-frag-primary/90 transition-all"
            >
              Save Current
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {isLoading ? (
        <LoadingState rows={4} label="Loading clipboard history" />
      ) : (
        <>
          {/* Search Bar */}
          <div className="mb-4 md:mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-frag-muted" size={20} />
              <input
                type="text"
                placeholder="Search clipboard history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-frag-surface border border-frag-border rounded-lg pl-10 pr-4 py-3 text-frag-text placeholder-frag-muted focus:outline-none focus:border-frag-primary transition-colors"
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
            <StatCard
              icon={Clipboard}
              label="Total Items"
              value={items.length}
              accent="text-frag-primary"
            />
            <StatCard
              icon={Pin}
              label="Pinned"
              value={items.filter((i) => i.is_pinned).length}
              accent="text-frag-accent"
            />
            <StatCard
              icon={PlayCircle}
              label="Monitoring"
              value={isMonitoring ? 'Active' : 'Idle'}
              accent="text-frag-success"
            />
          </div>

          {/* Clipboard Items */}
          <div className="space-y-3">
            <AnimatePresence>
              {filteredItems.length === 0 ? (
                <EmptyState
                  icon={Clipboard}
                  title={items.length === 0 ? 'No clipboard history yet' : 'No items match your search'}
                  description={
                    items.length === 0
                      ? 'Start monitoring or save your current clipboard to begin.'
                      : 'Try a different search query.'
                  }
                />
              ) : (
                filteredItems.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ delay: index * 0.03 }}
                    className={`bg-frag-surface border rounded-lg p-3 md:p-4 hover:border-frag-primary/50 transition-all group ${
                      item.is_pinned ? 'border-frag-accent' : 'border-frag-border'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {item.is_pinned && (
                        <Pin size={16} className="text-frag-accent mt-1 fill-frag-accent" />
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-frag-text break-words line-clamp-3 overflow-hidden">
                          {item.content}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-xs text-frag-muted">
                            {formatTimestamp(item.timestamp)}
                          </p>
                          <p className="text-xs text-frag-muted">
                            {item.content.length} characters
                          </p>
                        </div>
                      </div>

                      {/* Actions: always visible on small screens, hover-reveal on md+ */}
                      <div className="flex gap-2 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(item.content)}
                          aria-label="Copy to clipboard"
                          className="p-2 bg-frag-primary/10 text-frag-primary rounded-lg hover:bg-frag-primary/20 transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                        {sharedIds.has(item.id) ? (
                          <span
                            className="p-2 bg-frag-success/10 text-frag-success rounded-lg"
                            title="Shared to Community Library"
                          >
                            <Share2 size={16} />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleShareClick(item)}
                            aria-label="Share to Community Library"
                            className="p-2 bg-frag-primary/10 text-frag-primary rounded-lg hover:bg-frag-primary/20 transition-colors"
                          >
                            <Share2 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => togglePin(item.id)}
                          aria-pressed={item.is_pinned}
                          aria-label={item.is_pinned ? 'Unpin item' : 'Pin item'}
                          className="p-2 bg-frag-accent/10 text-frag-accent rounded-lg hover:bg-frag-accent/20 transition-colors"
                        >
                          <Pin size={16} className={item.is_pinned ? 'fill-frag-accent' : ''} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirmDeleteId === item.id) {
                              setConfirmDeleteId(null);
                              deleteItem(item.id);
                            } else {
                              setConfirmDeleteId(item.id);
                            }
                          }}
                          aria-label={
                            confirmDeleteId === item.id
                              ? 'Confirm delete item'
                              : 'Delete item'
                          }
                          className={`p-2 rounded-lg transition-colors ${
                            confirmDeleteId === item.id
                              ? 'bg-frag-danger text-frag-bg hover:bg-frag-danger/90'
                              : 'bg-frag-danger/10 text-frag-danger hover:bg-frag-danger/20'
                          }`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Share naming modal */}
      <AnimatePresence>
        {sharingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            onClick={handleCancelShare}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-frag-surface border border-frag-border rounded-lg p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="share-dialog-title" className="text-lg font-semibold text-frag-text">
                  Share snippet
                </h2>
                <button
                  onClick={handleCancelShare}
                  aria-label="Close share dialog"
                  className="p-1.5 rounded-lg text-frag-muted hover:text-frag-text hover:bg-frag-bg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-frag-muted mt-1">
                Name this snippet so it stands out in the community library.
              </p>
              <input
                autoFocus
                type="text"
                value={shareNameDraft}
                onChange={(e) => setShareNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitShare(sharingItem);
                  if (e.key === 'Escape') handleCancelShare();
                }}
                placeholder="Name this snippet..."
                className="mt-4 w-full bg-frag-bg border border-frag-border rounded-lg px-3 py-2 text-frag-text placeholder-frag-muted focus:outline-none focus:border-frag-primary transition-colors"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={handleCancelShare}
                  className="px-4 py-2 rounded-lg bg-frag-bg text-frag-muted text-sm font-semibold hover:text-frag-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSubmitShare(sharingItem)}
                  disabled={!shareNameDraft.trim() || submittingShareId === sharingItem.id}
                  className="px-4 py-2 rounded-lg bg-frag-primary text-frag-bg text-sm font-semibold disabled:opacity-40 transition-opacity"
                >
                  {submittingShareId === sharingItem.id ? 'Sharing...' : 'Share'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}