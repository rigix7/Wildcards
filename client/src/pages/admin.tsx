/**
 * Admin Panel – Full version with all features and password protection
 *
 * Combines the original Wildcards admin (Tags, Match Day, Futures, Players,
 * Wild Points) with the PolyHouse-derived sections (Points Config, Fee Config,
 * White Label Theme) and password protection via ADMIN_SECRET_KEY.
 *
 * Tabs:
 *   - Tags          – Sync & toggle Polymarket sport tags
 *   - Match Day     – Select leagues / bet types for the Predict tab
 *   - Futures       – Add long-term Polymarket events by slug/URL
 *   - Players       – Create / manage demo players
 *   - $WILD Points  – View wallet-level points & activity
 *   - Points Config – Enable/disable points, referral %, reset schedule
 *   - Fees          – Fee BPS, multi-wallet splits
 *   - White Label   – Theme / brand customization (colors, logo, etc.)
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
  Palette,
  Zap,
  Flame,
  Target,
  Trophy,
  Crown,
  Shield,
  Rocket,
  Gem,
  Heart,
  Sparkles,
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
  PolymarketTagRecord,
  FuturesCategory,
} from "@shared/schema";
import { themeConfigSchema, type ThemeConfig } from "@shared/schema";
import { ReferralAdminSection } from "@/components/admin/ReferralAdminSection";

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
  showFeeInUI?: boolean;
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
  themeConfig?: ThemeConfig | null;
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
  sport: z.string().default("Basketball"),
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

      {/* Show fee in UI toggle */}
      <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-3">
        <div>
          <div className="text-sm text-white">Show Fee in UI</div>
          <div className="text-xs text-zinc-500">Display fee breakdown to users in the bet slip</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={feeConfig.showFeeInUI ?? true}
            onChange={(e) => setFeeConfig({ ...feeConfig, showFeeInUI: e.target.checked })}
            className="sr-only peer"
            data-testid="toggle-show-fee"
          />
          <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
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

// ===========================================================================
// White Label / Theme Section
// ===========================================================================

const PRESET_COLORS = [
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Emerald", value: "#10b981" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Pink", value: "#ec4899" },
  { name: "Orange", value: "#f97316" },
  { name: "White", value: "#ffffff" },
  { name: "Zinc 50", value: "#fafafa" },
  { name: "Zinc 200", value: "#e4e4e7" },
  { name: "Zinc 400", value: "#a1a1aa" },
  { name: "Zinc 600", value: "#52525b" },
  { name: "Zinc 800", value: "#27272a" },
  { name: "Zinc 900", value: "#18181b" },
  { name: "Zinc 950", value: "#09090b" },
];

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex-1">
        <Label className="text-xs text-zinc-400">{label}</Label>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer border border-zinc-700"
          />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-sm"
            placeholder="#000000"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={`w-5 h-5 rounded border transition-all ${value === preset.value ? 'border-white ring-1 ring-white' : 'border-zinc-700 hover:border-zinc-500'}`}
            style={{ backgroundColor: preset.value }}
            title={preset.name}
          />
        ))}
      </div>
    </div>
  );
}

