import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Pin, Trash2, Search, PlayCircle, StopCircle } from 'lucide-react';

interface ClipboardItem {
  id: number;
  content: string;
  timestamp: number;
  is_pinned: boolean;
}

export default function ClipboardHistory() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    loadClipboardHistory();
    
    // Listen for clipboard updates
    const unlisten = listen('clipboard-updated', () => {
      loadClipboardHistory();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const loadClipboardHistory = async () => {
    try {
      const result = await invoke<ClipboardItem[]>('get_clipboard_items', { limit: 100 });
      // Sort: pinned first, then by timestamp
      const sorted = result.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return b.timestamp - a.timestamp;
      });
      setItems(sorted);
    } catch (error) {
      console.error('Failed to load clipboard history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMonitoring = async () => {
    try {
      if (isMonitoring) {
        await invoke('stop_clipboard_monitor');
        setIsMonitoring(false);
      } else {
        await invoke('start_clipboard_monitor');
        setIsMonitoring(true);
      }
    } catch (error) {
      console.error('Failed to toggle monitoring:', error);
    }
  };

  const saveCurrentClipboard = async () => {
    try {
      const text = await invoke<string>('get_current_clipboard');
      await invoke('save_clipboard_text', { text });
      loadClipboardHistory();
    } catch (error) {
      console.error('Failed to save clipboard:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await invoke('copy_to_clipboard', { text });
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await invoke('delete_clipboard', { id });
      loadClipboardHistory();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const togglePin = async (id: number) => {
    try {
      await invoke('toggle_pin', { id });
      loadClipboardHistory();
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-frag-muted">Loading clipboard history...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-frag-text mb-2">Clipboard Manager</h1>
          <p className="text-frag-muted">
            {isMonitoring 
              ? '🟢 Auto-monitoring clipboard changes' 
              : 'Click Start to automatically save clipboard changes'
            }
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={toggleMonitoring}
            className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
              isMonitoring
                ? 'bg-frag-danger text-white hover:bg-frag-danger/90'
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
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-frag-surface border border-frag-border rounded-lg p-4">
          <p className="text-frag-muted text-sm">Total Items</p>
          <p className="text-2xl font-bold text-frag-primary">{items.length}</p>
        </div>
        <div className="bg-frag-surface border border-frag-border rounded-lg p-4">
          <p className="text-frag-muted text-sm">Pinned</p>
          <p className="text-2xl font-bold text-frag-accent">{items.filter(i => i.is_pinned).length}</p>
        </div>
        <div className="bg-frag-surface border border-frag-border rounded-lg p-4">
          <p className="text-frag-muted text-sm">Status</p>
          <p className="text-lg font-bold text-frag-success">{isMonitoring ? 'Active' : 'Idle'}</p>
        </div>
      </div>

      {/* Clipboard Items */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-frag-muted">
              {items.length === 0 
                ? 'No clipboard history yet. Start monitoring or save your current clipboard!'
                : 'No items match your search.'
              }
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: index * 0.03 }}
                className={`bg-frag-surface border rounded-lg p-4 hover:border-frag-primary/50 transition-all group ${
                  item.is_pinned ? 'border-frag-accent' : 'border-frag-border'
                }`}
              >
                <div className="flex items-start gap-4">
                  {item.is_pinned && (
                    <Pin size={16} className="text-frag-accent mt-1 fill-frag-accent" />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-frag-text break-words line-clamp-3">
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

                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => copyToClipboard(item.content)}
                      className="p-2 bg-frag-primary/10 text-frag-primary rounded-lg hover:bg-frag-primary/20 transition-colors"
                      title="Copy to clipboard"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      onClick={() => togglePin(item.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        item.is_pinned
                          ? 'bg-frag-accent/20 text-frag-accent'
                          : 'bg-frag-accent/10 text-frag-accent hover:bg-frag-accent/20'
                      }`}
                      title={item.is_pinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin size={16} className={item.is_pinned ? 'fill-frag-accent' : ''} />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-2 bg-frag-danger/10 text-frag-danger rounded-lg hover:bg-frag-danger/20 transition-colors"
                      title="Delete item"
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
    </div>
  );
}