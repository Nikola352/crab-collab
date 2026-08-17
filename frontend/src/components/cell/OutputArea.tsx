import type { CellOutput } from "../../types/cell";

interface OutputAreaProps {
  outputs: CellOutput[];
}

export function OutputArea({ outputs }: OutputAreaProps) {
  if (outputs.length === 0) {
    return null;
  }

  return (
    <div className="bg-zinc-950/50 border-t border-zinc-700">
      {outputs.map((output, index) => (
        <div key={index} className="flex">
          <div className="w-20 shrink-0 py-3 px-3 text-right text-zinc-500 font-mono text-xs select-none whitespace-nowrap">
            {output.execution_number ? `Out [${output.execution_number}]` : ""}
          </div>
          <pre className="flex-1 py-3 px-3 text-zinc-300 font-mono text-sm overflow-x-auto whitespace-pre-wrap border-l border-zinc-700">
            {output.text}
          </pre>
        </div>
      ))}
    </div>
  );
}
