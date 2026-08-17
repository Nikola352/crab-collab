import { useState } from "react";

interface JoinScreenProps {
  onJoin: (name: string) => void;
  isConnecting: boolean;
}

export function JoinScreen({ onJoin, isConnecting }: JoinScreenProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onJoin(trimmedName);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-brand-500/20 blur-2xl rounded-full" />
            <img
              src="/crab-icon.png"
              alt=""
              className="relative h-14 w-14"
            />
          </div>
          <h1 className="text-2xl font-semibold brand-gradient-text tracking-tight">
            Crab Collab
          </h1>
          <p className="text-zinc-500 text-sm mt-1.5">
            Real-time collaborative notebooks
          </p>
        </div>

        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6 shadow-xl shadow-black/20">
          <form onSubmit={handleSubmit}>
            <label
              htmlFor="join-name"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Your name
            </label>
            <input
              id="join-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ada Lovelace"
              className="w-full px-3.5 py-2.5 bg-zinc-950 text-zinc-100 rounded-lg border border-zinc-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 placeholder-zinc-500 mb-4 transition-colors"
              autoFocus
              disabled={isConnecting}
            />

            <button
              type="submit"
              disabled={!name.trim() || isConnecting}
              className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isConnecting ? "Connecting…" : "Join session"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
