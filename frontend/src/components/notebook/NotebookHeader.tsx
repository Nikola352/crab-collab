import { FiDownload, FiPlay, FiRotateCcw } from "react-icons/fi";
import { UserPresenceBar } from "../presence/UserPresenceBar";

interface NotebookHeaderProps {
  isConnected: boolean;
}

function ToolbarButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      disabled
      title={`${label} — coming soon`}
      aria-label={label}
      className="w-8 h-8 rounded-md text-zinc-500 flex items-center justify-center
        disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-zinc-700 enabled:hover:text-zinc-200 transition-colors"
    >
      {icon}
    </button>
  );
}

export function NotebookHeader({ isConnected }: NotebookHeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-zinc-800/95 backdrop-blur-sm border-b border-zinc-700 shadow-sm shadow-black/10">
      <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/crab-icon.png" alt="" className="h-6 w-6" />
            <span className="text-sm font-semibold text-zinc-100 tracking-tight">
              Crab Collab
            </span>
          </div>
          <span className="w-px h-5 bg-zinc-700 shrink-0" />
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<FiPlay size={14} />} label="Run all cells" />
            <ToolbarButton
              icon={<FiRotateCcw size={14} />}
              label="Restart kernel"
            />
            <ToolbarButton
              icon={<FiDownload size={14} />}
              label="Export notebook"
            />
          </div>
          <UserPresenceBar />
        </div>
      </div>
    </header>
  );
}
