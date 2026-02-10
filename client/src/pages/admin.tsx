/**
 * Admin Panel – Full version with all features and password protection
 *
 * Combines the original Wildcards admin (Tags, Match Day, Futures, Players,
 * Wild Points, Sport Config) with the PolyHouse-derived sections (Points
 * Config, Fee Config) and password protection via ADMIN_SECRET_KEY.
 *
 * Tabs:
 *   - Tags          – Sync & toggle Polymarket sport tags
 *   - Match Day     – Select leagues / bet types for the Predict tab
 *   - Futures       – Add long-term Polymarket events by slug/URL
 *   - Players       – Create / manage demo players
 *   - $WILD Points  – View wallet-level points & activity
 *   - Points Config – Enable/disable points, referral %, reset schedule
 *   - Fees          – Fee BPS, multi-wallet splits
 *   - Sport Config  – Per-sport + market-type field mapping
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
  Link2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lock,
  LogOut,
  DollarSign,
  Star,
  Users,
  AlertTriangle,
  Settings2,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  fetchSportsWithMarketTypes,
  type SportWithMarketTypes,
} from "@/lib/polymarket";
import type {
  Market,
  Player,
  InsertPlayer,
  AdminSettings,
  Futures,
  SportMarketConfig,
  PolymarketTagRecord,
  FuturesCategory,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// Types (mirror server-side white-label config)
// ---------------------------------------------------------------------------

interface FeeWallet {
  address: string;
  percentage: number;
  label?: string;
}

interface FeeConfig {
  feeBps: number;
  feeAddress?: string;
  enabled?: boolean;
  wallets?: FeeWallet[];
}

interface PointsConfig {
  enabled: boolean;
  name: string;
  resetSchedule: "never" | "weekly" | "monthly" | "yearly";
  referralEnabled: boolean;
  referralPercentage: number;
}

interface WhiteLabelConfig {
  id: number;
  feeConfig?: FeeConfig | null;
  pointsConfig?: PointsConfig | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Player form schema
// ---------------------------------------------------------------------------

const playerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(6, "Max 6 characters"),
  team: z.string().min(1, "Team is required"),
  sport: z.string().min(1, "Sport is required"),
  fundingTarget: z.number().min(1000, "Minimum 1,000"),
  fundingCurrent: z.number().min(0),
  status: z.enum(["offering", "available", "closed"]),
});

type PlayerFormData = z.infer<typeof playerFormSchema>;

// ---------------------------------------------------------------------------
// Auth-aware fetch helper
// ---------------------------------------------------------------------------

function getAdminHeaders(): HeadersInit {
  const secret = localStorage.getItem("adminSecret");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  };
}

async function adminFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...getAdminHeaders(), ...(init?.headers || {}) },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSlugFromInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("polymarket.com")) {
    const match = trimmed.match(/polymarket\.com\/event\/([^/?#]+)/);
    if (match) return match[1];
    const marketMatch = trimmed.match(/polymarket\.com\/([^/?#]+)/);
    if (marketMatch) return marketMatch[1];
  }
  return trimmed;
}

// ===========================================================================
// Password Prompt
// ===========================================================================

function AdminPasswordPrompt({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${password}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        localStorage.setItem("adminSecret", password);
        onAuthenticated();
      } else {
        setError("Invalid admin password");
        setPassword("");
      }
    } catch {
      setError("Failed to verify password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md p-8 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="flex items-center justify-center mb-6">
          <Lock className="w-12 h-12 text-zinc-400" />
        </div>
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          Admin Access
        </h1>
        <p className="text-zinc-400 text-center mb-6">
          Enter your admin password to continue
        </p>

        <form onSubmit={handleSubmit}>
          <Input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4"
            autoFocus
            data-testid="input-admin-password"
          />

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !password}
            data-testid="button-unlock"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {loading ? "Verifying..." : "Unlock Admin Panel"}
          </Button>
        </form>

        <p className="text-xs text-zinc-500 mt-4 text-center">
          Set ADMIN_SECRET_KEY in your environment variables
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// Fee Configuration Section
// ===========================================================================

function FeeSection({
  feeConfig,
  setFeeConfig,
  onSave,
  isSaving,
}: {
  feeConfig: FeeConfig;
  setFeeConfig: (cfg: FeeConfig) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const walletsValid =
    !feeConfig.wallets ||
    feeConfig.wallets.length === 0 ||
    Math.abs(
      feeConfig.wallets.reduce((s, w) => s + (w.percentage || 0), 0) - 100,
    ) <= 0.01;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-bold flex items-center gap-2 text-white">
          <DollarSign className="w-5 h-5" />
          Fee Configuration
        </h3>
        <p className="text-sm text-zinc-500">
          Configure platform fees collected on successful bets
        </p>
      </div>

      {/* Fee rate */}
      <div>
        <Label className="text-sm">Fee Rate (Basis Points)</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            type="number"
            min={0}
            max={1000}
            value={feeConfig.feeBps}
            onChange={(e) =>
              setFeeConfig({
                ...feeConfig,
                feeBps: parseInt(e.target.value) || 0,
              })
            }
            className="font-mono w-32"
            data-testid="input-fee-bps"
          />
          <span className="text-zinc-400 text-sm whitespace-nowrap">
            = {((feeConfig.feeBps || 0) / 100).toFixed(2)}%
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          100 bps = 1%. Max 1000 bps (10%)
        </p>
      </div>

      {/* Multi-wallet */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Fee Recipients</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setFeeConfig({
                ...feeConfig,
                wallets: [
                  ...(feeConfig.wallets || []),
                  { address: "", percentage: 0, label: "" },
                ],
              })
            }
            data-testid="button-add-wallet"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Wallet
          </Button>
        </div>

        {(!feeConfig.wallets || feeConfig.wallets.length === 0) && (
          <div className="text-sm text-zinc-500 bg-zinc-800/50 rounded-lg p-3">
            No fee recipients configured. Add wallets to split fees between
            multiple addresses.
          </div>
        )}

        {feeConfig.wallets?.map((wallet, index) => (
          <div
            key={index}
            className="flex items-start gap-2 bg-zinc-800/50 rounded-lg p-3"
          >
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-zinc-500">Label</Label>
                  <Input
                    value={wallet.label || ""}
                    onChange={(e) => {
                      const ws = [...(feeConfig.wallets || [])];
                      ws[index] = { ...wallet, label: e.target.value };
                      setFeeConfig({ ...feeConfig, wallets: ws });
                    }}
                    placeholder="Platform, Operator..."
                    className="text-sm"
                    data-testid={`input-wallet-label-${index}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">
                    Wallet Address
                  </Label>
                  <Input
                    value={wallet.address}
                    onChange={(e) => {
                      const ws = [...(feeConfig.wallets || [])];
                      ws[index] = { ...wallet, address: e.target.value };
                      setFeeConfig({ ...feeConfig, wallets: ws });
                    }}
                    placeholder="0x..."
                    className="font-mono text-sm"
                    data-testid={`input-wallet-address-${index}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Share (%)</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={wallet.percentage}
                      onChange={(e) => {
                        const ws = [...(feeConfig.wallets || [])];
                        ws[index] = {
                          ...wallet,
                          percentage: parseFloat(e.target.value) || 0,
                        };
                        setFeeConfig({ ...feeConfig, wallets: ws });
                      }}
                      className="font-mono text-sm"
                      data-testid={`input-wallet-percentage-${index}`}
                    />
                    <span className="text-zinc-400">%</span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="text-zinc-500 hover:text-red-400"
              onClick={() => {
                const ws = [...(feeConfig.wallets || [])];
                ws.splice(index, 1);
                setFeeConfig({ ...feeConfig, wallets: ws });
              }}
              data-testid={`button-remove-wallet-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}

        {/* Validation warning */}
        {feeConfig.wallets &&
          feeConfig.wallets.length > 0 &&
          (() => {
            const total = feeConfig.wallets!.reduce(
              (s, w) => s + (w.percentage || 0),
              0,
            );
            if (Math.abs(total - 100) > 0.01) {
              return (
                <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-400/10 rounded-lg p-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    Wallet shares must total 100% (currently{" "}
                    {total.toFixed(1)}%)
                  </span>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-400/10 rounded-lg p-2">
                <Check className="w-4 h-4" />
                <span>Shares total 100% - configuration valid</span>
              </div>
            );
          })()}
      </div>

      {/* Fee preview */}
      {feeConfig.feeBps > 0 &&
        feeConfig.wallets &&
        feeConfig.wallets.length > 0 && (
          <div className="bg-zinc-800 rounded-lg p-3 space-y-2">
            <div className="text-sm text-zinc-400">
              Fee Distribution Preview (on $100 bet)
            </div>
            <div className="text-sm text-white">
              Total fee:{" "}
              <span className="font-bold text-wild-gold">
                ${((100 * feeConfig.feeBps) / 10000).toFixed(2)}
              </span>
            </div>
            <div className="space-y-1">
              {feeConfig.wallets.map((wallet, i) => (
                <div
                  key={i}
                  className="flex justify-between text-xs text-zinc-400"
                >
                  <span>{wallet.label || `Wallet ${i + 1}`}</span>
                  <span className="font-mono">
                    $
                    {(
                      ((100 * feeConfig.feeBps) / 10000) *
                      (wallet.percentage / 100)
                    ).toFixed(4)}{" "}
                    ({wallet.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      <Button
        onClick={onSave}
        disabled={isSaving || !walletsValid}
        data-testid="button-save-fees"
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : null}
        Save Fee Settings
      </Button>
    </Card>
  );
}

// ===========================================================================
// Points Configuration Section
// ===========================================================================

function PointsSection({
  pointsConfig,
  setPointsConfig,
  onSave,
  isSaving,
}: {
  pointsConfig: PointsConfig;
  setPointsConfig: (cfg: PointsConfig) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-bold flex items-center gap-2 text-white">
          <Star className="w-5 h-5" />
          Points System Configuration
        </h3>
        <p className="text-sm text-zinc-500">
          Configure the points/rewards system
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-4">
        <div>
          <Label className="text-sm font-medium">Enable Points System</Label>
          <p className="text-xs text-zinc-500 mt-1">
            When disabled, points will be hidden throughout the app
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={pointsConfig.enabled}
            onChange={(e) =>
              setPointsConfig({
                ...pointsConfig,
                enabled: e.target.checked,
              })
            }
            className="sr-only peer"
            data-testid="toggle-points-enabled"
          />
          <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
        </label>
      </div>

      {/* Points name */}
      <div>
        <Label className="text-sm">Points Name</Label>
        <Input
          value={pointsConfig.name}
          onChange={(e) =>
            setPointsConfig({ ...pointsConfig, name: e.target.value })
          }
          placeholder="WILD"
          className="mt-1 font-mono"
          data-testid="input-points-name"
        />
        <p className="text-xs text-zinc-500 mt-1">
          The name displayed for points (e.g., "WILD", "Points", "Rewards")
        </p>
      </div>

      {/* Reset schedule */}
      <div>
        <Label className="text-sm">Reset Schedule</Label>
        <Select
          value={pointsConfig.resetSchedule}
          onValueChange={(value: PointsConfig["resetSchedule"]) =>
            setPointsConfig({ ...pointsConfig, resetSchedule: value })
          }
        >
          <SelectTrigger
            className="mt-1"
            data-testid="select-reset-schedule"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="never">Never reset</SelectItem>
            <SelectItem value="weekly">Reset weekly</SelectItem>
            <SelectItem value="monthly">Reset monthly</SelectItem>
            <SelectItem value="yearly">Reset yearly</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500 mt-1">
          When to reset user points to zero
        </p>
      </div>

      {/* Referral system */}
      <div className="border-t border-zinc-700 pt-4">
        <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-4 mb-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Enable Referral System
            </Label>
            <p className="text-xs text-zinc-500 mt-1">
              Allow users to earn points from referrals
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={pointsConfig.referralEnabled}
              onChange={(e) =>
                setPointsConfig({
                  ...pointsConfig,
                  referralEnabled: e.target.checked,
                })
              }
              className="sr-only peer"
              data-testid="toggle-referral-enabled"
            />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
          </label>
        </div>

        {pointsConfig.referralEnabled && (
          <div>
            <Label className="text-sm">Referral Percentage</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={pointsConfig.referralPercentage}
                onChange={(e) =>
                  setPointsConfig({
                    ...pointsConfig,
                    referralPercentage: parseInt(e.target.value) || 0,
                  })
                }
                className="font-mono w-24"
                data-testid="input-referral-percentage"
              />
              <span className="text-zinc-400">%</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Percentage of referred user's earned points that go to the
              referrer
            </p>
          </div>
        )}
      </div>

      <Button
        onClick={onSave}
        disabled={isSaving}
        data-testid="button-save-points"
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : null}
        Save Points Settings
      </Button>
    </Card>
  );
}

// ===========================================================================
// Wild Points Manager (wallet-level points view)
// ===========================================================================

interface WildWallet {
  address: string;
  safeAddress: string | null;
  storedWildPoints: number;
  calculatedWildPoints: number;
  orderCount: number;
  polymarketWildPoints: number;
  activityCount: number;
  source: string;
  createdAt: string;
}

function WildPointsManager() {
  const { data: wallets = [], isLoading } = useQuery<WildWallet[]>({
    queryKey: ["/api/admin/wild-points"],
  });

  const totalPoints = wallets.reduce(
    (sum, w) => sum + (w.polymarketWildPoints || w.calculatedWildPoints || 0),
    0,
  );
  const totalActivity = wallets.reduce(
    (sum, w) => sum + (w.activityCount || 0),
    0,
  );

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold">$WILD Points Management</h2>
        <div className="text-zinc-500">Loading wallets...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">$WILD Points Management</h2>
        <p className="text-sm text-zinc-500">
          Track WILD points for all users. 1 USDC spent = 1 WILD point. Data
          sourced from Polymarket Activity API.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Total Users
          </div>
          <div className="text-2xl font-bold font-mono">{wallets.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Total $WILD
          </div>
          <div className="text-2xl font-bold font-mono text-wild-gold">
            {totalPoints.toLocaleString()}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Total Activity
          </div>
          <div className="text-2xl font-bold font-mono">{totalActivity}</div>
        </Card>
      </div>

      {wallets.length === 0 ? (
        <Card className="p-8 text-center text-zinc-500">
          No users with wallet records yet.
        </Card>
      ) : (
        <Card className="divide-y divide-zinc-800">
          <div className="p-3 bg-zinc-900/50 grid grid-cols-12 gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <div className="col-span-3">EOA Wallet</div>
            <div className="col-span-3">Safe Wallet</div>
            <div className="col-span-2 text-right">$WILD</div>
            <div className="col-span-2 text-right">Activity</div>
            <div className="col-span-2 text-right">Joined</div>
          </div>
          {wallets.map((wallet, i) => {
            const wildPoints =
              wallet.polymarketWildPoints ||
              wallet.calculatedWildPoints ||
              0;
            return (
              <div
                key={wallet.address}
                className="p-3 grid grid-cols-12 gap-2 items-center"
                data-testid={`wild-wallet-${i}`}
              >
                <div
                  className="col-span-3 font-mono text-sm truncate"
                  title={wallet.address}
                >
                  {formatAddress(wallet.address)}
                </div>
                <div
                  className="col-span-3 font-mono text-sm truncate text-zinc-500"
                  title={wallet.safeAddress || ""}
                >
                  {wallet.safeAddress
                    ? formatAddress(wallet.safeAddress)
                    : "-"}
                </div>
                <div className="col-span-2 text-right font-mono font-bold text-wild-gold">
                  {wildPoints.toLocaleString()}
                </div>
                <div className="col-span-2 text-right font-mono text-zinc-400">
                  {wallet.activityCount || 0}
                </div>
                <div className="col-span-2 text-right text-xs text-zinc-500">
                  {formatDate(wallet.createdAt)}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <p className="text-xs text-zinc-600">
        WILD points calculated from Polymarket Activity API. Sum of all BUY
        trades (USDC spent) = WILD earned.
      </p>
    </div>
  );
}

// ===========================================================================
// Sport Config Editor
// ===========================================================================

interface EnhancedSampleData {
  event: {
    id: string;
    title: string;
    slug?: string;
    description: string;
    startDate: string;
    endDate?: string;
    seriesSlug?: string;
  } | null;
  market: {
    id: string;
    conditionId?: string;
    slug?: string;
    question: string;
    groupItemTitle: string;
    sportsMarketType: string;
    subtitle?: string;
    extraInfo?: string;
    participantName?: string;
    teamAbbrev?: string;
    line?: number;
    outcomes: string;
    outcomePrices: string;
    bestAsk?: number;
    bestBid?: number;
    volume?: string;
    liquidity?: string;
    gameStartTime?: string;
    tokens?: unknown;
    spread?: number;
    active?: boolean;
    closed?: boolean;
    clobTokenIds?: string;
  } | null;
  rawMarket?: Record<string, unknown>;
  allMarketTypes: string[];
  availableMarketTypes?: string[];
  eventsSearched?: number;
  message?: string;
}

function SportConfigEditor({
  sportsData,
  toast,
}: {
  sportsData: SportWithMarketTypes[];
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [selectedSport, setSelectedSport] = useState<string>("");
  const [selectedMarketType, setSelectedMarketType] = useState<string>("");
  const [availableMarketTypes, setAvailableMarketTypes] = useState<
    {
      type: string;
      label: string;
      count: number;
      sampleQuestion: string;
    }[]
  >([]);
  const [sampleData, setSampleData] = useState<EnhancedSampleData | null>(
    null,
  );
  const [loadingMarketTypes, setLoadingMarketTypes] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [eventsScanned, setEventsScanned] = useState(0);

  const [formData, setFormData] = useState({
    titleField: "groupItemTitle",
    buttonLabelField: "outcomes",
    betSlipTitleField: "question",
    useQuestionForTitle: false,
    showLine: false,
    lineFieldPath: "line",
    lineFormatter: "default",
    outcomeStrategy: { type: "default" } as {
      type: string;
      fallback?: string;
      regex?: string;
      template?: string;
    },
    notes: "",
  });

  const { data: configs = [] } = useQuery<SportMarketConfig[]>({
    queryKey: ["/api/admin/sport-market-configs"],
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data: {
      sportSlug: string;
      sportLabel: string;
      marketType: string;
      marketTypeLabel?: string;
      titleField: string;
      buttonLabelField: string;
      betSlipTitleField: string;
      useQuestionForTitle: boolean;
      showLine: boolean;
      lineFieldPath?: string;
      lineFormatter?: string;
      outcomeStrategy?: {
        type: string;
        fallback?: string;
        regex?: string;
        template?: string;
      };
      sampleData?: Record<string, unknown>;
      notes?: string;
    }) => {
      return apiRequest("POST", "/api/admin/sport-market-configs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/sport-market-configs"],
      });
      toast({ title: "Configuration saved" });
    },
    onError: () => {
      toast({ title: "Failed to save config", variant: "destructive" });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async ({
      sportSlug,
      marketType,
    }: {
      sportSlug: string;
      marketType: string;
    }) => {
      return apiRequest(
        "DELETE",
        `/api/admin/sport-market-configs/${sportSlug}/${marketType}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/sport-market-configs"],
      });
      toast({ title: "Config deleted" });
    },
  });

  const handleSelectSport = async (sportId: string) => {
    setSelectedSport(sportId);
    setSelectedMarketType("");
    setSampleData(null);
    setAvailableMarketTypes([]);

    const sport = sportsData.find((s) => s.id === sportId);
    if (!sport) return;

    setLoadingMarketTypes(true);
    try {
      const response = await fetch(
        `/api/admin/sport-market-types/${sport.seriesId}`,
      );
      const data = await response.json();
      setAvailableMarketTypes(data.marketTypes || []);
      setEventsScanned(data.eventsScanned || 0);
    } catch (error) {
      console.error("Failed to fetch market types:", error);
      setAvailableMarketTypes([]);
      setEventsScanned(0);
    } finally {
      setLoadingMarketTypes(false);
    }
  };

  const handleSelectMarketType = async (marketType: string) => {
    setSelectedMarketType(marketType);

    const sport = sportsData.find((s) => s.id === selectedSport);
    if (!sport) return;

    const existingConfig = configs.find(
      (c) => c.sportSlug === sport.slug && c.marketType === marketType,
    );

    if (existingConfig) {
      setFormData({
        titleField: existingConfig.titleField,
        buttonLabelField: existingConfig.buttonLabelField,
        betSlipTitleField: existingConfig.betSlipTitleField,
        useQuestionForTitle: existingConfig.useQuestionForTitle,
        showLine: existingConfig.showLine,
        lineFieldPath: existingConfig.lineFieldPath || "line",
        lineFormatter: existingConfig.lineFormatter || "default",
        outcomeStrategy: existingConfig.outcomeStrategy || {
          type: "default",
        },
        notes: existingConfig.notes || "",
      });
    } else {
      const isSpreads =
        marketType.includes("spread") || marketType.includes("handicap");
      const isTotals =
        marketType.includes("total") || marketType.includes("over_under");
      setFormData({
        titleField: "groupItemTitle",
        buttonLabelField: "outcomes",
        betSlipTitleField: "question",
        useQuestionForTitle: false,
        showLine: isSpreads || isTotals,
        lineFieldPath: "line",
        lineFormatter: isSpreads
          ? "spread"
          : isTotals
            ? "total"
            : "default",
        outcomeStrategy: { type: "default" },
        notes: "",
      });
    }

    setLoadingSample(true);
    try {
      const response = await fetch(
        `/api/admin/sport-sample-v2/${sport.seriesId}/${marketType}`,
      );
      const data = await response.json();
      setSampleData(data);
    } catch (error) {
      console.error("Failed to fetch sample data:", error);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleSave = () => {
    const sport = sportsData.find((s) => s.id === selectedSport);
    if (!sport || !selectedMarketType) return;

    saveConfigMutation.mutate({
      sportSlug: sport.slug,
      sportLabel: sport.label,
      marketType: selectedMarketType,
      marketTypeLabel: selectedMarketType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      ...formData,
      sampleData: sampleData?.market as Record<string, unknown> | undefined,
    });
  };

  const availableFields = [
    { value: "question", label: "question - Full question text" },
    {
      value: "groupItemTitle",
      label: "groupItemTitle - Short market title",
    },
    {
      value: "sportsMarketType",
      label: "sportsMarketType - Market type label",
    },
    { value: "outcomes", label: "outcomes - Outcome labels" },
    { value: "subtitle", label: "subtitle - Additional context" },
    { value: "extraInfo", label: "extraInfo - Extra market info" },
  ];

  const outcomeStrategies = [
    { value: "default", label: "Default - Use raw outcome labels" },
    {
      value: "team_abbrev",
      label: "Team Abbreviation - Parse team abbreviations",
    },
    { value: "yes_no", label: "Yes/No - Binary outcome mapping" },
    { value: "over_under", label: "Over/Under - O/U with line" },
    { value: "spread", label: "Spread - +/- with line" },
    { value: "regex", label: "Regex - Custom pattern extraction" },
  ];

  const lineFormatters = [
    { value: "default", label: "Default - Show as-is" },
    { value: "spread", label: "Spread - Show as +X.X or -X.X" },
    { value: "total", label: "Total - Show as O/U X.X" },
    { value: "none", label: "None - Hide line" },
  ];

  const getFieldPreview = (fieldName: string) => {
    if (!sampleData?.market) return "N/A";
    const market = sampleData.market as Record<string, unknown>;
    const value = market[fieldName];
    if (value === null || value === undefined) return "null";
    if (typeof value === "string")
      return value.length > 50 ? value.slice(0, 50) + "..." : value;
    return String(value);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">
          Sport + Market Type Configuration
        </h2>
        <p className="text-sm text-zinc-500">
          Configure display settings for each sport and bet type combination
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>1. Select Sport</Label>
            <Select value={selectedSport} onValueChange={handleSelectSport}>
              <SelectTrigger data-testid="select-sport-config">
                <SelectValue placeholder="Choose a sport..." />
              </SelectTrigger>
              <SelectContent>
                {sportsData.map((sport) => {
                  const configCount = configs.filter(
                    (c) => c.sportSlug === sport.slug,
                  ).length;
                  return (
                    <SelectItem key={sport.id} value={sport.id}>
                      {sport.label}
                      {configCount > 0 && ` (${configCount} configs)`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>2. Select Market Type</Label>
            <Select
              value={selectedMarketType}
              onValueChange={handleSelectMarketType}
              disabled={
                !selectedSport ||
                loadingMarketTypes ||
                availableMarketTypes.length === 0
              }
            >
              <SelectTrigger data-testid="select-market-type">
                <SelectValue
                  placeholder={
                    loadingMarketTypes
                      ? "Loading market types..."
                      : "Choose bet type..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableMarketTypes.map((mt) => {
                  const sport = sportsData.find(
                    (s) => s.id === selectedSport,
                  );
                  const hasConfig =
                    sport &&
                    configs.some(
                      (c) =>
                        c.sportSlug === sport.slug &&
                        c.marketType === mt.type,
                    );
                  return (
                    <SelectItem key={mt.type} value={mt.type}>
                      {mt.label} ({mt.count})
                      {hasConfig ? " - configured" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {eventsScanned > 0 && (
              <p className="text-xs text-zinc-500">
                Found {availableMarketTypes.length} market types from{" "}
                {eventsScanned} events
              </p>
            )}
          </div>
        </div>

        {selectedSport && selectedMarketType && (
          <>
            <div className="border-t border-zinc-800 pt-4">
              <h3 className="font-medium text-zinc-300 mb-3">
                Field Mappings
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Market Title Field</Label>
                  <Select
                    value={formData.titleField}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        titleField: v,
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-title-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-zinc-500 truncate">
                    Preview: {getFieldPreview(formData.titleField)}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Button Labels Field</Label>
                  <Select
                    value={formData.buttonLabelField}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        buttonLabelField: v,
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-button-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bet Slip Title</Label>
                  <Select
                    value={formData.betSlipTitleField}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        betSlipTitleField: v,
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-betslip-field">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <h3 className="font-medium text-zinc-300 mb-3">
                Line & Outcome Display
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Show Line Number</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={formData.showLine}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          showLine: checked as boolean,
                        }))
                      }
                      data-testid="checkbox-show-line"
                    />
                    <span className="text-sm text-zinc-400">
                      Display line (e.g., 246.5, +12.5)
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Line Formatter</Label>
                  <Select
                    value={formData.lineFormatter}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        lineFormatter: v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lineFormatters.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Outcome Strategy</Label>
                  <Select
                    value={formData.outcomeStrategy.type}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        outcomeStrategy: {
                          ...prev.outcomeStrategy,
                          type: v,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {outcomeStrategies.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Checkbox
                  checked={formData.useQuestionForTitle}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      useQuestionForTitle: checked as boolean,
                    }))
                  }
                  data-testid="checkbox-use-question"
                />
                <span className="text-sm text-zinc-400">
                  Use question field for market title (overrides title field
                  selection)
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                placeholder="Add notes about this configuration..."
                data-testid="input-notes"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saveConfigMutation.isPending}
              className="w-full"
              data-testid="button-save-config"
            >
              {saveConfigMutation.isPending
                ? "Saving..."
                : `Save ${selectedMarketType.replace(/_/g, " ")} Configuration`}
            </Button>
          </>
        )}
      </Card>

      {selectedSport && sampleData?.market && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-zinc-300">Sample API Data</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRawJson(!showRawJson)}
            >
              {showRawJson ? "Hide Raw JSON" : "Show Raw JSON"}
            </Button>
          </div>

          {showRawJson ? (
            <div className="p-3 bg-zinc-900 rounded text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
              <pre>
                {JSON.stringify(
                  sampleData.rawMarket || sampleData.market,
                  null,
                  2,
                )}
              </pre>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(sampleData.market).map(([key, value]) => (
                  <div key={key} className="p-2 bg-zinc-900 rounded">
                    <span className="text-blue-400 font-mono">{key}:</span>{" "}
                    <span className="text-green-400">
                      {typeof value === "object"
                        ? JSON.stringify(value).slice(0, 60) + "..."
                        : String(value).slice(0, 60)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-zinc-500">
            <strong>All market types for this sport:</strong>{" "}
            {availableMarketTypes.map((mt) => mt.label).join(", ") ||
              "None found"}
          </div>
          {sampleData?.eventsSearched && (
            <div className="text-xs text-zinc-400">
              Sample from searching {sampleData.eventsSearched} events
            </div>
          )}
        </Card>
      )}

      {configs.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold text-zinc-300">
            Saved Configurations ({configs.length})
          </h3>
          <div className="space-y-2">
            {configs.map((config) => (
              <div
                key={config.id}
                className="p-3 bg-zinc-900 rounded flex justify-between items-start gap-2"
                data-testid={`config-${config.sportSlug}-${config.marketType}`}
              >
                <div className="text-sm min-w-0 flex-1">
                  <div className="font-medium text-white">
                    {config.sportLabel} -{" "}
                    {config.marketType.replace(/_/g, " ")}
                  </div>
                  <div className="text-zinc-500 text-xs space-y-0.5">
                    <div>
                      Title: {config.titleField} | Buttons:{" "}
                      {config.buttonLabelField}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {config.showLine && (
                        <span className="text-wild-trade">Shows line</span>
                      )}
                      {config.useQuestionForTitle && (
                        <span className="text-wild-brand">
                          Uses question
                        </span>
                      )}
                      {config.outcomeStrategy && (
                        <span className="text-wild-scout">
                          Strategy:{" "}
                          {
                            (config.outcomeStrategy as { type: string })
                              .type
                          }
                        </span>
                      )}
                    </div>
                    {config.notes && (
                      <div className="text-zinc-600 italic truncate">
                        {config.notes}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() =>
                    deleteConfigMutation.mutate({
                      sportSlug: config.sportSlug,
                      marketType: config.marketType,
                    })
                  }
                  disabled={deleteConfigMutation.isPending}
                  data-testid={`delete-config-${config.sportSlug}-${config.marketType}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ===========================================================================
// Tab type (all sections)
// ===========================================================================

type AdminTab =
  | "tags"
  | "matchday"
  | "futures"
  | "players"
  | "wild"
  | "points"
  | "fees"
  | "sportconfig";

// ===========================================================================
// Main Admin Page with Auth Wrapper
// ===========================================================================

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Check stored auth on mount
  useEffect(() => {
    const stored = localStorage.getItem("adminSecret");
    if (!stored) {
      setIsChecking(false);
      return;
    }

    fetch("/api/admin/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stored}`,
        "Content-Type": "application/json",
      },
    })
      .then((res) => {
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("adminSecret");
        }
      })
      .catch(() => {
        localStorage.removeItem("adminSecret");
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, []);

  // Loading auth check
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Show password prompt
  if (!isAuthenticated) {
    return (
      <AdminPasswordPrompt
        onAuthenticated={() => setIsAuthenticated(true)}
      />
    );
  }

  // Render the actual admin panel once authenticated
  return <AuthenticatedAdminPanel onLogout={() => {
    localStorage.removeItem("adminSecret");
    setIsAuthenticated(false);
  }} />;
}

// ===========================================================================
// Authenticated Admin Panel (all tabs)
// ===========================================================================

function AuthenticatedAdminPanel({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<AdminTab>("tags");

  // --- Sports/leagues state ---
  const [sportsData, setSportsData] = useState<SportWithMarketTypes[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [expandedSports, setExpandedSports] = useState<Set<string>>(
    new Set(),
  );

  // --- Player form state ---
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const playerForm = useForm<PlayerFormData>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: {
      name: "",
      symbol: "",
      team: "",
      sport: "Basketball",
      fundingTarget: 100000,
      fundingCurrent: 0,
      status: "offering",
    },
  });

  // --- Futures state ---
  const [futuresSlug, setFuturesSlug] = useState("");
  const [fetchingEvent, setFetchingEvent] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");

  // --- White-label config state (points + fees) ---
  const [wlLoading, setWlLoading] = useState(true);
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({ feeBps: 0 });
  const [pointsConfig, setPointsConfig] = useState<PointsConfig>({
    enabled: false,
    name: "WILD",
    resetSchedule: "never",
    referralEnabled: false,
    referralPercentage: 10,
  });
  const [savingFees, setSavingFees] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // --- Queries ---
  const { data: markets = [], isLoading: marketsLoading } = useQuery<
    Market[]
  >({
    queryKey: ["/api/markets"],
  });

  const { data: players = [], isLoading: playersLoading } = useQuery<
    Player[]
  >({
    queryKey: ["/api/players"],
  });

  const { data: futuresList = [], isLoading: futuresLoading } = useQuery<
    Futures[]
  >({
    queryKey: ["/api/futures"],
  });

  const { data: adminSettings } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: polymarketTags = [], isLoading: tagsLoading } = useQuery<
    PolymarketTagRecord[]
  >({
    queryKey: ["/api/admin/tags"],
  });

  const { data: futuresCategories = [], isLoading: categoriesLoading } =
    useQuery<FuturesCategory[]>({
      queryKey: ["/api/futures-categories"],
    });

  // --- Load white-label config ---
  useEffect(() => {
    setWlLoading(true);
    adminFetch("/api/admin/white-label")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load config");
        const data: WhiteLabelConfig = await res.json();
        if (data.feeConfig) setFeeConfig(data.feeConfig);
        if (data.pointsConfig) setPointsConfig(data.pointsConfig);
      })
      .catch((err) => {
        console.error("[Admin] Failed to load config:", err);
      })
      .finally(() => {
        setWlLoading(false);
      });
  }, []);

  // --- Load sports when Match Day tab activated ---
  const loadSportsLeagues = async () => {
    setLoadingLeagues(true);
    try {
      const sports = await fetchSportsWithMarketTypes();
      setSportsData(sports);
    } catch {
      toast({
        title: "Failed to load sports tags",
        variant: "destructive",
      });
    } finally {
      setLoadingLeagues(false);
    }
  };

  useEffect(() => {
    if (
      (activeSection === "matchday" || activeSection === "sportconfig") &&
      sportsData.length === 0
    ) {
      loadSportsLeagues();
    }
  }, [activeSection]);

  // --- Mutations ---
  const syncTagsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/tags/sync", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/tags/enabled"],
      });
      toast({ title: "Tags extracted from current events" });
    },
    onError: () => {
      toast({ title: "Failed to sync tags", variant: "destructive" });
    },
  });

  const toggleTagMutation = useMutation({
    mutationFn: async ({
      id,
      enabled,
    }: {
      id: string;
      enabled: boolean;
    }) => {
      return apiRequest("PATCH", `/api/admin/tags/${id}/enabled`, {
        enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/tags/enabled"],
      });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AdminSettings>) => {
      return apiRequest("PATCH", "/api/admin/settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/settings"],
      });
      toast({ title: "Settings saved" });
    },
  });

  const createFuturesMutation = useMutation({
    mutationFn: async (future: {
      polymarketSlug: string;
      polymarketEventId?: string;
      title: string;
      description?: string;
      imageUrl?: string;
      startDate?: string;
      endDate?: string;
      marketData?: {
        question: string;
        outcomes: Array<{
          label: string;
          probability: number;
          odds: number;
          marketId?: string;
          conditionId?: string;
        }>;
        volume: number;
        liquidity: number;
        conditionId: string;
      };
    }) => {
      return apiRequest("POST", "/api/futures", future);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/futures"] });
      toast({ title: "Future event added" });
      setFuturesSlug("");
    },
    onError: () => {
      toast({
        title: "Failed to add futures event",
        variant: "destructive",
      });
    },
  });

  const deleteFuturesMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/futures/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/futures"] });
      toast({ title: "Future event removed" });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const slug = name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      return apiRequest("POST", "/api/futures-categories", {
        name,
        slug,
        sortOrder: futuresCategories.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/futures-categories"],
      });
      setNewCategoryName("");
      toast({ title: "Category created" });
    },
    onError: () => {
      toast({
        title: "Failed to create category",
        variant: "destructive",
      });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const slug = name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      return apiRequest("PATCH", `/api/futures-categories/${id}`, {
        name,
        slug,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/futures-categories"],
      });
      setEditingCategoryId(null);
      setEditingCategoryName("");
      toast({ title: "Category updated" });
    },
    onError: () => {
      toast({
        title: "Failed to update category",
        variant: "destructive",
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/futures-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/futures-categories"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/futures"] });
      toast({ title: "Category deleted" });
    },
    onError: () => {
      toast({
        title: "Failed to delete category",
        variant: "destructive",
      });
    },
  });

  const updateFuturesCategoryMutation = useMutation({
    mutationFn: async ({
      futuresId,
      categoryId,
    }: {
      futuresId: string;
      categoryId: number | null;
    }) => {
      return apiRequest("PATCH", `/api/futures/${futuresId}/category`, {
        categoryId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/futures"] });
    },
  });

  const createPlayerMutation = useMutation({
    mutationFn: async (player: InsertPlayer) => {
      return apiRequest("POST", "/api/players", player);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Player created successfully" });
      setShowPlayerForm(false);
      playerForm.reset();
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/players/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Player deleted" });
    },
  });

  // --- Handlers ---

  const handleMarketTypeToggle = (tagId: string, checked: boolean) => {
    const currentTags = adminSettings?.activeTagIds || [];
    if (checked) {
      const newTags = Array.from(new Set([...currentTags, tagId]));
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    } else {
      const newTags = currentTags.filter((id) => id !== tagId);
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    }
  };

  const handleSportToggleAll = (
    sport: SportWithMarketTypes,
    checked: boolean,
  ) => {
    const currentTags = adminSettings?.activeTagIds || [];
    const sportMarketTypeIds = sport.marketTypes.map((mt) => mt.id);
    if (checked) {
      const newTags = Array.from(
        new Set([...currentTags, ...sportMarketTypeIds]),
      );
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    } else {
      const newTags = currentTags.filter(
        (id) => !sportMarketTypeIds.includes(id),
      );
      updateSettingsMutation.mutate({ activeTagIds: newTags });
    }
  };

  const isSportPartiallySelected = (sport: SportWithMarketTypes) => {
    const currentTags = adminSettings?.activeTagIds || [];
    return sport.marketTypes.some((mt) => currentTags.includes(mt.id));
  };

  const isSportFullySelected = (sport: SportWithMarketTypes) => {
    const currentTags = adminSettings?.activeTagIds || [];
    return sport.marketTypes.every((mt) => currentTags.includes(mt.id));
  };

  const toggleSportExpansion = (sportId: string) => {
    setExpandedSports((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sportId)) {
        newSet.delete(sportId);
      } else {
        newSet.add(sportId);
      }
      return newSet;
    });
  };

  const getActiveSportsInfo = () => {
    const currentTags = adminSettings?.activeTagIds || [];
    const activeSports: {
      sport: SportWithMarketTypes;
      marketTypes: string[];
    }[] = [];
    for (const sport of sportsData) {
      const activeMarketTypes = sport.marketTypes
        .filter((mt) => currentTags.includes(mt.id))
        .map((mt) => mt.label);
      if (activeMarketTypes.length > 0) {
        activeSports.push({ sport, marketTypes: activeMarketTypes });
      }
    }
    return activeSports;
  };

  const handleAddFutures = async () => {
    if (!futuresSlug.trim()) {
      toast({
        title: "Please enter a Polymarket event slug or URL",
        variant: "destructive",
      });
      return;
    }

    setFetchingEvent(true);
    try {
      const slug = extractSlugFromInput(futuresSlug);
      const response = await fetch(
        `/api/polymarket/event-by-slug?slug=${encodeURIComponent(slug)}`,
      );

      if (!response.ok) {
        toast({
          title: "Event not found on Polymarket",
          variant: "destructive",
        });
        return;
      }

      const result = await response.json();
      const eventData = result.data;

      if (result.type === "event") {
        const markets = eventData.markets || [];
        let marketData = undefined;

        if (markets.length > 0) {
          try {
            const allOutcomes: Array<{
              label: string;
              probability: number;
              odds: number;
              marketId?: string;
              conditionId?: string;
            }> = [];
            let totalVolume = 0;
            let totalLiquidity = 0;

            for (const market of markets) {
              const prices = JSON.parse(market.outcomePrices || "[]");
              const outcomes = JSON.parse(market.outcomes || "[]");
              totalVolume += parseFloat(market.volume || "0");
              totalLiquidity += parseFloat(market.liquidity || "0");

              outcomes.forEach((outcomeName: string, i: number) => {
                const prob = parseFloat(prices[i] || "0");
                if (
                  outcomeName.toLowerCase() === "yes" ||
                  markets.length === 1
                ) {
                  let displayLabel = outcomeName;
                  if (markets.length > 1) {
                    if (market.groupItemTitle) {
                      displayLabel = market.groupItemTitle;
                    } else {
                      displayLabel =
                        market.question
                          ?.replace(/^Will /i, "")
                          .replace(
                            / (finish|win|be|make|qualify|reach|place|get|score|have|become).*$/i,
                            "",
                          )
                          ?.trim() || outcomeName;
                    }
                  }
                  allOutcomes.push({
                    label: displayLabel,
                    probability: prob,
                    odds:
                      prob > 0
                        ? Math.round((1 / prob) * 100) / 100
                        : 99,
                    marketId: market.id,
                    conditionId: market.conditionId,
                  });
                }
              });
            }

            allOutcomes.sort((a, b) => b.probability - a.probability);

            marketData = {
              question: eventData.title,
              outcomes: allOutcomes,
              volume: totalVolume,
              liquidity: totalLiquidity,
              conditionId: markets[0]?.conditionId || "",
            };
          } catch (e) {
            console.error("Failed to parse market data:", e);
          }
        }

        await createFuturesMutation.mutateAsync({
          polymarketSlug: slug,
          polymarketEventId: eventData.id,
          title: eventData.title,
          description: eventData.description,
          imageUrl: eventData.image,
          startDate: eventData.startDate,
          endDate: eventData.endDate,
          marketData,
        });
      } else if (result.type === "market") {
        let marketData = undefined;
        try {
          const prices = JSON.parse(eventData.outcomePrices || "[]");
          const outcomes = JSON.parse(eventData.outcomes || "[]");
          marketData = {
            question: eventData.question,
            outcomes: outcomes.map((label: string, i: number) => {
              const prob = parseFloat(prices[i] || "0");
              return {
                label,
                probability: prob,
                odds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 99,
              };
            }),
            volume: parseFloat(eventData.volume || "0"),
            liquidity: parseFloat(eventData.liquidity || "0"),
            conditionId: eventData.conditionId || "",
          };
        } catch (e) {
          console.error("Failed to parse market data:", e);
        }

        await createFuturesMutation.mutateAsync({
          polymarketSlug: slug,
          polymarketEventId: eventData.id,
          title: eventData.question || slug,
          description: eventData.description,
          marketData,
        });
      }
    } catch (error) {
      console.error("Error adding futures:", error);
      toast({
        title: "Failed to fetch event details",
        variant: "destructive",
      });
    } finally {
      setFetchingEvent(false);
    }
  };

  const onSubmitPlayer = (data: PlayerFormData) => {
    const fundingPercentage = Math.round(
      (data.fundingCurrent / data.fundingTarget) * 100,
    );
    const avatarInitials = data.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const newPlayer: InsertPlayer = {
      name: data.name,
      symbol: data.symbol.toUpperCase(),
      team: data.team,
      sport: data.sport,
      avatarInitials,
      fundingTarget: data.fundingTarget,
      fundingCurrent: data.fundingCurrent,
      fundingPercentage,
      generation: 1,
      status: data.status,
      stats:
        data.status === "available"
          ? {
              holders: Math.floor(Math.random() * 500) + 50,
              marketCap: data.fundingTarget,
              change24h: 0,
            }
          : undefined,
    };
    createPlayerMutation.mutate(newPlayer);
  };

  const showStatus = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSaveFees = async () => {
    setSavingFees(true);
    try {
      const res = await adminFetch("/api/admin/white-label/fees", {
        method: "PATCH",
        body: JSON.stringify(feeConfig),
      });
      if (res.ok) {
        showStatus("success", "Fee settings saved");
      } else {
        showStatus("error", "Failed to save fee settings");
      }
    } catch {
      showStatus("error", "Failed to save fee settings");
    } finally {
      setSavingFees(false);
    }
  };

  const handleSavePoints = async () => {
    setSavingPoints(true);
    try {
      const res = await adminFetch("/api/admin/white-label/points", {
        method: "PATCH",
        body: JSON.stringify(pointsConfig),
      });
      if (res.ok) {
        showStatus("success", "Points settings saved");
      } else {
        showStatus("error", "Failed to save points settings");
      }
    } catch {
      showStatus("error", "Failed to save points settings");
    } finally {
      setSavingPoints(false);
    }
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-black flex-1">Admin CMS</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-zinc-400 hover:text-white"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Status message */}
        {statusMessage && (
          <div
            className={`rounded-lg p-3 text-sm mb-4 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-red-500/10 text-red-400 border border-red-500/30"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            variant={activeSection === "tags" ? "default" : "secondary"}
            onClick={() => setActiveSection("tags")}
            data-testid="button-section-tags"
          >
            Tags (
            {polymarketTags.filter((t) => t.enabled).length})
          </Button>
          <Button
            variant={activeSection === "matchday" ? "default" : "secondary"}
            onClick={() => setActiveSection("matchday")}
            data-testid="button-section-matchday"
          >
            Match Day
          </Button>
          <Button
            variant={activeSection === "futures" ? "default" : "secondary"}
            onClick={() => setActiveSection("futures")}
            data-testid="button-section-futures"
          >
            Futures ({futuresList.length})
          </Button>
          <Button
            variant={activeSection === "players" ? "default" : "secondary"}
            onClick={() => setActiveSection("players")}
            data-testid="button-section-players"
          >
            Players ({players.length})
          </Button>
          <Button
            variant={activeSection === "wild" ? "default" : "secondary"}
            onClick={() => setActiveSection("wild")}
            data-testid="button-section-wild"
          >
            $WILD Points
          </Button>
          <Button
            variant={activeSection === "points" ? "default" : "secondary"}
            onClick={() => setActiveSection("points")}
            data-testid="button-section-points"
          >
            <Star className="w-4 h-4 mr-1" />
            Points Config
          </Button>
          <Button
            variant={activeSection === "fees" ? "default" : "secondary"}
            onClick={() => setActiveSection("fees")}
            data-testid="button-section-fees"
          >
            <DollarSign className="w-4 h-4 mr-1" />
            Fees
          </Button>
          <Button
            variant={
              activeSection === "sportconfig" ? "default" : "secondary"
            }
            onClick={() => setActiveSection("sportconfig")}
            data-testid="button-section-sportconfig"
          >
            <Settings2 className="w-4 h-4 mr-1" />
            Sport Config
          </Button>
        </div>

        {/* ============================================================= */}
        {/* TAGS */}
        {/* ============================================================= */}
        {activeSection === "tags" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold">Tag Management</h2>
                <p className="text-sm text-zinc-500">
                  Enable sports tags to show in both Match Day and Futures
                  views
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => syncTagsMutation.mutate()}
                disabled={syncTagsMutation.isPending}
                data-testid="button-sync-tags"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${syncTagsMutation.isPending ? "animate-spin" : ""}`}
                />
                Sync Tags from Events
              </Button>
            </div>

            {tagsLoading ? (
              <div className="text-zinc-500">Loading tags...</div>
            ) : polymarketTags.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No tags found. Click "Sync Tags from Events" to extract
                tags from your current events.
              </Card>
            ) : (
              <div className="space-y-2">
                {polymarketTags
                  .filter((tag) => tag.category === "league")
                  .sort(
                    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0),
                  )
                  .map((tag) => (
                    <Card
                      key={tag.id}
                      className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                        tag.enabled
                          ? "bg-wild-brand/10 border-wild-brand/30"
                          : ""
                      }`}
                      onClick={() =>
                        toggleTagMutation.mutate({
                          id: tag.id,
                          enabled: !tag.enabled,
                        })
                      }
                      data-testid={`tag-${tag.slug}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={tag.enabled}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(checked) =>
                            toggleTagMutation.mutate({
                              id: tag.id,
                              enabled: checked as boolean,
                            })
                          }
                        />
                        <div>
                          <div className="text-white font-medium">
                            {tag.label}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {tag.slug} - {tag.eventCount || 0} events
                          </div>
                        </div>
                      </div>
                      {tag.enabled && (
                        <Check className="w-4 h-4 text-wild-brand" />
                      )}
                    </Card>
                  ))}
              </div>
            )}

            {polymarketTags.filter((t) => t.enabled).length > 0 && (
              <div className="mt-4 p-4 bg-zinc-900 rounded-md">
                <div className="text-sm text-zinc-400 mb-2">
                  Enabled Tags - Events will be fetched for:
                </div>
                <div className="flex flex-wrap gap-2">
                  {polymarketTags
                    .filter((t) => t.enabled)
                    .map((tag) => (
                      <span
                        key={tag.id}
                        className="px-2 py-1 bg-wild-brand/20 text-wild-brand rounded text-xs"
                      >
                        {tag.label}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* MATCH DAY */}
        {/* ============================================================= */}
        {activeSection === "matchday" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold">
                  Match Day - Sports Leagues
                </h2>
                <p className="text-sm text-zinc-500">
                  Select leagues and bet types to show in the Predict tab
                </p>
              </div>
              <Button
                variant="outline"
                onClick={loadSportsLeagues}
                disabled={loadingLeagues}
                data-testid="button-refresh-leagues"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${loadingLeagues ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            {loadingLeagues ? (
              <div className="text-zinc-500">
                Loading sports from Polymarket...
              </div>
            ) : sportsData.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No sports found. Click "Refresh" to load from Polymarket.
              </Card>
            ) : (
              <div className="space-y-2">
                {sportsData.map((sport) => {
                  const isExpanded = expandedSports.has(sport.id);
                  const isPartial = isSportPartiallySelected(sport);
                  const isFull = isSportFullySelected(sport);

                  return (
                    <Card key={sport.id} className="overflow-hidden">
                      <div
                        className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                          isPartial ? "bg-wild-brand/5" : ""
                        }`}
                        onClick={() => toggleSportExpansion(sport.id)}
                        data-testid={`sport-${sport.slug}`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isFull}
                            className={
                              isPartial && !isFull
                                ? "data-[state=checked]:bg-wild-brand/50"
                                : ""
                            }
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={(checked) =>
                              handleSportToggleAll(
                                sport,
                                checked as boolean,
                              )
                            }
                            data-testid={`checkbox-sport-${sport.slug}`}
                          />
                          {sport.image && (
                            <img
                              src={sport.image}
                              alt={sport.label}
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="text-white font-medium">
                              {sport.label}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {isPartial ? (
                                <span className="text-wild-brand">
                                  {
                                    sport.marketTypes.filter((mt) =>
                                      adminSettings?.activeTagIds?.includes(
                                        mt.id,
                                      ),
                                    ).length
                                  }{" "}
                                  of {sport.marketTypes.length} bet types
                                </span>
                              ) : (
                                `${sport.marketTypes.length} bet types available`
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPartial && (
                            <Check className="w-4 h-4 text-wild-brand" />
                          )}
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                          {sport.marketTypes.map((mt) => {
                            const isActive =
                              adminSettings?.activeTagIds?.includes(
                                mt.id,
                              );
                            return (
                              <div
                                key={mt.id}
                                className={`p-2 rounded flex items-center gap-3 cursor-pointer transition-colors ${
                                  isActive
                                    ? "bg-wild-brand/10"
                                    : "hover:bg-zinc-800"
                                }`}
                                onClick={() =>
                                  handleMarketTypeToggle(
                                    mt.id,
                                    !isActive,
                                  )
                                }
                                data-testid={`market-type-${mt.id}`}
                              >
                                <Checkbox
                                  checked={isActive}
                                  onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={(checked) =>
                                    handleMarketTypeToggle(
                                      mt.id,
                                      checked as boolean,
                                    )
                                  }
                                />
                                <div>
                                  <div className="text-sm text-white">
                                    {mt.label}
                                  </div>
                                  <div className="text-xs text-zinc-500">
                                    {mt.type}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {getActiveSportsInfo().length > 0 && (
              <div className="mt-4 p-4 bg-zinc-900 rounded-md">
                <div className="text-sm text-zinc-400 mb-2">
                  Active Selections - Games will auto-populate:
                </div>
                <div className="space-y-2">
                  {getActiveSportsInfo().map(({ sport, marketTypes }) => (
                    <div
                      key={sport.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="font-medium text-white">
                        {sport.label}:
                      </span>
                      {marketTypes.map((mtLabel) => (
                        <span
                          key={mtLabel}
                          className="px-2 py-1 bg-wild-brand/20 text-wild-brand rounded text-xs"
                        >
                          {mtLabel}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* FUTURES */}
        {/* ============================================================= */}
        {activeSection === "futures" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold">
                Futures - Long-term Events
              </h2>
              <p className="text-sm text-zinc-500">
                Add Polymarket events by slug or URL for long-term betting
              </p>
            </div>

            <Card className="p-4 space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Paste Polymarket event URL or slug (e.g., super-bowl-winner-2026)"
                    value={futuresSlug}
                    onChange={(e) => setFuturesSlug(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAddFutures()
                    }
                    data-testid="input-futures-slug"
                  />
                </div>
                <Button
                  onClick={handleAddFutures}
                  disabled={fetchingEvent || !futuresSlug.trim()}
                  data-testid="button-add-futures"
                >
                  {fetchingEvent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 mr-2" />
                      Add
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-zinc-600">
                Examples: "super-bowl-winner-2026" or
                "https://polymarket.com/event/super-bowl-winner-2026"
              </p>
            </Card>

            {/* Category Management */}
            <div className="space-y-3">
              <h3 className="font-semibold text-zinc-300">Categories</h3>
              <p className="text-xs text-zinc-500">
                Create categories to organize your futures events. Assign
                each future to a category below.
              </p>

              <Card className="p-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="New category name (e.g., Football, Basketball)"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      newCategoryName.trim() &&
                      createCategoryMutation.mutate(
                        newCategoryName.trim(),
                      )
                    }
                    data-testid="input-new-category"
                  />
                  <Button
                    onClick={() =>
                      newCategoryName.trim() &&
                      createCategoryMutation.mutate(
                        newCategoryName.trim(),
                      )
                    }
                    disabled={
                      createCategoryMutation.isPending ||
                      !newCategoryName.trim()
                    }
                    data-testid="button-add-category"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>

                {categoriesLoading ? (
                  <div className="text-zinc-500 text-sm">
                    Loading categories...
                  </div>
                ) : futuresCategories.length === 0 ? (
                  <div className="text-zinc-600 text-sm">
                    No categories yet. Create one above.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {futuresCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center gap-1 bg-zinc-800 rounded px-2 py-1"
                      >
                        {editingCategoryId === cat.id ? (
                          <>
                            <Input
                              value={editingCategoryName}
                              onChange={(e) =>
                                setEditingCategoryName(e.target.value)
                              }
                              className="h-6 w-24 text-xs"
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  editingCategoryName.trim()
                                ) {
                                  updateCategoryMutation.mutate({
                                    id: cat.id,
                                    name: editingCategoryName.trim(),
                                  });
                                }
                                if (e.key === "Escape") {
                                  setEditingCategoryId(null);
                                  setEditingCategoryName("");
                                }
                              }}
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() =>
                                updateCategoryMutation.mutate({
                                  id: cat.id,
                                  name: editingCategoryName.trim(),
                                })
                              }
                            >
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingCategoryId(null);
                                setEditingCategoryName("");
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span
                              className="text-sm cursor-pointer hover:text-wild-brand"
                              onClick={() => {
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                              }}
                            >
                              {cat.name}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5 ml-1"
                              onClick={() =>
                                deleteCategoryMutation.mutate(cat.id)
                              }
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Futures List */}
            <div className="space-y-3">
              <h3 className="font-semibold text-zinc-300">
                Futures Events
              </h3>
              {futuresLoading ? (
                <div className="text-zinc-500">Loading...</div>
              ) : futuresList.length === 0 ? (
                <Card className="p-8 text-center text-zinc-500">
                  No futures events yet. Add one using a Polymarket event
                  link above.
                </Card>
              ) : (
                <div className="space-y-2">
                  {futuresList.map((future) => (
                    <Card
                      key={future.id}
                      className="p-4 flex justify-between items-start gap-4"
                      data-testid={`futures-${future.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">
                          {future.title}
                        </div>
                        <div className="text-sm text-zinc-500 truncate">
                          Slug: {future.polymarketSlug}
                        </div>
                        {future.marketData?.outcomes && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {future.marketData.outcomes
                              .slice(0, 3)
                              .map((outcome, i) => (
                                <span
                                  key={i}
                                  className="text-xs px-2 py-1 bg-zinc-800 rounded"
                                >
                                  {outcome.label}:{" "}
                                  {(outcome.probability * 100).toFixed(0)}
                                  %
                                </span>
                              ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-xs text-zinc-500">
                            Category:
                          </span>
                          <Select
                            value={
                              future.categoryId?.toString() || "none"
                            }
                            onValueChange={(value) => {
                              const categoryId =
                                value === "none"
                                  ? null
                                  : parseInt(value);
                              updateFuturesCategoryMutation.mutate({
                                futuresId: future.id,
                                categoryId,
                              });
                            }}
                          >
                            <SelectTrigger
                              className="h-7 w-40 text-xs"
                              data-testid={`select-category-${future.id}`}
                            >
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                Uncategorized
                              </SelectItem>
                              {futuresCategories.map((cat) => (
                                <SelectItem
                                  key={cat.id}
                                  value={cat.id.toString()}
                                >
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {future.endDate && (
                          <div className="text-xs text-zinc-600 mt-1">
                            Ends:{" "}
                            {new Date(
                              future.endDate,
                            ).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() =>
                          deleteFuturesMutation.mutate(future.id)
                        }
                        disabled={deleteFuturesMutation.isPending}
                        data-testid={`button-delete-futures-${future.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* PLAYERS */}
        {/* ============================================================= */}
        {activeSection === "players" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold">Demo Players</h2>
              <Button
                onClick={() => setShowPlayerForm(!showPlayerForm)}
                data-testid="button-toggle-player-form"
              >
                {showPlayerForm ? (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Player
                  </>
                )}
              </Button>
            </div>

            {showPlayerForm && (
              <Card className="p-4 space-y-4">
                <h3 className="font-bold text-zinc-300">
                  Create New Player
                </h3>
                <form
                  onSubmit={playerForm.handleSubmit(onSubmitPlayer)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Player Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g. LeBron James"
                        {...playerForm.register("name")}
                        data-testid="input-player-name"
                      />
                      {playerForm.formState.errors.name && (
                        <p className="text-xs text-red-500">
                          {playerForm.formState.errors.name.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="symbol">Symbol (Token)</Label>
                      <Input
                        id="symbol"
                        placeholder="e.g. LBJ"
                        maxLength={6}
                        {...playerForm.register("symbol")}
                        data-testid="input-player-symbol"
                      />
                      {playerForm.formState.errors.symbol && (
                        <p className="text-xs text-red-500">
                          {playerForm.formState.errors.symbol.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="team">Team</Label>
                      <Input
                        id="team"
                        placeholder="e.g. Los Angeles Lakers"
                        {...playerForm.register("team")}
                        data-testid="input-player-team"
                      />
                      {playerForm.formState.errors.team && (
                        <p className="text-xs text-red-500">
                          {playerForm.formState.errors.team.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sport">Sport</Label>
                      <Select
                        value={playerForm.watch("sport")}
                        onValueChange={(value) =>
                          playerForm.setValue("sport", value)
                        }
                      >
                        <SelectTrigger data-testid="select-player-sport">
                          <SelectValue placeholder="Select sport" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Basketball">
                            Basketball
                          </SelectItem>
                          <SelectItem value="Football">
                            Football
                          </SelectItem>
                          <SelectItem value="Soccer">Soccer</SelectItem>
                          <SelectItem value="Baseball">
                            Baseball
                          </SelectItem>
                          <SelectItem value="Hockey">Hockey</SelectItem>
                          <SelectItem value="Tennis">Tennis</SelectItem>
                          <SelectItem value="Golf">Golf</SelectItem>
                          <SelectItem value="MMA">MMA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fundingTarget">
                        Funding Target ($)
                      </Label>
                      <Input
                        id="fundingTarget"
                        type="number"
                        {...playerForm.register("fundingTarget", {
                          valueAsNumber: true,
                        })}
                        data-testid="input-funding-target"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fundingCurrent">
                        Current Funding ($)
                      </Label>
                      <Input
                        id="fundingCurrent"
                        type="number"
                        {...playerForm.register("fundingCurrent", {
                          valueAsNumber: true,
                        })}
                        data-testid="input-funding-current"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={playerForm.watch("status")}
                        onValueChange={(
                          value: "offering" | "available" | "closed",
                        ) => playerForm.setValue("status", value)}
                      >
                        <SelectTrigger data-testid="select-player-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="offering">
                            Offering (Funding)
                          </SelectItem>
                          <SelectItem value="available">
                            Available (Trading)
                          </SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={createPlayerMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-player"
                  >
                    {createPlayerMutation.isPending
                      ? "Creating..."
                      : "Create Player"}
                  </Button>
                </form>
              </Card>
            )}

            {playersLoading ? (
              <div className="text-zinc-500">Loading...</div>
            ) : players.length === 0 ? (
              <Card className="p-8 text-center text-zinc-500">
                No players yet. Click "Add Player" to create one.
              </Card>
            ) : (
              <div className="space-y-2">
                {players.map((player) => (
                  <Card
                    key={player.id}
                    className="p-4 flex justify-between items-center gap-2"
                    data-testid={`admin-player-${player.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">
                        {player.name}
                      </div>
                      <div className="text-sm text-zinc-500">
                        ${player.symbol} | {player.team} | {player.sport}{" "}
                        | {player.status}
                      </div>
                      <div className="text-xs text-zinc-600">
                        Funding: $
                        {player.fundingCurrent.toLocaleString()} / $
                        {player.fundingTarget.toLocaleString()} (
                        {player.fundingPercentage}%)
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() =>
                        deletePlayerMutation.mutate(player.id)
                      }
                      disabled={deletePlayerMutation.isPending}
                      data-testid={`button-delete-player-${player.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* WILD POINTS */}
        {/* ============================================================= */}
        {activeSection === "wild" && <WildPointsManager />}

        {/* ============================================================= */}
        {/* POINTS CONFIG */}
        {/* ============================================================= */}
        {activeSection === "points" &&
          (wlLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : (
            <PointsSection
              pointsConfig={pointsConfig}
              setPointsConfig={setPointsConfig}
              onSave={handleSavePoints}
              isSaving={savingPoints}
            />
          ))}

        {/* ============================================================= */}
        {/* FEES */}
        {/* ============================================================= */}
        {activeSection === "fees" &&
          (wlLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : (
            <FeeSection
              feeConfig={feeConfig}
              setFeeConfig={setFeeConfig}
              onSave={handleSaveFees}
              isSaving={savingFees}
            />
          ))}

        {/* ============================================================= */}
        {/* SPORT CONFIG */}
        {/* ============================================================= */}
        {activeSection === "sportconfig" && (
          <SportConfigEditor sportsData={sportsData} toast={toast} />
        )}
      </div>
    </div>
  );
}
