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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">
          Collaborative Notebook
        </h1>
        <p className="text-gray-400 text-center mb-6">
          Enter your name to join the session
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-gray-400 mb-4"
            autoFocus
            disabled={isConnecting}
          />

          <button
            type="submit"
            disabled={!name.trim() || isConnecting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {isConnecting ? "Connecting..." : "Join Session"}
          </button>
        </form>
      </div>
    </div>
  );
}
