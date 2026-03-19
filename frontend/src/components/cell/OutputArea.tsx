import type { CellOutput } from "../../types/cell";

interface OutputAreaProps {
  outputs: CellOutput[];
}

export function OutputArea({ outputs }: OutputAreaProps) {
  if (outputs.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-900 border-t border-gray-800">
      {outputs.map((output, index) => (
        <div key={index} className="flex">
          <div className="w-24 shrink-0 py-3 px-3 text-right text-gray-500 font-mono text-sm select-none whitespace-nowrap">
            {output.out_number ? `Out [${output.out_number}]:` : ""}
          </div>
          <pre className="flex-1 py-3 px-3 text-gray-300 font-mono text-sm overflow-x-auto whitespace-pre-wrap border-l border-gray-800">
            {output.text}
          </pre>
        </div>
      ))}
    </div>
  );
}