const PRESET_THEMES: Record<string, { name: string; description: string; icon: typeof Zap; theme: ThemeConfig }> = {
  wildcards: {
    name: "Wildcards",
    description: "Original Wildcards theme - bold orange and gold",
    icon: Flame,
    theme: {
      brand: { name: "WILDCARDS", primaryColor: "#f43f5e", accentColor: "#fbbf24" },
      header: { backgroundColor: '#09090b', textColor: '#fafafa', accentColor: '#fbbf24' },
      betSlip: { backgroundColor: '#18181b', cardColor: '#27272a', primaryButtonColor: '#f43f5e', successColor: '#10b981', textColor: '#fafafa' },
      marketCards: { backgroundColor: '#18181b', hoverColor: '#27272a', borderColor: '#3f3f46', oddsBadgeColor: '#fbbf24', textColor: '#fafafa', moneylineAccent: '#f43f5e', moneylineAwayAccent: '#3b82f6', moneylineDrawAccent: '#71717a', totalsAccent: '#3b82f6', moreMarketsAccent: '#8b5cf6' },
      sortingBar: { backgroundColor: '#09090b', activeTabColor: '#f43f5e', inactiveTabColor: '#71717a' },
      bottomNav: { backgroundColor: '#09090b', activeColor: '#fbbf24', inactiveColor: '#71717a' },
      global: { successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b' },
      dashboard: { accentColor: '#3b82f6', actionColor: '#fbbf24', positiveColor: '#34d399', negativeColor: '#f43f5e' },
    },
  },
  professional: {
    name: "Professional Blue",
    description: "Clean corporate theme with blue accents",
    icon: Shield,
    theme: {
      brand: { name: "PREDICT", primaryColor: "#3b82f6", accentColor: "#3b82f6" },
      header: { backgroundColor: '#ffffff', textColor: '#111827', accentColor: '#3b82f6' },
      betSlip: { backgroundColor: '#f9fafb', cardColor: '#ffffff', primaryButtonColor: '#3b82f6', successColor: '#10b981', textColor: '#111827' },
      marketCards: { backgroundColor: '#ffffff', hoverColor: '#f3f4f6', borderColor: '#e5e7eb', oddsBadgeColor: '#3b82f6', textColor: '#111827', moneylineAccent: '#3b82f6', moneylineAwayAccent: '#ec4899', moneylineDrawAccent: '#9ca3af', totalsAccent: '#8b5cf6', moreMarketsAccent: '#ec4899' },
      sortingBar: { backgroundColor: '#ffffff', activeTabColor: '#3b82f6', inactiveTabColor: '#9ca3af' },
      bottomNav: { backgroundColor: '#ffffff', activeColor: '#3b82f6', inactiveColor: '#9ca3af' },
      global: { successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b' },
      dashboard: { accentColor: '#3b82f6', actionColor: '#3b82f6', positiveColor: '#10b981', negativeColor: '#ef4444' },
    },
  },
  neon: {
    name: "Neon Nights",
    description: "High-energy cyber aesthetic with neon green",
    icon: Zap,
    theme: {
      brand: { name: "NEON BETS", primaryColor: "#00ff88", accentColor: "#00ff88" },
      header: { backgroundColor: '#0a0a0f', textColor: '#00ff88', accentColor: '#00ff88' },
      betSlip: { backgroundColor: '#0f0f1a', cardColor: '#1a1a2e', primaryButtonColor: '#00ff88', successColor: '#00ff88', textColor: '#ffffff' },
      marketCards: { backgroundColor: '#1a1a2e', hoverColor: '#25254a', borderColor: '#2d2d5a', oddsBadgeColor: '#00ff88', textColor: '#ffffff', moneylineAccent: '#00ff88', moneylineAwayAccent: '#ff00ff', moneylineDrawAccent: '#555577', totalsAccent: '#ff00ff', moreMarketsAccent: '#00d4ff' },
      sortingBar: { backgroundColor: '#0a0a0f', activeTabColor: '#00ff88', inactiveTabColor: '#6b7280' },
      bottomNav: { backgroundColor: '#0a0a0f', activeColor: '#00ff88', inactiveColor: '#6b7280' },
      global: { successColor: '#00ff88', errorColor: '#ff0055', warningColor: '#ffaa00' },
      dashboard: { accentColor: '#00d4ff', actionColor: '#00ff88', positiveColor: '#00ff88', negativeColor: '#ff0055' },
    },
  },
  luxury: {
    name: "Luxury Gold",
    description: "Premium dark theme with gold accents",
    icon: Crown,
    theme: {
      brand: { name: "ELITE BETS", primaryColor: "#f59e0b", accentColor: "#f59e0b" },
      header: { backgroundColor: '#1c1917', textColor: '#fafaf9', accentColor: '#f59e0b' },
      betSlip: { backgroundColor: '#292524', cardColor: '#3c3836', primaryButtonColor: '#f59e0b', successColor: '#10b981', textColor: '#fafaf9' },
      marketCards: { backgroundColor: '#292524', hoverColor: '#3c3836', borderColor: '#57534e', oddsBadgeColor: '#f59e0b', textColor: '#fafaf9', moneylineAccent: '#f59e0b', moneylineAwayAccent: '#fbbf24', moneylineDrawAccent: '#78716c', totalsAccent: '#fbbf24', moreMarketsAccent: '#fb923c' },
      sortingBar: { backgroundColor: '#1c1917', activeTabColor: '#f59e0b', inactiveTabColor: '#78716c' },
      bottomNav: { backgroundColor: '#1c1917', activeColor: '#f59e0b', inactiveColor: '#78716c' },
      global: { successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b' },
      dashboard: { accentColor: '#fbbf24', actionColor: '#f59e0b', positiveColor: '#10b981', negativeColor: '#ef4444' },
    },
  },
  earth: {
    name: "Earth Tones",
    description: "Warm natural theme with green accents",
    icon: Heart,
    theme: {
      brand: { name: "ORGANIC BETS", primaryColor: "#10b981", accentColor: "#10b981" },
      header: { backgroundColor: '#fefce8', textColor: '#1f2937', accentColor: '#10b981' },
      betSlip: { backgroundColor: '#fef9c3', cardColor: '#fef3c7', primaryButtonColor: '#10b981', successColor: '#10b981', textColor: '#1f2937' },
      marketCards: { backgroundColor: '#fef3c7', hoverColor: '#fde68a', borderColor: '#fcd34d', oddsBadgeColor: '#10b981', textColor: '#1f2937', moneylineAccent: '#10b981', moneylineAwayAccent: '#059669', moneylineDrawAccent: '#6b7280', totalsAccent: '#059669', moreMarketsAccent: '#14b8a6' },
      sortingBar: { backgroundColor: '#fefce8', activeTabColor: '#10b981', inactiveTabColor: '#6b7280' },
      bottomNav: { backgroundColor: '#fefce8', activeColor: '#10b981', inactiveColor: '#6b7280' },
      global: { successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b' },
      dashboard: { accentColor: '#059669', actionColor: '#10b981', positiveColor: '#10b981', negativeColor: '#ef4444' },
    },
  },
  midnight: {
    name: "Midnight Purple",
    description: "Dark mysterious theme with purple accents",
    icon: Sparkles,
    theme: {
      brand: { name: "MYSTIC BETS", primaryColor: "#a855f7", accentColor: "#a855f7" },
      header: { backgroundColor: '#0f0a1f', textColor: '#e9d5ff', accentColor: '#a855f7' },
      betSlip: { backgroundColor: '#1a1032', cardColor: '#251a3d', primaryButtonColor: '#a855f7', successColor: '#10b981', textColor: '#e9d5ff' },
      marketCards: { backgroundColor: '#1a1032', hoverColor: '#251a3d', borderColor: '#3d2d5c', oddsBadgeColor: '#a855f7', textColor: '#e9d5ff', moneylineAccent: '#a855f7', moneylineAwayAccent: '#c084fc', moneylineDrawAccent: '#6b7280', totalsAccent: '#c084fc', moreMarketsAccent: '#e879f9' },
      sortingBar: { backgroundColor: '#0f0a1f', activeTabColor: '#a855f7', inactiveTabColor: '#6b7280' },
      bottomNav: { backgroundColor: '#0f0a1f', activeColor: '#a855f7', inactiveColor: '#6b7280' },
      global: { successColor: '#10b981', errorColor: '#ef4444', warningColor: '#f59e0b' },
      dashboard: { accentColor: '#c084fc', actionColor: '#a855f7', positiveColor: '#10b981', negativeColor: '#ef4444' },
    },
  },
};

function WhiteLabelSection({
  localTheme,
  setLocalTheme,
  activeThemeTab,
  setActiveThemeTab,
  onSave,
  onSaveTheme,
  isSaving,
}: {
  localTheme: ThemeConfig;
  setLocalTheme: (t: ThemeConfig) => void;
  activeThemeTab: "brand" | "header" | "betslip" | "marketCards" | "sortingBar" | "bottomNav" | "dashboard";
  setActiveThemeTab: (t: "brand" | "header" | "betslip" | "marketCards" | "sortingBar" | "bottomNav" | "dashboard") => void;
  onSave: () => void;
  onSaveTheme: (theme: ThemeConfig) => void;
  isSaving: boolean;
}) {
  const { toast } = useToast();
  const [previewMode, setPreviewMode] = useState<'component' | 'fullPage'>('component');

  const ICON_OPTIONS: { name: string; icon: typeof Zap | null }[] = [
    { name: "none", icon: null },
    { name: "zap", icon: Zap },
    { name: "flame", icon: Flame },
    { name: "target", icon: Target },
    { name: "trophy", icon: Trophy },
    { name: "crown", icon: Crown },
    { name: "shield", icon: Shield },
    { name: "rocket", icon: Rocket },
    { name: "gem", icon: Gem },
    { name: "heart", icon: Heart },
    { name: "sparkles", icon: Sparkles },
    { name: "star", icon: Star },
  ];

  const IconMap: Record<string, typeof Zap> = {
    zap: Zap, flame: Flame, target: Target, trophy: Trophy, crown: Crown,
    shield: Shield, rocket: Rocket, gem: Gem, heart: Heart, sparkles: Sparkles, star: Star,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">White Label Configuration</h2>
        <p className="text-sm text-zinc-500">
          Customize the look and feel of your betting platform
        </p>
      </div>

      {/* Preset Themes Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Quick Start - Choose a Preset</h3>
            <p className="text-sm text-zinc-500">Select a ready-made theme or customize below</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(PRESET_THEMES).map(([id, preset]) => {
            const Icon = preset.icon;
            return (
              <button
                key={id}
                onClick={() => {
                  setLocalTheme(preset.theme);
                  toast({ title: `Applied ${preset.name} theme`, description: "Click Save to persist changes" });
                }}
                className="group relative p-4 rounded-lg border-2 border-zinc-800 hover:border-zinc-600 transition-all text-left"
              >
                <div
                  className="h-24 rounded-lg mb-3 flex items-center justify-center relative overflow-hidden"
                  style={{ backgroundColor: preset.theme.header?.backgroundColor }}
                >
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      background: `linear-gradient(135deg, ${preset.theme.betSlip?.primaryButtonColor} 0%, ${preset.theme.header?.accentColor} 100%)`
                    }}
                  />
                  <Icon className="w-8 h-8 relative z-10" style={{ color: preset.theme.header?.accentColor }} />
                </div>

                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="font-bold text-white text-sm">{preset.name}</div>
                    <div className="text-xs text-zinc-500 mt-1">{preset.description}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocalTheme(preset.theme);
                      onSaveTheme(preset.theme);
                    }}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-zinc-300">
              <strong>Quick Apply:</strong> Click a theme card to preview it instantly.{" "}
              <strong>Save:</strong> Click the checkmark to apply and save immediately, or customize details below first.
            </div>
          </div>
        </div>
      </div>

      {/* Preview Mode Toggle */}
      <div className="border-t border-zinc-800 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Preview</h3>
            <p className="text-sm text-zinc-500">See how your theme looks</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={previewMode === 'component' ? 'default' : 'outline'}
              onClick={() => setPreviewMode('component')}
              size="sm"
            >
              Component View
            </Button>
            <Button
              variant={previewMode === 'fullPage' ? 'default' : 'outline'}
              onClick={() => setPreviewMode('fullPage')}
              size="sm"
            >
              Full Page Preview
            </Button>
          </div>
        </div>

        {/* Full Page Preview Panel */}
        {previewMode === 'fullPage' && (
          <Card className="p-6 mb-6">
            <h3 className="font-bold text-white mb-4">Live Full Page Preview</h3>
            <div className="border-2 border-zinc-700 rounded-lg overflow-hidden">
              <div
                className="h-[600px] overflow-y-auto relative"
                style={{ backgroundColor: localTheme.header?.backgroundColor || '#09090b' }}
              >
                {/* Header Preview */}
                <div
                  className="p-4 flex items-center justify-between"
                  style={{ backgroundColor: localTheme.header?.backgroundColor }}
                >
                  <span
                    className="text-xl font-bold italic tracking-tighter"
                    style={{ color: localTheme.header?.textColor }}
                  >
                    {localTheme.brand?.name || "WILDCARDS"}
                  </span>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: localTheme.header?.accentColor }}
                  >
                    <span className="text-sm font-bold" style={{ color: localTheme.header?.backgroundColor }}>W</span>
                  </div>
                </div>

                {/* Sorting Bar Preview */}
                <div
                  className="p-3 flex gap-2 border-b"
                  style={{
                    backgroundColor: localTheme.sortingBar?.backgroundColor,
                    borderColor: localTheme.marketCards?.borderColor,
                  }}
                >
                  <button
                    className="px-4 py-2 rounded text-sm font-medium"
                    style={{
                      backgroundColor: localTheme.sortingBar?.activeTabColor,
                      color: '#ffffff',
                    }}
                  >
                    All
                  </button>
                  <button className="px-4 py-2 rounded text-sm" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>
                    Soccer
                  </button>
                  <button className="px-4 py-2 rounded text-sm" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>
                    NBA
                  </button>
                </div>

                {/* Market Cards Preview */}
                <div className="p-4 grid grid-cols-1 gap-3">
                  {/* Moneyline Market */}
                  <div
                    className="p-4 rounded-lg border"
                    style={{
                      backgroundColor: localTheme.marketCards?.backgroundColor,
                      borderColor: localTheme.marketCards?.borderColor,
                      borderLeftWidth: '4px',
                      borderLeftColor: localTheme.marketCards?.moneylineAccent,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-xs" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>NBA &middot; Moneyline</div>
                        <div className="font-medium" style={{ color: localTheme.marketCards?.textColor }}>
                          Lakers vs Celtics
                        </div>
                      </div>
                      <span
                        className="px-2 py-1 rounded text-xs font-bold"
                        style={{ backgroundColor: localTheme.marketCards?.oddsBadgeColor, color: '#000' }}
                      >
                        2.5
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 py-2 rounded text-sm font-medium border"
                        style={{ backgroundColor: localTheme.marketCards?.moneylineAccent, borderColor: localTheme.marketCards?.moneylineAccent, color: '#fff' }}
                      >
                        Lakers
                      </button>
                      <button
                        className="flex-1 py-2 rounded text-sm font-medium border"
                        style={{ backgroundColor: localTheme.marketCards?.moneylineAwayAccent, borderColor: localTheme.marketCards?.moneylineAwayAccent, color: '#fff' }}
                      >
                        Celtics
                      </button>
                    </div>
                  </div>

                  {/* Totals Market */}
                  <div
                    className="p-4 rounded-lg border"
                    style={{
                      backgroundColor: localTheme.marketCards?.backgroundColor,
                      borderColor: localTheme.marketCards?.borderColor,
                      borderLeftWidth: '4px',
                      borderLeftColor: localTheme.marketCards?.totalsAccent,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-xs" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>NBA &middot; Total Points</div>
                        <div className="font-medium" style={{ color: localTheme.marketCards?.textColor }}>
                          Over/Under 220.5
                        </div>
                      </div>
                      <span
                        className="px-2 py-1 rounded text-xs font-bold"
                        style={{ backgroundColor: localTheme.marketCards?.oddsBadgeColor, color: '#000' }}
                      >
                        1.9
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 py-2 rounded text-sm font-medium border"
                        style={{ borderColor: localTheme.marketCards?.borderColor, color: localTheme.marketCards?.textColor }}
                      >
                        Over
                      </button>
                      <button
                        className="flex-1 py-2 rounded text-sm font-medium border"
                        style={{ borderColor: localTheme.marketCards?.borderColor, color: localTheme.marketCards?.textColor }}
                      >
                        Under
                      </button>
                    </div>
                  </div>

                  {/* More Markets */}
                  <div
                    className="p-4 rounded-lg border"
                    style={{
                      backgroundColor: localTheme.marketCards?.backgroundColor,
                      borderColor: localTheme.marketCards?.borderColor,
                      borderLeftWidth: '4px',
                      borderLeftColor: localTheme.marketCards?.moreMarketsAccent,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-xs" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>Soccer &middot; Match Result</div>
                        <div className="font-medium" style={{ color: localTheme.marketCards?.textColor }}>
                          Arsenal vs Chelsea
                        </div>
                      </div>
                      <span
                        className="px-2 py-1 rounded text-xs font-bold"
                        style={{ backgroundColor: localTheme.marketCards?.oddsBadgeColor, color: '#000' }}
                      >
                        3.2
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 py-2 rounded text-sm font-medium border"
                        style={{ backgroundColor: localTheme.marketCards?.moneylineAccent, borderColor: localTheme.marketCards?.moneylineAccent, color: '#fff' }}
                      >
                        Home
                      </button>
                      <button
                        className="flex-1 py-2 rounded text-sm font-medium border"
                        style={{ backgroundColor: localTheme.marketCards?.moneylineDrawAccent, borderColor: localTheme.marketCards?.moneylineDrawAccent, color: '#fff' }}
                      >
                        Draw
                      </button>
                      <button
                        className="flex-1 py-2 rounded text-sm font-medium border"
                        style={{ backgroundColor: localTheme.marketCards?.moneylineAwayAccent, borderColor: localTheme.marketCards?.moneylineAwayAccent, color: '#fff' }}
                      >
                        Away
                      </button>
                    </div>
                  </div>
                </div>

                {/* BetSlip Preview (inline at bottom of scroll) */}
                <div className="p-4">
                  <div
                    className="rounded-lg p-4 shadow-xl"
                    style={{ backgroundColor: localTheme.betSlip?.backgroundColor }}
                  >
                    <div className="font-bold mb-3" style={{ color: localTheme.betSlip?.textColor }}>
                      Bet Slip
                    </div>
                    <div
                      className="p-3 rounded mb-3"
                      style={{ backgroundColor: localTheme.betSlip?.cardColor }}
                    >
                      <div className="text-sm" style={{ color: localTheme.betSlip?.textColor }}>
                        Lakers to win
                      </div>
                      <div className="text-xs" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>Odds: 2.50</div>
                    </div>
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between text-sm" style={{ color: localTheme.betSlip?.textColor }}>
                        <span>Stake</span>
                        <span>$10.00</span>
                      </div>
                      <div className="flex justify-between text-sm" style={{ color: localTheme.betSlip?.textColor }}>
                        <span>Potential Win</span>
                        <span style={{ color: localTheme.betSlip?.successColor }}>$25.00</span>
                      </div>
                    </div>
                    <button
                      className="w-full py-3 rounded font-bold text-white"
                      style={{ backgroundColor: localTheme.betSlip?.primaryButtonColor }}
                    >
                      Place Bet
                    </button>
                  </div>
                </div>

                {/* Bottom Nav Preview */}
                <div
                  className="sticky bottom-0 p-3 flex justify-around border-t"
                  style={{
                    backgroundColor: localTheme.bottomNav?.backgroundColor,
                    borderColor: localTheme.marketCards?.borderColor,
                  }}
                >
                  <div className="flex flex-col items-center">
                    <Target className="w-5 h-5" style={{ color: localTheme.bottomNav?.activeColor }} />
                    <span className="text-xs mt-1" style={{ color: localTheme.bottomNav?.activeColor }}>
                      Predict
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Trophy className="w-5 h-5" style={{ color: localTheme.bottomNav?.inactiveColor }} />
                    <span className="text-xs mt-1" style={{ color: localTheme.bottomNav?.inactiveColor }}>
                      Futures
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Users className="w-5 h-5" style={{ color: localTheme.bottomNav?.inactiveColor }} />
                    <span className="text-xs mt-1" style={{ color: localTheme.bottomNav?.inactiveColor }}>
                      Dashboard
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-3">
              This preview shows how your theme will look across the entire app. Scroll to see all components.
            </p>
          </Card>
        )}
      </div>

      {/* Advanced Customization */}
      <div className="border-t border-zinc-800 pt-6">
        <h3 className="text-lg font-bold text-white mb-2">Advanced Customization</h3>
        <p className="text-sm text-zinc-500 mb-4">Fine-tune individual components</p>

        {/* Sub-tab navigation */}
        <div className="flex flex-wrap gap-2">
          <Button variant={activeThemeTab === "brand" ? "default" : "outline"} size="sm" onClick={() => setActiveThemeTab("brand")}>
            <Palette className="w-4 h-4 mr-2" /> Brand
          </Button>
          <Button variant={activeThemeTab === "header" ? "default" : "outline"} size="sm" onClick={() => setActiveThemeTab("header")}>
            Header
          </Button>
          <Button variant={activeThemeTab === "betslip" ? "default" : "outline"} size="sm" onClick={() => setActiveThemeTab("betslip")}>
            Bet Slip
          </Button>
          <Button variant={activeThemeTab === "marketCards" ? "default" : "outline"} size="sm" onClick={() => setActiveThemeTab("marketCards")}>
            Market Cards
          </Button>
          <Button variant={activeThemeTab === "sortingBar" ? "default" : "outline"} size="sm" onClick={() => setActiveThemeTab("sortingBar")}>
            Sorting Bar
          </Button>
          <Button variant={activeThemeTab === "bottomNav" ? "default" : "outline"} size="sm" onClick={() => setActiveThemeTab("bottomNav")}>
            Bottom Nav
          </Button>
          <Button variant={activeThemeTab === "dashboard" ? "default" : "outline"} size="sm" onClick={() => setActiveThemeTab("dashboard")}>
            Dashboard
          </Button>
        </div>
      </div>

      {/* ---- Brand ---- */}
      {activeThemeTab === "brand" && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold">Brand Settings</h3>
              <p className="text-sm text-zinc-500">Configure your platform branding</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
              <div className="text-xs text-zinc-500 mb-2">Preview</div>
              <div className="flex items-center gap-2">
                {(() => {
                  const iconName = localTheme.brand?.logoIcon;
                  const IconComponent = iconName && iconName !== "none" ? IconMap[iconName] : null;
                  if (localTheme.brand?.logoUrl) {
                    return <img src={localTheme.brand.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />;
                  } else if (IconComponent) {
                    return <IconComponent className="w-6 h-6" style={{ color: localTheme.brand?.primaryColor }} />;
                  }
                  return null;
                })()}
                <span className="font-bold italic tracking-tighter" style={{ color: localTheme.brand?.accentColor }}>
                  {localTheme.brand?.name || "WILDCARDS"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-zinc-400">Platform Name</Label>
              <Input
                value={localTheme.brand?.name || ""}
                onChange={(e) => setLocalTheme({ ...localTheme, brand: { ...localTheme.brand, name: e.target.value } })}
                placeholder="WILDCARDS"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Logo URL (optional)</Label>
              <Input
                value={localTheme.brand?.logoUrl || ""}
                onChange={(e) => setLocalTheme({ ...localTheme, brand: { ...localTheme.brand, logoUrl: e.target.value } })}
                placeholder="https://..."
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-zinc-400">Logo Icon (used if no URL provided)</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ICON_OPTIONS.map((item) => {
                  const isSelected = (localTheme.brand?.logoIcon || "none") === item.name;
                  const IconComponent = item.icon;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setLocalTheme({ ...localTheme, brand: { ...localTheme.brand, logoIcon: item.name } })}
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-all ${
                        isSelected ? 'border-white bg-zinc-800 ring-1 ring-white' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                      }`}
                      style={isSelected ? { color: localTheme.brand?.primaryColor || "#f43f5e" } : undefined}
                      title={item.name === "none" ? "No icon" : item.name}
                    >
                      {IconComponent ? <IconComponent className="w-5 h-5" /> : <X className="w-4 h-4 text-zinc-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <ColorPicker label="Primary Color" value={localTheme.brand?.primaryColor || "#f43f5e"} onChange={(v) => setLocalTheme({ ...localTheme, brand: { ...localTheme.brand, primaryColor: v } })} />
            <ColorPicker label="Accent Color" value={localTheme.brand?.accentColor || "#fbbf24"} onChange={(v) => setLocalTheme({ ...localTheme, brand: { ...localTheme.brand, accentColor: v } })} />
          </div>

          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Brand Settings
          </Button>
        </Card>
      )}

      {/* ---- Header ---- */}
      {activeThemeTab === "header" && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold">Header Customization</h3>
              <p className="text-sm text-zinc-500">Style the top navigation bar</p>
            </div>
            <div className="rounded-lg p-3 border border-zinc-700 min-w-[200px]" style={{ backgroundColor: localTheme.header?.backgroundColor }}>
              <div className="text-xs text-zinc-500 mb-2">Preview</div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm italic tracking-tighter" style={{ color: localTheme.header?.textColor }}>
                  {localTheme.brand?.name || "WILDCARDS"}
                </span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: localTheme.header?.accentColor }}>
                  <span className="text-[8px] text-zinc-900 font-bold">W</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorPicker label="Background Color" value={localTheme.header?.backgroundColor || "#09090b"} onChange={(v) => setLocalTheme({ ...localTheme, header: { ...localTheme.header, backgroundColor: v } })} />
            <ColorPicker label="Brand Text Color" value={localTheme.header?.textColor || "#fafafa"} onChange={(v) => setLocalTheme({ ...localTheme, header: { ...localTheme.header, textColor: v } })} />
            <ColorPicker label="Accent Color (Logo area)" value={localTheme.header?.accentColor || "#fbbf24"} onChange={(v) => setLocalTheme({ ...localTheme, header: { ...localTheme.header, accentColor: v } })} />
          </div>

          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Header Settings
          </Button>
        </Card>
      )}

      {/* ---- BetSlip ---- */}
      {activeThemeTab === "betslip" && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold">Bet Slip Customization</h3>
              <p className="text-sm text-zinc-500">Style the betting interface</p>
            </div>
            <div className="rounded-lg p-3 border border-zinc-700 min-w-[180px]" style={{ backgroundColor: localTheme.betSlip?.backgroundColor }}>
              <div className="text-xs text-zinc-500 mb-2">Preview</div>
              <div className="rounded p-2 mb-2" style={{ backgroundColor: localTheme.betSlip?.cardColor }}>
                <div style={{ color: localTheme.betSlip?.textColor }} className="text-xs">Bet Amount</div>
                <div style={{ color: localTheme.betSlip?.textColor }} className="font-bold">$10.00</div>
              </div>
              <button className="w-full py-2 rounded text-white text-sm font-bold" style={{ backgroundColor: localTheme.betSlip?.primaryButtonColor }}>
                Place Bet
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorPicker label="Background Color" value={localTheme.betSlip?.backgroundColor || "#18181b"} onChange={(v) => setLocalTheme({ ...localTheme, betSlip: { ...localTheme.betSlip, backgroundColor: v } })} />
            <ColorPicker label="Card Color" value={localTheme.betSlip?.cardColor || "#27272a"} onChange={(v) => setLocalTheme({ ...localTheme, betSlip: { ...localTheme.betSlip, cardColor: v } })} />
            <ColorPicker label="Primary Button" value={localTheme.betSlip?.primaryButtonColor || "#f43f5e"} onChange={(v) => setLocalTheme({ ...localTheme, betSlip: { ...localTheme.betSlip, primaryButtonColor: v } })} />
            <ColorPicker label="Success Color" value={localTheme.betSlip?.successColor || "#10b981"} onChange={(v) => setLocalTheme({ ...localTheme, betSlip: { ...localTheme.betSlip, successColor: v } })} />
            <ColorPicker label="Text Color" value={localTheme.betSlip?.textColor || "#fafafa"} onChange={(v) => setLocalTheme({ ...localTheme, betSlip: { ...localTheme.betSlip, textColor: v } })} />
          </div>

          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Bet Slip Settings
          </Button>
        </Card>
      )}

      {/* ---- Market Cards ---- */}
      {activeThemeTab === "marketCards" && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold">Market Cards Customization</h3>
              <p className="text-sm text-zinc-500">Style the betting market cards</p>
            </div>
            <div className="rounded-lg p-3 min-w-[200px]" style={{ backgroundColor: localTheme.marketCards?.backgroundColor, borderColor: localTheme.marketCards?.borderColor, borderWidth: 1 }}>
              <div className="text-xs text-zinc-500 mb-2">Preview</div>
              <div style={{ color: localTheme.marketCards?.textColor }} className="text-sm font-medium mb-2">Team A vs Team B</div>
              <div className="flex gap-2">
                <span className="px-2 py-1 rounded text-xs font-bold" style={{ backgroundColor: localTheme.marketCards?.oddsBadgeColor, color: "#000" }}>2.50</span>
                <span className="px-2 py-1 rounded text-xs font-bold" style={{ backgroundColor: localTheme.marketCards?.oddsBadgeColor, color: "#000" }}>1.80</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorPicker label="Background Color" value={localTheme.marketCards?.backgroundColor || "#18181b"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, backgroundColor: v } })} />
            <ColorPicker label="Hover Color" value={localTheme.marketCards?.hoverColor || "#27272a"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, hoverColor: v } })} />
            <ColorPicker label="Border Color" value={localTheme.marketCards?.borderColor || "#3f3f46"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, borderColor: v } })} />
            <ColorPicker label="Odds Badge Color" value={localTheme.marketCards?.oddsBadgeColor || "#fbbf24"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, oddsBadgeColor: v } })} />
            <ColorPicker label="Text Color" value={localTheme.marketCards?.textColor || "#fafafa"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, textColor: v } })} />
          </div>

          <div className="border-t border-zinc-800 pt-4">
            <h4 className="text-sm font-medium mb-3">Market Type Accent Colors</h4>
            <p className="text-xs text-zinc-500 mb-3">These colors are used as accent stripes for different market types</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorPicker label="Moneyline Home" value={localTheme.marketCards?.moneylineAccent || "#f43f5e"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, moneylineAccent: v } })} />
              <ColorPicker label="Moneyline Away" value={localTheme.marketCards?.moneylineAwayAccent || "#3b82f6"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, moneylineAwayAccent: v } })} />
              <ColorPicker label="Moneyline Draw" value={localTheme.marketCards?.moneylineDrawAccent || "#71717a"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, moneylineDrawAccent: v } })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <ColorPicker label="Totals (O/U) Accent" value={localTheme.marketCards?.totalsAccent || "#3b82f6"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, totalsAccent: v } })} />
              <ColorPicker label="More Markets Accent" value={localTheme.marketCards?.moreMarketsAccent || "#8b5cf6"} onChange={(v) => setLocalTheme({ ...localTheme, marketCards: { ...localTheme.marketCards, moreMarketsAccent: v } })} />
            </div>
          </div>

          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Market Card Settings
          </Button>
        </Card>
      )}

      {/* ---- Sorting Bar ---- */}
      {activeThemeTab === "sortingBar" && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold">Sorting Bar Customization</h3>
              <p className="text-sm text-zinc-500">Style the filter and sorting tabs</p>
            </div>
            <div className="rounded-lg p-3 min-w-[200px]" style={{ backgroundColor: localTheme.sortingBar?.backgroundColor }}>
              <div className="text-xs text-zinc-500 mb-2">Preview</div>
              <div className="flex gap-2">
                <span className="px-3 py-1 rounded text-xs font-bold" style={{ backgroundColor: localTheme.sortingBar?.activeTabColor, color: "#fff" }}>All</span>
                <span className="px-3 py-1 rounded text-xs" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>Soccer</span>
                <span className="px-3 py-1 rounded text-xs" style={{ color: localTheme.sortingBar?.inactiveTabColor }}>NBA</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorPicker label="Background Color" value={localTheme.sortingBar?.backgroundColor || "#09090b"} onChange={(v) => setLocalTheme({ ...localTheme, sortingBar: { ...localTheme.sortingBar, backgroundColor: v } })} />
            <ColorPicker label="Active Tab Color" value={localTheme.sortingBar?.activeTabColor || "#f43f5e"} onChange={(v) => setLocalTheme({ ...localTheme, sortingBar: { ...localTheme.sortingBar, activeTabColor: v } })} />
            <ColorPicker label="Inactive Tab Color" value={localTheme.sortingBar?.inactiveTabColor || "#71717a"} onChange={(v) => setLocalTheme({ ...localTheme, sortingBar: { ...localTheme.sortingBar, inactiveTabColor: v } })} />
          </div>

          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Sorting Bar Settings
          </Button>
        </Card>
      )}

      {/* ---- Bottom Nav ---- */}
      {activeThemeTab === "bottomNav" && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold">Bottom Navigation Customization</h3>
              <p className="text-sm text-zinc-500">Style the bottom navigation bar</p>
            </div>
            <div className="rounded-lg p-3 min-w-[200px]" style={{ backgroundColor: localTheme.bottomNav?.backgroundColor }}>
              <div className="text-xs text-zinc-500 mb-2">Preview</div>
              <div className="flex justify-around">
                <div className="flex flex-col items-center">
                  <div className="w-5 h-5 rounded" style={{ backgroundColor: localTheme.bottomNav?.activeColor }} />
                  <span className="text-[10px] mt-1" style={{ color: localTheme.bottomNav?.activeColor }}>Predict</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-5 h-5 rounded" style={{ backgroundColor: localTheme.bottomNav?.inactiveColor }} />
                  <span className="text-[10px] mt-1" style={{ color: localTheme.bottomNav?.inactiveColor }}>Dashboard</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorPicker label="Background Color" value={localTheme.bottomNav?.backgroundColor || "#09090b"} onChange={(v) => setLocalTheme({ ...localTheme, bottomNav: { ...localTheme.bottomNav, backgroundColor: v } })} />
            <ColorPicker label="Active Color" value={localTheme.bottomNav?.activeColor || "#fbbf24"} onChange={(v) => setLocalTheme({ ...localTheme, bottomNav: { ...localTheme.bottomNav, activeColor: v } })} />
            <ColorPicker label="Inactive Color" value={localTheme.bottomNav?.inactiveColor || "#71717a"} onChange={(v) => setLocalTheme({ ...localTheme, bottomNav: { ...localTheme.bottomNav, inactiveColor: v } })} />
          </div>

          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Bottom Nav Settings
          </Button>
        </Card>
      )}

      {/* ---- Dashboard ---- */}
      {activeThemeTab === "dashboard" && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold">Dashboard Customization</h3>
              <p className="text-sm text-zinc-500">Customize the wallet dashboard accent colors</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3 min-w-[200px] border border-zinc-700">
              <div className="text-xs text-zinc-500 mb-2">Preview</div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: localTheme.dashboard?.accentColor }} />
                  <span className="text-[10px]" style={{ color: localTheme.dashboard?.accentColor }}>Activity</span>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: localTheme.dashboard?.positiveColor }} />
                  <span className="text-[10px]" style={{ color: localTheme.dashboard?.positiveColor }}>Won</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: localTheme.dashboard?.negativeColor }} />
                  <span className="text-[10px]" style={{ color: localTheme.dashboard?.negativeColor }}>Lost</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold text-zinc-950" style={{ backgroundColor: localTheme.dashboard?.actionColor }}>Withdraw</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ColorPicker label="Info Accent (Activity, links)" value={localTheme.dashboard?.accentColor || "#3b82f6"} onChange={(v) => setLocalTheme({ ...localTheme, dashboard: { ...localTheme.dashboard, accentColor: v } })} />
            <ColorPicker label="Action Button (Withdraw, Sell)" value={localTheme.dashboard?.actionColor || "#fbbf24"} onChange={(v) => setLocalTheme({ ...localTheme, dashboard: { ...localTheme.dashboard, actionColor: v } })} />
            <ColorPicker label="Positive (Won, Profit)" value={localTheme.dashboard?.positiveColor || "#34d399"} onChange={(v) => setLocalTheme({ ...localTheme, dashboard: { ...localTheme.dashboard, positiveColor: v } })} />
            <ColorPicker label="Negative (Lost, Error)" value={localTheme.dashboard?.negativeColor || "#f43f5e"} onChange={(v) => setLocalTheme({ ...localTheme, dashboard: { ...localTheme.dashboard, negativeColor: v } })} />
          </div>

          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Dashboard Settings
          </Button>
        </Card>
      )}
    </div>
  );
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
  | "whitelabel"
  | "referral";

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
  const [localTheme, setLocalTheme] = useState<ThemeConfig>(themeConfigSchema.parse({}));
  const [activeThemeTab, setActiveThemeTab] = useState<"brand" | "header" | "betslip" | "marketCards" | "sortingBar" | "bottomNav" | "dashboard">("brand");
  const [savingTheme, setSavingTheme] = useState(false);
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
        if (data.themeConfig) setLocalTheme(data.themeConfig as ThemeConfig);
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
    if (activeSection === "matchday" && sportsData.length === 0) {
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
      // Derive enabled + feeAddress so the DB config is self-contained
      const hasValidWallet = feeConfig.wallets?.some(w => w.address?.trim()) ?? false;
      const configToSave = {
        ...feeConfig,
        enabled: feeConfig.feeBps > 0 && hasValidWallet,
        feeAddress: feeConfig.wallets?.find(w => w.address?.trim())?.address || feeConfig.feeAddress || "",
      };
      const res = await adminFetch("/api/admin/white-label/fees", {
        method: "PATCH",
        body: JSON.stringify(configToSave),
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
        queryClient.invalidateQueries({ queryKey: ["/api/config/theme"] });
      } else {
        showStatus("error", "Failed to save points settings");
      }
    } catch {
      showStatus("error", "Failed to save points settings");
    } finally {
      setSavingPoints(false);
    }
  };

  const handleSaveTheme = async () => {
    setSavingTheme(true);
    try {
      const res = await adminFetch("/api/admin/white-label/theme", {
        method: "PATCH",
        body: JSON.stringify(localTheme),
      });
      if (res.ok) {
        showStatus("success", "Theme settings saved");
        queryClient.invalidateQueries({ queryKey: ["/api/config/theme"] });
      } else {
        showStatus("error", "Failed to save theme settings");
      }
    } catch {
      showStatus("error", "Failed to save theme settings");
    } finally {
      setSavingTheme(false);
    }
  };

  const handleSaveThemeWithData = async (theme: ThemeConfig) => {
    setSavingTheme(true);
    try {
      const res = await adminFetch("/api/admin/white-label/theme", {
        method: "PATCH",
        body: JSON.stringify(theme),
      });
      if (res.ok) {
        showStatus("success", "Theme saved and applied");
        queryClient.invalidateQueries({ queryKey: ["/api/config/theme"] });
      } else {
        showStatus("error", "Failed to save theme");
      }
    } catch {
      showStatus("error", "Failed to save theme");
    } finally {
      setSavingTheme(false);
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
              activeSection === "whitelabel" ? "default" : "secondary"
            }
            onClick={() => setActiveSection("whitelabel")}
            data-testid="button-section-whitelabel"
          >
            <Palette className="w-4 h-4 mr-1" />
            White Label
          </Button>
          <Button
            variant={activeSection === "referral" ? "default" : "secondary"}
            onClick={() => setActiveSection("referral")}
            data-testid="button-section-referral"
          >
            <Users className="w-4 h-4 mr-1" />
            Referral System
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
        {/* WHITE LABEL / THEME */}
        {/* ============================================================= */}
        {activeSection === "whitelabel" &&
          (wlLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : (
            <WhiteLabelSection
              localTheme={localTheme}
              setLocalTheme={setLocalTheme}
              activeThemeTab={activeThemeTab}
              setActiveThemeTab={setActiveThemeTab}
              onSave={handleSaveTheme}
              onSaveTheme={handleSaveThemeWithData}
              isSaving={savingTheme}
            />
          ))}

        {activeSection === "referral" && <ReferralAdminSection />}
      </div>
    </div>
  );
}
