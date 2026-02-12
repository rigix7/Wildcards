/**
 * ReferralAdminSection – Admin panel for managing referral periods and strategies
 *
 * Features:
 * - List all referral periods with status badges
 * - Create/edit draft periods with strategy-specific config forms
 * - Activate, complete, and delete periods
 * - View live stats for active periods
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Play,
  Square,
  Edit3,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReferralPeriod {
  id: number;
  name: string;
  strategy: string;
  strategyConfig: Record<string, unknown>;
  resetMode: string;
  resetConfig: Record<string, unknown>;
  refereeBenefits: { signupBonus: number; firstBetMultiplier: number; maxStake: number };
  status: string;
  startsAt: string;
  endsAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PeriodStats {
  totalReferrals: number;
  activeReferrals: number;
  usersWithBonuses: number;
}

const STRATEGY_OPTIONS = [
  { value: "growth_multiplier", label: "Growth Multiplier" },
  { value: "revenue_share", label: "Revenue Share" },
  { value: "milestone_quest", label: "Milestone Quest" },
  { value: "team_volume", label: "Team Volume" },
] as const;

const RESET_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "scheduled", label: "Scheduled" },
  { value: "rolling_expiry", label: "Rolling Expiry" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-600",
  active: "bg-green-600",
  completed: "bg-blue-600",
  cancelled: "bg-red-600",
};

function getAdminKey(): string {
  return localStorage.getItem("adminKey") || "";
}

function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminKey()}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type View = "list" | "create" | "edit";

export function ReferralAdminSection() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("list");
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [expandedPeriodId, setExpandedPeriodId] = useState<number | null>(null);

  const { data: periodsData, isLoading } = useQuery({
    queryKey: ["admin-referral-periods"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/referral/periods");
      return res.json();
    },
  });

  const periods: ReferralPeriod[] = periodsData?.periods || [];

  const handleEdit = (period: ReferralPeriod) => {
    setEditingPeriodId(period.id);
    setView("edit");
  };

  const handleCreate = () => {
    setEditingPeriodId(null);
    setView("create");
  };

  const handleBack = () => {
    setView("list");
    setEditingPeriodId(null);
    queryClient.invalidateQueries({ queryKey: ["admin-referral-periods"] });
  };

  if (view === "create" || view === "edit") {
    return (
      <PeriodForm
        periodId={editingPeriodId}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold">Referral System</h2>
          <p className="text-sm text-zinc-500">
            Manage referral campaigns with configurable strategies
          </p>
        </div>
        <Button onClick={handleCreate} data-testid="button-create-period">
          <Plus className="w-4 h-4 mr-1" />
          New Period
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : periods.length === 0 ? (
        <Card className="p-8 text-center text-zinc-500">
          No referral periods created yet. Create one to get started.
        </Card>
      ) : (
        <div className="space-y-3">
          {periods.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              expanded={expandedPeriodId === period.id}
              onToggle={() =>
                setExpandedPeriodId(expandedPeriodId === period.id ? null : period.id)
              }
              onEdit={() => handleEdit(period)}
              onRefresh={() =>
                queryClient.invalidateQueries({ queryKey: ["admin-referral-periods"] })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Period Card
// ---------------------------------------------------------------------------

function PeriodCard({
  period,
  expanded,
  onToggle,
  onEdit,
  onRefresh,
}: {
  period: ReferralPeriod;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/admin/referral/periods/${period.id}/activate`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to activate");
      }
      return res.json();
    },
    onSuccess: onRefresh,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/admin/referral/periods/${period.id}/complete`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to complete");
      }
      return res.json();
    },
    onSuccess: onRefresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/admin/referral/periods/${period.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      return res.json();
    },
    onSuccess: onRefresh,
  });

  const strategyLabel =
    STRATEGY_OPTIONS.find((s) => s.value === period.strategy)?.label || period.strategy;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={onToggle}>
          <span
            className={`px-2 py-0.5 rounded text-xs text-white font-bold uppercase ${
              STATUS_COLORS[period.status] || "bg-zinc-600"
            }`}
          >
            {period.status}
          </span>
          <div>
            <h3 className="font-bold text-sm">{period.name}</h3>
            <p className="text-xs text-zinc-500">
              {strategyLabel} | {period.resetMode} | Started{" "}
              {new Date(period.startsAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {period.status === "draft" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onEdit}
                data-testid={`button-edit-${period.id}`}
              >
                <Edit3 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending}
                data-testid={`button-activate-${period.id}`}
              >
                {activateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-${period.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
          {period.status === "active" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              data-testid={`button-complete-${period.id}`}
            >
              {completeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-1" />
              )}
              Complete
            </Button>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-400 cursor-pointer" onClick={onToggle} />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400 cursor-pointer" onClick={onToggle} />
          )}
        </div>
      </div>

      {(activateMutation.isError || completeMutation.isError || deleteMutation.isError) && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {(activateMutation.error || completeMutation.error || deleteMutation.error)?.message}
        </div>
      )}

      {expanded && <PeriodDetails period={period} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Period Details (expanded view)
// ---------------------------------------------------------------------------

function PeriodDetails({ period }: { period: ReferralPeriod }) {
  const { data } = useQuery({
    queryKey: ["admin-referral-period-detail", period.id],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/referral/periods/${period.id}`);
      return res.json();
    },
  });

  const stats: PeriodStats | null = data?.stats || null;

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-zinc-800/50 rounded">
            <div className="text-lg font-bold">{stats.totalReferrals}</div>
            <div className="text-xs text-zinc-500">Total Referrals</div>
          </div>
          <div className="text-center p-2 bg-zinc-800/50 rounded">
            <div className="text-lg font-bold">{stats.activeReferrals}</div>
            <div className="text-xs text-zinc-500">Active Referrals</div>
          </div>
          <div className="text-center p-2 bg-zinc-800/50 rounded">
            <div className="text-lg font-bold">{stats.usersWithBonuses}</div>
            <div className="text-xs text-zinc-500">Users with Bonuses</div>
          </div>
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Strategy</span>
          <span>{STRATEGY_OPTIONS.find((s) => s.value === period.strategy)?.label}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Reset Mode</span>
          <span className="capitalize">{period.resetMode.replace("_", " ")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Started</span>
          <span>{new Date(period.startsAt).toLocaleString()}</span>
        </div>
        {period.endsAt && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Ends</span>
            <span>{new Date(period.endsAt).toLocaleString()}</span>
          </div>
        )}
        {period.completedAt && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Completed</span>
            <span>{new Date(period.completedAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs text-zinc-500 mb-1">Strategy Config</h4>
        <pre className="text-xs bg-zinc-900 p-2 rounded overflow-auto max-h-48">
          {JSON.stringify(period.strategyConfig, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Period Create/Edit Form
// ---------------------------------------------------------------------------

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  growth_multiplier: {
    tiers: [
      { referrals: 1, multiplier: 1.1 },
      { referrals: 3, multiplier: 1.25 },
      { referrals: 5, multiplier: 1.5 },
    ],
    activeDefinition: { betWithinDays: 30, minLifetimeVolume: 50 },
  },
  revenue_share: {
    sharePercentage: 15,
    durationDays: null,
    maxPerReferral: 10000,
    maxMonthlyTotal: 50000,
  },
  milestone_quest: {
    durationDays: 90,
    referrerMilestones: [
      { volume: 0, reward: 25, label: "Referral signed up" },
      { volume: 1, reward: 100, label: "First bet" },
      { volume: 50, reward: 200, label: "$50 volume" },
    ],
    refereeMilestones: [],
  },
  team_volume: {
    resetFrequency: "weekly",
    teamTiers: [
      { weeklyVolume: 500, multiplier: 1.1 },
      { weeklyVolume: 2000, multiplier: 1.25 },
      { weeklyVolume: 5000, multiplier: 1.5 },
    ],
  },
};

function PeriodForm({
  periodId,
  onBack,
}: {
  periodId: number | null;
  onBack: () => void;
}) {
  const isEditing = periodId !== null;
  const queryClient = useQueryClient();

  // Fetch existing period for edit mode
  const { data: existingData, isLoading: loadingExisting } = useQuery({
    queryKey: ["admin-referral-period-detail", periodId],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/referral/periods/${periodId}`);
      return res.json();
    },
    enabled: isEditing,
  });

  const existing: ReferralPeriod | null = existingData?.period || null;

  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("growth_multiplier");
  const [strategyConfig, setStrategyConfig] = useState<Record<string, unknown>>(
    DEFAULT_CONFIGS.growth_multiplier,
  );
  const [resetMode, setResetMode] = useState("manual");
  const [resetConfig, setResetConfig] = useState<Record<string, unknown>>({});
  const [signupBonus, setSignupBonus] = useState(100);
  const [firstBetMultiplier, setFirstBetMultiplier] = useState(2.0);
  const [maxStake, setMaxStake] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Populate form when editing
  if (isEditing && existing && !initialized) {
    setName(existing.name);
    setStrategy(existing.strategy);
    setStrategyConfig(existing.strategyConfig);
    setResetMode(existing.resetMode);
    setResetConfig(existing.resetConfig);
    if (existing.refereeBenefits) {
      setSignupBonus(existing.refereeBenefits.signupBonus);
      setFirstBetMultiplier(existing.refereeBenefits.firstBetMultiplier);
      setMaxStake(existing.refereeBenefits.maxStake);
    }
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        strategy,
        strategyConfig,
        resetMode,
        resetConfig,
        refereeBenefits: { signupBonus, firstBetMultiplier, maxStake },
        startsAt: new Date().toISOString(),
      };

      const url = isEditing
        ? `/api/admin/referral/periods/${periodId}`
        : "/api/admin/referral/periods";
      const method = isEditing ? "PATCH" : "POST";

      const res = await adminFetch(url, {
        method,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referral-periods"] });
      onBack();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleStrategyChange = (newStrategy: string) => {
    setStrategy(newStrategy);
    setStrategyConfig(DEFAULT_CONFIGS[newStrategy] || {});
  };

  if (isEditing && loadingExisting) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <h2 className="text-lg font-bold">
          {isEditing ? "Edit Period" : "Create Referral Period"}
        </h2>
      </div>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Period Name */}
      <div>
        <Label>Period Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. January 2026 Growth Sprint"
          data-testid="input-period-name"
        />
      </div>

      {/* Strategy Selector */}
      <div>
        <Label>Strategy</Label>
        <Select value={strategy} onValueChange={handleStrategyChange}>
          <SelectTrigger data-testid="select-strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STRATEGY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Strategy-specific Config */}
      <div className="border border-zinc-800 rounded p-4 space-y-4">
        <h3 className="text-sm font-bold">Strategy Configuration</h3>
        <StrategyConfigEditor
          strategy={strategy}
          config={strategyConfig}
          onChange={setStrategyConfig}
        />
      </div>

      {/* Reset Mode */}
      <div>
        <Label>Reset Mode</Label>
        <Select value={resetMode} onValueChange={setResetMode}>
          <SelectTrigger data-testid="select-reset-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESET_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reset Config */}
      {resetMode === "scheduled" && (
        <div className="border border-zinc-800 rounded p-4 space-y-3">
          <h3 className="text-sm font-bold">Schedule Config</h3>
          <div>
            <Label>Frequency</Label>
            <Select
              value={(resetConfig as { schedule?: { frequency?: string } })?.schedule?.frequency || "weekly"}
              onValueChange={(v) =>
                setResetConfig({
                  ...resetConfig,
                  schedule: {
                    ...(resetConfig as { schedule?: Record<string, unknown> })?.schedule,
                    frequency: v,
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {resetMode === "rolling_expiry" && (
        <div className="border border-zinc-800 rounded p-4 space-y-3">
          <h3 className="text-sm font-bold">Rolling Expiry Config</h3>
          <div>
            <Label>Window (days)</Label>
            <Input
              type="number"
              value={(resetConfig as { rolling?: { windowDays?: number } })?.rolling?.windowDays || 90}
              onChange={(e) =>
                setResetConfig({
                  ...resetConfig,
                  rolling: { windowDays: parseInt(e.target.value) || 90 },
                })
              }
            />
          </div>
        </div>
      )}

      {/* Referee Benefits */}
      <div className="border border-zinc-800 rounded p-4 space-y-3">
        <h3 className="text-sm font-bold">Referee Benefits</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Signup Bonus (pts)</Label>
            <Input
              type="number"
              value={signupBonus}
              onChange={(e) => setSignupBonus(parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>First Bet Multiplier</Label>
            <Input
              type="number"
              step="0.1"
              value={firstBetMultiplier}
              onChange={(e) => setFirstBetMultiplier(parseFloat(e.target.value) || 1)}
            />
          </div>
          <div>
            <Label>Max Stake ($)</Label>
            <Input
              type="number"
              value={maxStake}
              onChange={(e) => setMaxStake(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex gap-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name}
          data-testid="button-save-period"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
          ) : null}
          {isEditing ? "Save Changes" : "Create as Draft"}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strategy Config Editor
// ---------------------------------------------------------------------------

function StrategyConfigEditor({
  strategy,
  config,
  onChange,
}: {
  strategy: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  switch (strategy) {
    case "growth_multiplier":
      return <GrowthMultiplierEditor config={config} onChange={onChange} />;
    case "revenue_share":
      return <RevenueShareEditor config={config} onChange={onChange} />;
    case "milestone_quest":
      return <MilestoneQuestEditor config={config} onChange={onChange} />;
    case "team_volume":
      return <TeamVolumeEditor config={config} onChange={onChange} />;
    default:
      return <div className="text-zinc-500 text-sm">Select a strategy</div>;
  }
}

// ---------------------------------------------------------------------------
// Growth Multiplier Editor
// ---------------------------------------------------------------------------

function GrowthMultiplierEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const tiers = (config.tiers || []) as Array<{ referrals: number; multiplier: number }>;
  const activeDefinition = (config.activeDefinition || { betWithinDays: 30, minLifetimeVolume: 50 }) as {
    betWithinDays: number;
    minLifetimeVolume: number;
  };

  const updateTier = (index: number, field: string, value: number) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    onChange({ ...config, tiers: newTiers });
  };

  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    onChange({
      ...config,
      tiers: [
        ...tiers,
        {
          referrals: (lastTier?.referrals || 0) + 5,
          multiplier: Math.min((lastTier?.multiplier || 1) + 0.25, 5),
        },
      ],
    });
  };

  const removeTier = (index: number) => {
    onChange({ ...config, tiers: tiers.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-zinc-500">Referral Tiers</Label>
        <div className="space-y-2 mt-1">
          {tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <div>
                <Label className="text-[10px] text-zinc-600">Min Referrals</Label>
                <Input
                  type="number"
                  value={tier.referrals}
                  onChange={(e) => updateTier(i, "referrals", parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label className="text-[10px] text-zinc-600">Multiplier</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={tier.multiplier}
                  onChange={(e) => updateTier(i, "multiplier", parseFloat(e.target.value) || 1)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => removeTier(i)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="w-3 h-3 mr-1" /> Add Tier
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-zinc-500">Bet Within (days)</Label>
          <Input
            type="number"
            value={activeDefinition.betWithinDays}
            onChange={(e) =>
              onChange({
                ...config,
                activeDefinition: { ...activeDefinition, betWithinDays: parseInt(e.target.value) || 30 },
              })
            }
          />
        </div>
        <div>
          <Label className="text-xs text-zinc-500">Min Lifetime Volume ($)</Label>
          <Input
            type="number"
            value={activeDefinition.minLifetimeVolume}
            onChange={(e) =>
              onChange({
                ...config,
                activeDefinition: {
                  ...activeDefinition,
                  minLifetimeVolume: parseInt(e.target.value) || 0,
                },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue Share Editor
// ---------------------------------------------------------------------------

function RevenueShareEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs text-zinc-500">Share Percentage (%)</Label>
        <Input
          type="number"
          min={0}
          max={50}
          value={(config.sharePercentage as number) || 15}
          onChange={(e) => onChange({ ...config, sharePercentage: parseFloat(e.target.value) || 0 })}
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-500">Duration (days, 0 = lifetime)</Label>
        <Input
          type="number"
          value={(config.durationDays as number) || 0}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            onChange({ ...config, durationDays: val > 0 ? val : null });
          }}
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-500">Max per Referral (pts)</Label>
        <Input
          type="number"
          value={(config.maxPerReferral as number) || 0}
          onChange={(e) => onChange({ ...config, maxPerReferral: parseInt(e.target.value) || 0 })}
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-500">Max Monthly Total (pts)</Label>
        <Input
          type="number"
          value={(config.maxMonthlyTotal as number) || 0}
          onChange={(e) => onChange({ ...config, maxMonthlyTotal: parseInt(e.target.value) || 0 })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestone Quest Editor
// ---------------------------------------------------------------------------

function MilestoneQuestEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const milestones = (config.referrerMilestones || []) as Array<{
    volume: number;
    reward: number;
    label: string;
  }>;

  const updateMilestone = (index: number, field: string, value: unknown) => {
    const newMilestones = [...milestones];
    newMilestones[index] = { ...newMilestones[index], [field]: value };
    onChange({ ...config, referrerMilestones: newMilestones });
  };

  const addMilestone = () => {
    const last = milestones[milestones.length - 1];
    onChange({
      ...config,
      referrerMilestones: [
        ...milestones,
        {
          volume: (last?.volume || 0) + 50,
          reward: (last?.reward || 0) + 100,
          label: `$${(last?.volume || 0) + 50} volume`,
        },
      ],
    });
  };

  const removeMilestone = (index: number) => {
    onChange({
      ...config,
      referrerMilestones: milestones.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-zinc-500">Duration (days)</Label>
        <Input
          type="number"
          value={(config.durationDays as number) || 90}
          onChange={(e) => onChange({ ...config, durationDays: parseInt(e.target.value) || 90 })}
          className="w-32"
        />
      </div>

      <div>
        <Label className="text-xs text-zinc-500">Referrer Milestones</Label>
        <div className="space-y-2 mt-1">
          {milestones.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-center">
              <div>
                <Label className="text-[10px] text-zinc-600">Volume ($)</Label>
                <Input
                  type="number"
                  value={m.volume}
                  onChange={(e) => updateMilestone(i, "volume", parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label className="text-[10px] text-zinc-600">Reward (pts)</Label>
                <Input
                  type="number"
                  value={m.reward}
                  onChange={(e) => updateMilestone(i, "reward", parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label className="text-[10px] text-zinc-600">Label</Label>
                <Input
                  value={m.label}
                  onChange={(e) => updateMilestone(i, "label", e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => removeMilestone(i)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addMilestone}>
            <Plus className="w-3 h-3 mr-1" /> Add Milestone
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Volume Editor
// ---------------------------------------------------------------------------

function TeamVolumeEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const tiers = (config.teamTiers || []) as Array<{ weeklyVolume: number; multiplier: number }>;

  const updateTier = (index: number, field: string, value: number) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    onChange({ ...config, teamTiers: newTiers });
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    onChange({
      ...config,
      teamTiers: [
        ...tiers,
        {
          weeklyVolume: (last?.weeklyVolume || 0) + 1000,
          multiplier: Math.min((last?.multiplier || 1) + 0.25, 5),
        },
      ],
    });
  };

  const removeTier = (index: number) => {
    onChange({ ...config, teamTiers: tiers.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-zinc-500">Reset Frequency</Label>
        <Select
          value={(config.resetFrequency as string) || "weekly"}
          onValueChange={(v) => onChange({ ...config, resetFrequency: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-zinc-500">Team Tiers</Label>
        <div className="space-y-2 mt-1">
          {tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <div>
                <Label className="text-[10px] text-zinc-600">Volume Threshold ($)</Label>
                <Input
                  type="number"
                  value={tier.weeklyVolume}
                  onChange={(e) => updateTier(i, "weeklyVolume", parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label className="text-[10px] text-zinc-600">Multiplier</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={tier.multiplier}
                  onChange={(e) => updateTier(i, "multiplier", parseFloat(e.target.value) || 1)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => removeTier(i)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="w-3 h-3 mr-1" /> Add Tier
          </Button>
        </div>
      </div>
    </div>
  );
}
