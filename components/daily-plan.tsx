// ============================================================
// Execution Tracker — Daily Plan Component (Phase 5 Polished)
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DailyPlanCard } from "@/components/daily-plan-card";
import {
  Sun,
  Moon,
  Plus,
  X,
  ArrowRight,
  CheckCircle2,
  Circle,
  Smile,
  Meh,
  Frown,
  Zap,
  Heart,
  Target,
  ClipboardCheck,
  AlertCircle,
} from "lucide-react";
import type {
  DailyPlan,
  DailyPlanGoal,
  DailyPlanTaskCommit,
  CarriedForwardGoal,
  TodayPlanResponse,
} from "@/types";

// ============================================================
// CONSTANTS
// ============================================================
const MAX_GOALS = 10;
const MAX_GOAL_LENGTH = 500;
const MAX_NOTE_LENGTH = 2000;
const EDIT_WINDOW_MINUTES = 30;

const MOOD_OPTIONS = [
  { value: "great", icon: Heart, label: "Great", color: "text-pink-500", bg: "hover:bg-pink-50" },
  { value: "good", icon: Smile, label: "Good", color: "text-green-500", bg: "hover:bg-green-50" },
  { value: "okay", icon: Meh, label: "Okay", color: "text-yellow-500", bg: "hover:bg-yellow-50" },
  { value: "struggling", icon: Frown, label: "Struggling", color: "text-orange-500", bg: "hover:bg-orange-50" },
  { value: "stressed", icon: Zap, label: "Stressed", color: "text-red-500", bg: "hover:bg-red-50" },
] as const;

