import React from "react";
import { Settings, Wrench } from "iconoir-react";
import { Link } from "react-router-dom";

export function SettingsView() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
      </header>

      <div className="bg-bg-surface border border-border-color rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Settings className="text-text-secondary" size={24} />
          <h2 className="text-base font-semibold text-text-primary">General</h2>
        </div>
        <p className="text-sm text-text-secondary">System configuration settings.</p>
      </div>

      <div className="bg-bg-surface border border-border-color rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Wrench className="text-accent-highlight" size={24} />
          <h2 className="text-base font-semibold text-text-primary">Concepts</h2>
        </div>
        <Link
          to="/settings/concepts-maintenance"
          className="text-sm text-accent-highlight hover:underline font-medium"
        >
          Concepts Maintenance
        </Link>
      </div>
    </div>
  );
}
