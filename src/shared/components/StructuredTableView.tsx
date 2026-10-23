import React from "react";
import { ExtractedTable } from "../../types";
import { Table as TableIcon } from "lucide-react";

interface StructuredTableViewProps {
  tables: ExtractedTable[];
}

export function StructuredTableView({ tables }: StructuredTableViewProps) {
  if (!tables || tables.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {tables.map((table, tIdx) => {
        const headers = table.headers || [];
        const rows = table.rows || [];

        return (
          <div
            key={tIdx}
            className="border border-border-color rounded-lg bg-bg-surface overflow-hidden shadow-2xs"
          >
            {table.title && (
              <div className="px-3.5 py-2 border-b border-border-color bg-bg-subtle flex items-center gap-2">
                <TableIcon size={14} className="text-text-muted shrink-0" />
                <h4 className="text-xs font-semibold text-text-primary truncate">
                  {table.title}
                </h4>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                {headers.length > 0 && (
                  <thead>
                    <tr className="bg-bg-subtle border-b border-border-color">
                      {headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="px-3 py-2.5 font-semibold text-text-primary whitespace-nowrap border-r border-border-color last:border-r-0"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-border-color">
                  {rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-bg-subtle/50 transition-colors"
                    >
                      {row.cells.map((cell, cIdx) => {
                        const lines =
                          cell.lines && cell.lines.length > 0
                            ? cell.lines
                            : (cell.text || "")
                                .replace(/<br\s*\/?>/gi, "\n")
                                .split("\n")
                                .filter((l) => l.trim().length > 0);

                        return (
                          <td
                            key={cIdx}
                            className="px-3 py-2 align-top text-text-primary border-r border-border-color last:border-r-0"
                          >
                            {lines.length > 0 ? (
                              <div className="space-y-1">
                                {lines.map((line, lIdx) => (
                                  <div
                                    key={lIdx}
                                    className="leading-snug"
                                  >
                                    {line}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