// ============================================================
// COMPONENT
// ============================================================
interface DailyPlanProps {
  userRole: "admin" | "member";
  acceptedTasks: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

export function DailyPlan({ userRole, acceptedTasks }: DailyPlanProps) {
  // ---- Core State ----
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ---- Morning Form State ----
  const [goals, setGoals] = useState<DailyPlanGoal[]>([]);
  const [committedTasks, setCommittedTasks] = useState<DailyPlanTaskCommit[]>([]);
  const [morningNote, setMorningNote] = useState("");

  // ---- Evening Form State ----
  const [accomplishment, setAccomplishment] = useState("");
  const [blockers, setBlockers] = useState("");
  const [reflection, setReflection] = useState("");
  const [mood, setMood] = useState<string | null>(null);

  // ---- Carry Forward State ----
  const [carryForward, setCarryForward] = useState<CarriedForwardGoal[] | null>(null);

  // ---- UI State ----
  const [isExpanded, setIsExpanded] = useState(false);
  const [editWindowMinutes, setEditWindowMinutes] = useState(0);
  const [newGoal, setNewGoal] = useState("");
  const [showGoalLimitWarning, setShowGoalLimitWarning] = useState(false);

  // ============================================
  // DATA FETCHING
  // ============================================
  const fetchPlan = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/daily-plan/today");
      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated — skip silently
          return;
        }
        throw new Error("Failed to fetch plan");
      }

      const result: { data: TodayPlanResponse } = await response.json();

      if (result.data.plan) {
        const p = result.data.plan;
        setPlan(p);
        setGoals(p.plan_data.morning.goals || []);
        setCommittedTasks(p.plan_data.morning.committed_tasks || []);
        setMorningNote(p.plan_data.morning.note || "");
        setAccomplishment(p.plan_data.evening.accomplishment || "");
        setBlockers(p.plan_data.evening.blockers || "");
        setReflection(p.plan_data.evening.reflection || "");
        setMood(p.plan_data.evening.mood || null);

        // Calculate edit window for checked-in plans
        if (p.status === "checked_in" && p.checked_in_at) {
          const checkedInTime = new Date(p.checked_in_at);
          const deadline = new Date(checkedInTime.getTime() + EDIT_WINDOW_MINUTES * 60 * 1000);
          const remaining = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 60000));
          setEditWindowMinutes(remaining);

          if (remaining <= 0) {
            setIsExpanded(false);
          }
        }
      }

      if (result.data.carry_forward) {
        setCarryForward(result.data.carry_forward.goals);
      }
    } catch (err) {
      console.error("Error fetching daily plan:", err);
      setError("Could not load your daily plan. Please refresh the page.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // ============================================
  // EDIT WINDOW COUNTDOWN
  // ============================================
  useEffect(() => {
    if (plan?.status !== "checked_in" || !plan.checked_in_at) return;

    const interval = setInterval(() => {
      const checkedInTime = new Date(plan.checked_in_at!);
      const deadline = new Date(checkedInTime.getTime() + EDIT_WINDOW_MINUTES * 60 * 1000);
      const remaining = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 60000));
      setEditWindowMinutes(remaining);

      if (remaining <= 0) {
        setIsExpanded(false);
        clearInterval(interval);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [plan?.status, plan?.checked_in_at]);

  // Clear success message after timeout
  useEffect(() => {
    if (!successMessage) return;
    const timeout = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [successMessage]);

  // ============================================
  // GOAL OPERATIONS
  // ============================================
  function addGoal(content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (goals.length >= MAX_GOALS) {
      setShowGoalLimitWarning(true);
      setTimeout(() => setShowGoalLimitWarning(false), 3000);
      return;
    }

    if (trimmed.length > MAX_GOAL_LENGTH) {
      setError(`Goal must be under ${MAX_GOAL_LENGTH} characters`);
      return;
    }

    const goal: DailyPlanGoal = {
      id: crypto.randomUUID(),
      content: trimmed,
      is_completed: false,
    };

    setGoals((prev) => [...prev, goal]);
    setNewGoal("");
    setError(null);
  }

  function removeGoal(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  function toggleGoalCompletion(id: string) {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, is_completed: !g.is_completed } : g))
    );
  }

  // ============================================
  // TASK OPERATIONS
  // ============================================
  function toggleTask(task: { id: string; title: string; status: string }) {
    setCommittedTasks((prev) => {
      const existing = prev.find((t) => t.task_id === task.id);
      if (existing) {
        return prev.filter((t) => t.task_id !== task.id);
      }
      return [
        ...prev,
        {
          task_id: task.id,
          title: task.title,
          status_when_committed: task.status,
        },
      ];
    });
  }

  // ============================================
  // CARRY FORWARD
  // ============================================
  function handleCarryForward() {
    if (!carryForward) return;

    const availableSlots = MAX_GOALS - goals.length;
    const goalsToCarry = carryForward.slice(0, Math.max(0, availableSlots));

    if (goalsToCarry.length === 0) {
      setError(`Cannot carry forward — you already have ${MAX_GOALS} goals. Remove some first.`);
      return;
    }

    const carriedGoals: DailyPlanGoal[] = goalsToCarry.map((g) => ({
      id: crypto.randomUUID(),
      content: g.content,
      is_completed: false,
    }));

    setGoals((prev) => [...prev, ...carriedGoals]);
    setCarryForward(null);

    if (goalsToCarry.length < carryForward.length) {
      setError(`Only ${goalsToCarry.length} of ${carryForward.length} goals carried forward (max ${MAX_GOALS} goals).`);
    }
  }

  function dismissCarryForward() {
    setCarryForward(null);
  }

  // ============================================
  // SAVE PLAN
  // ============================================
  async function savePlan(status: "committed" | "checked_in") {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const planData = {
        morning: {
          goals,
          committed_tasks: committedTasks,
          note: morningNote && morningNote.trim() ? morningNote.trim() : null,
        },
        evening: {
          accomplishment: accomplishment || null,
          blockers: blockers || null,
          reflection: reflection || null,
          mood: mood,
        },
      };

      const response = await fetch("/api/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_data: planData, status }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to save plan");
        return;
      }

      // Refresh plan data
      await fetchPlan();

      if (status === "committed") {
        setSuccessMessage("Plan committed! Come back this evening to check in.");
        setIsExpanded(false);
      }

      if (status === "checked_in") {
        setSuccessMessage("Check-in submitted! Great work today.");
        setIsExpanded(false);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsSaving(false);
      setHasSubmitted(false);
    }
  }

  function handleSave(status: "committed" | "checked_in") {
    if (isSaving || hasSubmitted) return;

    // Client-side validation before sending
    if (status === "committed" && goals.length === 0) {
      setError("Please add at least one goal before committing");
      return;
    }

    if (status === "checked_in" && !accomplishment.trim()) {
      setError("Please describe what you accomplished today");
      return;
    }

    setHasSubmitted(true);
    savePlan(status);
  }

  // ============================================
  // DERIVED STATE
  // ============================================
  const isEvening = plan?.status === "committed";
  const completedGoalCount = goals.filter((g) => g.is_completed).length;

  // ============================================
  // LOADING STATE
  // ============================================
  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="min-h-[80px] py-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-gray-200" />
            <div className="h-4 w-48 rounded bg-gray-200" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ============================================
  // SUCCESS BANNER
  // ============================================
  if (successMessage) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-800">{successMessage}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ============================================
  // COLLAPSED: CHECKED IN
  // ============================================
  if (plan?.status === "checked_in" && !isExpanded) {
    return (
      <DailyPlanCard
        goalCount={goals.length}
        taskCount={committedTasks.length}
        completedGoalCount={completedGoalCount}
        status="checked_in"
        committedAt={plan.committed_at}
        checkedInAt={plan.checked_in_at}
        reflection={reflection}
        onExpand={() => setIsExpanded(true)}
        editWindowMinutes={editWindowMinutes}
      />
    );
  }

  // ============================================
  // COLLAPSED: COMMITTED
  // ============================================
  if (plan?.status === "committed" && !isExpanded) {
    return (
      <DailyPlanCard
        goalCount={goals.length}
        taskCount={committedTasks.length}
        completedGoalCount={0}
        status="committed"
        committedAt={plan.committed_at}
        checkedInAt={null}
        reflection={null}
        onExpand={() => setIsExpanded(true)}
        editWindowMinutes={0}
      />
    );
  }

  // ============================================
  // EXPANDED FORM
  // ============================================
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isEvening ? (
              <>
                <Moon className="h-5 w-5 text-indigo-600" />
                How did your day go?
              </>
            ) : (
              <>
                <Sun className="h-5 w-5 text-amber-600" />
                {plan ? "Edit Your Plan" : "What's your focus today?"}
              </>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {plan && (
              <Badge variant="outline" className="text-xs capitalize">
                {plan.status === "draft" ? "Draft" : plan.status.replace("_", " ")}
              </Badge>
            )}
            {plan && (
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
                <X className="h-4 w-4 mr-1" />
                Collapse
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* ============================================ */}
        {/* GOALS SECTION                                 */}
        {/* ============================================ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-600" />
              {isEvening ? "Your Goals" : "Goals for Today"}
            </h3>
            {goals.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {goals.length}/{MAX_GOALS}
              </span>
            )}
          </div>

          {/* Goal List */}
          {goals.length > 0 && (
            <div className="space-y-2">
              {goals.map((goal) => (
                <div key={goal.id} className="flex items-center gap-2 group">
                  {isEvening ? (
                    <button
                      onClick={() => toggleGoalCompletion(goal.id)}
                      className={`flex items-center gap-2 flex-1 text-left p-2.5 rounded-md border transition-all ${
                        goal.is_completed
                          ? "bg-green-50 border-green-200 line-through text-muted-foreground"
                          : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          goal.is_completed
                            ? "bg-green-500 border-green-500"
                            : "border-gray-300 group-hover:border-gray-400"
                        }`}
                      >
                        {goal.is_completed && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className="text-sm">{goal.content}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 p-2.5 bg-white border border-gray-200 rounded-md">
                      <Circle className="h-4 w-4 text-gray-300 shrink-0" />
                      <span className="text-sm flex-1">{goal.content}</span>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-8 w-8"
                    onClick={() => removeGoal(goal.id)}
                    aria-label={`Remove goal: ${goal.content}`}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Empty Goals State */}
          {goals.length === 0 && !isEvening && (
            <div className="rounded-md bg-gray-50 border border-dashed border-gray-300 p-4 text-center">
              <Target className="mx-auto h-6 w-6 text-gray-300 mb-2" />
              <p className="text-sm text-muted-foreground">No goals yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add 1-3 specific, achievable goals for today.
              </p>
            </div>
          )}

          {/* Add Goal Input */}
          {!isEvening && goals.length < MAX_GOALS && (
            <div className="flex gap-2">
              <Input
                value={newGoal}
                onChange={(e) => {
                  setNewGoal(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGoal(newGoal);
                  }
                }}
                placeholder="Add a goal..."
                className="text-sm"
                maxLength={MAX_GOAL_LENGTH}
                aria-label="New goal"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => addGoal(newGoal)}
                disabled={!newGoal.trim()}
                aria-label="Add goal"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Goal Limit Warning */}
          {showGoalLimitWarning && (
            <p className="text-xs text-amber-600 animate-in fade-in">
              Maximum {MAX_GOALS} goals allowed. Remove a goal to add a new one.
            </p>
          )}

          {/* Max Goals Reached */}
          {goals.length >= MAX_GOALS && !isEvening && (
            <p className="text-xs text-muted-foreground">
              Maximum {MAX_GOALS} goals reached. Remove a goal to add a new one.
            </p>
          )}
        </div>

        {/* ============================================ */}
        {/* COMMITTED TASKS SECTION                       */}
        {/* ============================================ */}
        {!isEvening && acceptedTasks.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
              Tasks You'll Work On
            </h3>
            <div className="space-y-2">
              {acceptedTasks.map((task) => {
                const isSelected = committedTasks.some((t) => t.task_id === task.id);
                return (
                  <button
                    key={task.id}
                    onClick={() => toggleTask(task)}
                    className={`flex items-center gap-2 w-full text-left p-2.5 rounded-md border transition-all ${
                      isSelected
                        ? "bg-blue-50 border-blue-300 shadow-sm"
                        : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                    aria-pressed={isSelected}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{task.title}</p>
                      <Badge variant="outline" className="text-xs mt-0.5 capitalize">
                        {task.status}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* MORNING NOTE                                  */}
        {/* ============================================ */}
        {!isEvening && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Note (optional)</h3>
            <Textarea
              value={morningNote}
              onChange={(e) => setMorningNote(e.target.value)}
              placeholder="Any context for today? Focus areas? Things to avoid?"
              rows={2}
              className="text-sm resize-none"
              maxLength={MAX_NOTE_LENGTH}
            />
            {morningNote.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                {morningNote.length}/{MAX_NOTE_LENGTH}
              </p>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* CARRY FORWARD                                 */}
        {/* ============================================ */}
        {carryForward && carryForward.length > 0 && !isEvening && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800 mb-2">
                  You have {carryForward.length} unfinished {carryForward.length === 1 ? "goal" : "goals"} from yesterday:
                </p>
                <ul className="text-sm text-blue-700 list-disc list-inside mb-3">
                  {carryForward.map((g) => (
                    <li key={g.goal_id}>{g.content}</li>
                  ))}
                </ul>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-6 w-6"
                onClick={dismissCarryForward}
                aria-label="Dismiss carry forward"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCarryForward}
              className="bg-white"
              disabled={goals.length >= MAX_GOALS}
            >
              <ArrowRight className="h-4 w-4 mr-1" />
              Carry forward into today
            </Button>
          </div>
        )}

        {/* ============================================ */}
        {/* EVENING SECTION                               */}
        {/* ============================================ */}
        {isEvening && (
          <div className="space-y-5 border-t pt-4">
            {/* Accomplishment */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                What did you accomplish? <span className="text-destructive">*</span>
              </h3>
              <Textarea
                value={accomplishment}
                onChange={(e) => {
                  setAccomplishment(e.target.value);
                  setError(null);
                }}
                placeholder="Describe what you got done today..."
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            {/* Blockers */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Any blockers?</h3>
              <Textarea
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                placeholder="What's in your way? What do you need help with?"
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Reflection */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Quick reflection</h3>
              <Textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="How did the day go? Any learnings or wins?"
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Mood */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">How are you feeling?</h3>
              <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Mood">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMood(mood === m.value ? null : m.value)}
                    role="radio"
                    aria-checked={mood === m.value}
                    aria-label={m.label}
                    className={`flex flex-col items-center gap-1 p-2 rounded-md border transition-all ${
                      mood === m.value
                        ? "border-gray-400 bg-gray-100 ring-2 ring-gray-300"
                        : `border-gray-200 ${m.bg}`
                    }`}
                  >
                    <m.icon className={`h-5 w-5 ${m.color}`} />
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* ACTION BUTTONS                                */}
        {/* ============================================ */}
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2 border-t">
          {isEvening ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsExpanded(false)}
                disabled={isSaving}
                className="sm:hidden"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSave("checked_in")}
                disabled={isSaving || hasSubmitted || !accomplishment.trim()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Moon className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Submit Check-In"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setIsExpanded(false)}
                disabled={isSaving}
                className="sm:hidden"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSave("committed")}
                disabled={isSaving || hasSubmitted || goals.length === 0}
              >
                <Sun className="h-4 w-4 mr-2" />
                {isSaving
                  ? "Saving..."
                  : plan?.status === "draft" || !plan
                  ? "Commit to Today's Plan"
                  : "Update Plan"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
