import { useEffect, useRef } from "react";

import { useWebSocket } from "../../hooks/useWebsocket";
import { useNotebookSync } from "../../hooks/useNotebookSync";
import { CellList } from "./CellList";
import { NotebookHeader } from "./NotebookHeader";

const { VITE_WS_BASE_URL } = import.meta.env;

interface NotebookViewProps {
  userName: string;
}

export function NotebookView({ userName }: NotebookViewProps) {
  const { isConnected, send, on } = useWebSocket(`${VITE_WS_BASE_URL}/ws`);
  const hasJoined = useRef(false);

  const {
    handleInsertCell,
    handleDeleteCell,
    handleMoveCell,
    handleContentChange,
    handleContentDrivenFocusChange,
    handleExecuteCell,
    sendFocusChange,
  } = useNotebookSync(send, on, userName);

  useEffect(() => {
    if (isConnected && !hasJoined.current) {
      hasJoined.current = true;
      send({ type: "join", name: userName });
    }
  }, [isConnected, send, userName]);

  return (
    <div className="min-h-screen bg-gray-900">
      <NotebookHeader />
      <main className="max-w-4xl mx-auto px-6 py-6">
        <CellList
          onInsertCell={handleInsertCell}
          onDeleteCell={handleDeleteCell}
          onMoveCell={handleMoveCell}
          onContentChange={handleContentChange}
          onFocusChange={sendFocusChange}
          onContentDrivenFocusChange={handleContentDrivenFocusChange}
          onExecuteCell={handleExecuteCell}
        />
      </main>
    </div>
  );
}
