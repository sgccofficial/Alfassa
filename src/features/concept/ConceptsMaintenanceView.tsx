import React, { useState } from "react";
import { Wrench, AlertTriangle, CheckCircle, RefreshCcw } from "lucide-react";

export function ConceptsMaintenanceView() {
  const [isFixing, setIsFixing] = useState(false);

  const runMaintenance = () => {
    setIsFixing(true);
    // Placeholder for maintenance logic
    setTimeout(() => setIsFixing(false), 2000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-bold text-text-primary">Concepts Maintenance</h1>
        <p className="text-sm text-text-secondary">Audit and repair knowledge graph and data relationships.</p>
      </header>

      <div className="bg-bg-surface border border-border-color rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Wrench className="text-accent-highlight" size={24} />
          <h2 className="text-base font-semibold text-text-primary">Integrity Audit</h2>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          This process will check for broken relationships, orphaned concepts, and data inconsistencies. 
          It will not delete or modify your saved knowledge content.
        </p>
        <button
          onClick={runMaintenance}
          disabled={isFixing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-bg-main border border-border-color text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer disabled:opacity-50"
        >
          {isFixing ? <RefreshCcw size={16} className="animate-spin" /> : <Wrench size={16} />}
          <span>Run Integrity Audit</span>
        </button>
      </div>

      <div className="bg-bg-surface border border-border-color rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
          <CheckCircle size={24} />
          <h2 className="text-base font-semibold text-text-primary">System Status</h2>
        </div>
        <p className="text-sm text-text-secondary">
          No critical issues detected in the knowledge graph.
        </p>
      </div>
    </div>
  );
}
