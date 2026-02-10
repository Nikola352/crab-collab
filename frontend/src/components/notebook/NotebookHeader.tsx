import { UserPresenceBar } from "../presence/UserPresenceBar";

export function NotebookHeader() {
  return (
    <header className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Notebook</h1>
        <UserPresenceBar />
      </div>
    </header>
  );
}
