import { memo } from 'react';
import { Copy, Pin, Share2, Trash2 } from 'lucide-react';

export interface ClipboardItem {
  id: number;
  content: string;
  timestamp: number;
  is_pinned: boolean;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString();
}

interface ClipboardItemRowProps {
  item: ClipboardItem;
  isShared: boolean;
  isConfirmingDelete: boolean;
  onCopy: (text: string) => void;
  onShare: (item: ClipboardItem) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
}

function ClipboardItemRow({
  item,
  isShared,
  isConfirmingDelete,
  onCopy,
  onShare,
  onTogglePin,
  onDelete,
}: ClipboardItemRowProps) {
  return (
    <div className="flex items-start gap-4">
      {item.is_pinned && (
        <Pin size={16} className="text-frag-accent mt-1 fill-frag-accent" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-frag-text break-words line-clamp-3 overflow-hidden">
          {item.content}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-xs text-frag-muted">{formatTimestamp(item.timestamp)}</p>
          <p className="text-xs text-frag-muted">{item.content.length} characters</p>
        </div>
      </div>

      {/* Actions: always visible on small screens, hover-reveal on md+ */}
      <div className="flex gap-2 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onCopy(item.content)}
          aria-label="Copy to clipboard"
          className="p-2 bg-frag-primary/10 text-frag-primary rounded-lg hover:bg-frag-primary/20 transition-colors"
        >
          <Copy size={16} />
        </button>
        {isShared ? (
          <span
            className="p-2 bg-frag-success/10 text-frag-success rounded-lg"
            title="Shared to Community Library"
          >
            <Share2 size={16} />
          </span>
        ) : (
          <button
            onClick={() => onShare(item)}
            aria-label="Share to Community Library"
            className="p-2 bg-frag-primary/10 text-frag-primary rounded-lg hover:bg-frag-primary/20 transition-colors"
          >
            <Share2 size={16} />
          </button>
        )}
        <button
          onClick={() => onTogglePin(item.id)}
          aria-pressed={item.is_pinned}
          aria-label={item.is_pinned ? 'Unpin item' : 'Pin item'}
          className="p-2 bg-frag-accent/10 text-frag-accent rounded-lg hover:bg-frag-accent/20 transition-colors"
        >
          <Pin size={16} className={item.is_pinned ? 'fill-frag-accent' : ''} />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          aria-label={isConfirmingDelete ? 'Confirm delete item' : 'Delete item'}
          aria-live="polite"
          className={`p-2 rounded-lg transition-colors ${
            isConfirmingDelete
              ? 'bg-frag-danger text-frag-bg hover:bg-frag-danger/90'
              : 'bg-frag-danger/10 text-frag-danger hover:bg-frag-danger/20'
          }`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default memo(ClipboardItemRow);