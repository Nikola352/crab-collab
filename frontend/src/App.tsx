import "./App.css";

import { useState } from "react";
import { Toaster } from "sonner";
import { JoinScreen } from "./components/JoinScreen";
import { NotebookView } from "./components/notebook/NotebookView";

function App() {
  const [userName, setUserName] = useState<string | null>(null);

  const handleJoin = (name: string) => {
    setUserName(name);
  };

  return (
    <>
      <Toaster position="bottom-right" theme="dark" />
      {userName ? (
        <NotebookView userName={userName} />
      ) : (
        <JoinScreen onJoin={handleJoin} isConnecting={false} />
      )}
    </>
  );
}

export default App;
