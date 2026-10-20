"use client";

import { useState } from "react";
import {
  Bell,
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  createReminderRuleAction,
  updateReminderRuleAction,
  deleteReminderRuleAction,
  triggerManualRemindersAction,
} from "@/lib/actions/reminderRules";

interface ReminderRule {
  id: string;
  name: string;
  daysBefore: number;
  channels: any;
  appliesTo: string;
  isEnabled: boolean;
}

interface Props {
  initialRules: ReminderRule[];
  orgName: string;
  userRole: "admin" | "member";
}

export function ReminderSettingsShell({ initialRules, orgName, userRole }: Props) {
  const [rules, setRules] = useState<ReminderRule[]>(initialRules);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  // New rule form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDays, setNewDays] = useState(3);
  const [newAppliesTo, setNewAppliesTo] = useState<"reports" | "requirements" | "all">("all");
  const [formError, setFormError] = useState("");

  const isAdmin = userRole === "admin";

  const handleToggleRule = async (rule: ReminderRule) => {
    if (!isAdmin) return;
    const updatedStatus = !rule.isEnabled;

    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: updatedStatus } : r))
    );

    const res = await updateReminderRuleAction(rule.id, { isEnabled: updatedStatus });
    if (!res.success) {
      // Revert on error
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: !updatedStatus } : r))
      );
      alert(res.error || "Failed to update reminder rule");
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!isAdmin) return;
    if (!confirm("Are you sure you want to delete this reminder rule?")) return;

    const previous = [...rules];
    setRules((prev) => prev.filter((r) => r.id !== ruleId));

    const res = await deleteReminderRuleAction(ruleId);
    if (!res.success) {
      setRules(previous);
      alert(res.error || "Failed to delete reminder rule");
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setFormError("");

    if (!newName.trim()) {
      setFormError("Rule name is required.");
      return;
    }
    if (newDays < 0 || newDays > 365) {
      setFormError("Days before deadline must be between 0 and 365.");
      return;
    }

    setIsLoading(true);
    const res = await createReminderRuleAction({
      name: newName.trim(),
      daysBefore: Number(newDays),
      channels: ["email"],
      appliesTo: newAppliesTo,
      isEnabled: true,
    });
    setIsLoading(false);

    if (res.success && res.data) {
      setRules((prev) => [res.data, ...prev].sort((a, b) => b.daysBefore - a.daysBefore));
      setShowAddForm(false);
      setNewName("");
      setNewDays(3);
    } else {
      setFormError(res.error || "Failed to create rule");
    }
  };

  const handleTriggerTest = async () => {
    if (!isAdmin) return;
    setIsTesting(true);
    setTestResult(null);

    const res = await triggerManualRemindersAction();
    setIsTesting(false);

    if (res.success && res.data) {
      setTestResult(res.data);
    } else {
      alert(res.error || "Failed to trigger reminder check");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-border glass-panel">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600">
              <Bell className="h-4 w-4" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Automated Deadline Reminders
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure automated email notifications for upcoming grant reports and evidence deadlines for{" "}
            <strong>{orgName}</strong>.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleTriggerTest}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors disabled:opacity-50"
            >
              {isTesting ? (
                <RotateCcw className="h-3.5 w-3.5 animate-spin text-emerald-600" />
              ) : (
                <Play className="h-3.5 w-3.5 text-emerald-600" />
              )}
              Run Check Now
            </button>

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Reminder Rule
            </button>
          </div>
        )}
      </div>

      {/* Test Execution Banner */}
      {testResult && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-foreground space-y-2">
          <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Manual Reminder Evaluation Completed
          </div>
          <p className="text-muted-foreground">
            Sent: <strong>{testResult.remindersSent}</strong> reminder(s) &bull; Weekly digests:{" "}
            <strong>{testResult.digestsSent}</strong> &bull; Skipped (deduplicated):{" "}
            <strong>{testResult.skippedDeduplicated}</strong>.
          </p>
          {testResult.details.length > 0 && (
            <div className="mt-2 space-y-1 pl-4 border-l-2 border-emerald-500/30">
              {testResult.details.map((d: any, idx: number) => (
                <div key={idx} className="text-muted-foreground">
                  &bull; {d.type.toUpperCase()}: <em>{d.targetTitle}</em> &rarr; {d.recipientEmail} (due in {d.daysBefore}d)
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Rule Form Modal / Inline Form */}
      {showAddForm && isAdmin && (
        <form onSubmit={handleCreateRule} className="p-6 rounded-2xl border border-emerald-500/30 bg-card shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-bold text-foreground">Create New Reminder Rule</h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Rule Name</label>
              <input
                type="text"
                placeholder="e.g. 3 Days Before Final Deadline"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Days Before Deadline
              </label>
              <input
                type="number"
                min="0"
                max="365"
                value={newDays}
                onChange={(e) => setNewDays(Number(e.target.value))}
                required
                className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-muted-foreground">0 = Day of deadline</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Applies To</label>
              <select
                value={newAppliesTo}
                onChange={(e) => setNewAppliesTo(e.target.value as any)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All (Reports &amp; Requirements)</option>
                <option value="reports">Reports Only</option>
                <option value="requirements">Requirements Only</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
            >
              {isLoading ? "Saving..." : "Save Rule"}
            </button>
          </div>
        </form>
      )}

      {/* Rules list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Configured Timing Triggers
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            {rules.length} rule{rules.length === 1 ? "" : "s"} active
          </span>
        </div>

        {rules.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No reminder rules configured. Click &ldquo;Add Reminder Rule&rdquo; above to set one up.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="p-5 flex items-center justify-between hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                      rule.isEnabled
                        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {rule.daysBefore}d
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{rule.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground font-medium">
                        {rule.appliesTo === "all"
                          ? "Reports & Requirements"
                          : rule.appliesTo === "reports"
                          ? "Reports only"
                          : "Requirements only"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        Fires at <strong>9:00 AM local time</strong>, exactly {rule.daysBefore} day{rule.daysBefore === 1 ? "" : "s"} prior to due date.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                          rule.isEnabled
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                            : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {rule.isEnabled ? "Enabled" : "Paused"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
                        title="Delete Rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How it works info card */}
      <div className="p-6 rounded-2xl border border-border bg-muted/20 space-y-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          How GrantGrip Multi-Tenant Reminders Work
        </div>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>D-002 Local Time Enforcement:</strong> Our background scheduler runs every hour and evaluates your organization&apos;s specific local timezone (e.g. <code>America/New_York</code>). Reminders are always delivered at 9:00 AM local time, never in the middle of the night.
          </li>
          <li>
            <strong>D-001 Guaranteed Deduplication:</strong> We enforce partial unique indexes in PostgreSQL. You and your assignees will receive each notification <em>exactly once</em> per deadline window.
          </li>
          <li>
            <strong>Monday Morning Digest:</strong> Organization administrators automatically receive an executive summary every Monday at 9:00 AM local time with all overdue items and tasks due that week.
          </li>
        </ul>
      </div>
    </div>
  );
}
