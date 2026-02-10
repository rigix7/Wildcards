/**
 * Unified Admin Panel
 *
 * 7-tab admin CMS combining Wildcards auth with full PolyHouse features.
 * Tabs: Theme | Points | Fees | Events | Tags | Sport Configs | Players
 *
 * Password-protected via ADMIN_SECRET_KEY environment variable.
 * Bearer token persisted in localStorage for session.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Trash2, RefreshCw, Check, X, Link2, Loader2,
  ChevronDown, ChevronRight, Palette, DollarSign, Star, Users,
  Lock, LogOut, AlertTriangle, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { fetchSportsWithMarketTypes, type SportWithMarketTypes } from "@/lib/polymarket";
import type {
  Player, InsertPlayer, AdminSettings, Futures,
  SportMarketConfig, PolymarketTagRecord, FuturesCategory,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
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
  themeConfig?: Record<string, unknown> | null;
  feeConfig?: FeeConfig | null;
  pointsConfig?: PointsConfig | null;
  updatedAt: string;
}

interface ThemePreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  colors: {
    accent: string;
    accentHover: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
  };
}

interface ThemeColors {
  accent: string;
  accentHover: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
}

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

interface EnhancedSampleData {
  event: {
    id: string; title: string; slug?: string; description: string;
    startDate: string; endDate?: string; seriesSlug?: string;
  } | null;
  market: {
    id: string; conditionId?: string; slug?: string; question: string;
    groupItemTitle: string; sportsMarketType: string; subtitle?: string;
    extraInfo?: string; participantName?: string; teamAbbrev?: string;
    line?: number; outcomes: string; outcomePrices: string;
    bestAsk?: number; bestBid?: number; volume?: string; liquidity?: string;
    gameStartTime?: string; tokens?: unknown; spread?: number;
    active?: boolean; closed?: boolean; clobTokenIds?: string;
  } | null;
  rawMarket?: Record<string, unknown>;
  allMarketTypes: string[];
  availableMarketTypes?: string[];
  eventsSearched?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Theme Presets
// ---------------------------------------------------------------------------

const PRESET_THEMES: ThemePreset[] = [
  {
    id: "wildcards", name: "Wildcards", tagline: "Sporty & Bold",
    description: "High-energy sports betting aesthetic",
    colors: { accent: "#FF893C", accentHover: "#FF6B1A", background: "#0F0F0F", surface: "#1A1A1A", text: "#FFFFFF", textMuted: "#A1A1AA" },
  },
  {
    id: "professional", name: "Professional Blue", tagline: "Trust & Stability",
    description: "Corporate and trustworthy",
    colors: { accent: "#3B82F6", accentHover: "#2563EB", background: "#FFFFFF", surface: "#F9FAFB", text: "#111827", textMuted: "#6B7280" },
  },
  {
    id: "neon", name: "Neon Nights", tagline: "High Energy",
    description: "Vibrant cyber aesthetic",
    colors: { accent: "#00FF88", accentHover: "#00CC6F", background: "#0A0A0F", surface: "#1F1F2E", text: "#FFFFFF", textMuted: "#A5A5BA" },
  },
  {
    id: "luxury", name: "Luxury Gold", tagline: "Premium Feel",
    description: "Sophisticated and exclusive",
    colors: { accent: "#F59E0B", accentHover: "#D97706", background: "#1C1917", surface: "#292524", text: "#FAFAF9", textMuted: "#A8A29E" },
  },
  {
    id: "earth", name: "Earth Tones", tagline: "Natural & Approachable",
    description: "Warm and welcoming",
    colors: { accent: "#10B981", accentHover: "#059669", background: "#FEFCE8", surface: "#FEF9C3", text: "#1F2937", textMuted: "#6B7280" },
  },
  {
    id: "custom", name: "Custom", tagline: "Full Control",
    description: "Advanced customization",
    colors: { accent: "#8B5CF6", accentHover: "#7C3AED", background: "#FFFFFF", surface: "#F3F4F6", text: "#111827", textMuted: "#6B7280" },
  },
];

const DEFAULT_CUSTOM_COLORS: ThemeColors = {
  accent: "#8B5CF6", accentHover: "#7C3AED", background: "#FFFFFF",
  surface: "#F3F4F6", text: "#111827", textMuted: "#6B7280",
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function getAdminHeaders(): HeadersInit {
  const secret = localStorage.getItem("adminSecret");
  return { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
}

async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, headers: { ...getAdminHeaders(), ...(init?.headers || {}) } });
}

// ---------------------------------------------------------------------------
// Player form schema
// ---------------------------------------------------------------------------

const playerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  symbol: z.string().min(1, "Symbol is required").max(6, "Max 6 characters"),
  team: z.string().min(1, "Team is required"),
  sport: z.string().min(1, "Sport is required"),
  fundingTarget: z.number().min(1000, "Minimum 1,000"),
  fundingCurrent: z.number().min(0),
  status: z.enum(["offering", "available", "closed"]),
});
type PlayerFormData = z.infer<typeof playerFormSchema>;

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

// ---------------------------------------------------------------------------
// AdminPasswordPrompt
// ---------------------------------------------------------------------------

function AdminPasswordPrompt({ onAuthenticated }: { onAuthenticated: () => void }) {
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
        headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" },
      });
      if (res.ok) { localStorage.setItem("adminSecret", password); onAuthenticated(); }
      else { setError("Invalid admin password"); setPassword(""); }
    } catch { setError("Failed to verify password"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md p-8 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="flex items-center justify-center mb-6">
          <Lock className="w-12 h-12 text-zinc-400" />
        </div>
        <h1 className="text-2xl font-bold text-center text-white mb-2">Admin Access</h1>
        <p className="text-zinc-400 text-center mb-6">Enter your admin password to continue</p>
        <form onSubmit={handleSubmit}>
          <Input type="password" placeholder="Admin password" value={password}
            onChange={(e) => setPassword(e.target.value)} className="mb-4" autoFocus
            data-testid="input-admin-password" />
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !password} data-testid="button-unlock">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {loading ? "Verifying..." : "Unlock Admin Panel"}
          </Button>
        </form>
        <p className="text-xs text-zinc-500 mt-4 text-center">Set ADMIN_SECRET_KEY in your environment variables</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThemeSection (NEW - Walled Garden Preset Selector)
// ---------------------------------------------------------------------------

function ThemeSection({
  selectedTheme, setSelectedTheme, customColors, setCustomColors, onSave, isSaving,
}: {
  selectedTheme: string;
  setSelectedTheme: (id: string) => void;
  customColors: ThemeColors;
  setCustomColors: (c: ThemeColors) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const currentColors = selectedTheme === "custom"
    ? customColors
    : PRESET_THEMES.find((t) => t.id === selectedTheme)?.colors || PRESET_THEMES[0].colors;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white mb-2">Choose Your Theme</h3>
        <p className="text-sm text-zinc-400">Select a preset or customize your own</p>
      </div>

      {/* Theme Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {PRESET_THEMES.map((theme) => (
          <button key={theme.id} onClick={() => setSelectedTheme(theme.id)}
            className={`relative p-4 rounded-lg border-2 transition-all text-left ${
              selectedTheme === theme.id
                ? "border-white bg-white/5"
                : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            <div className="h-20 rounded mb-3 flex items-center justify-center"
              style={{ backgroundColor: theme.colors.background, border: `2px solid ${theme.colors.accent}` }}>
              <div className="px-3 py-1.5 rounded font-bold text-sm"
                style={{ backgroundColor: theme.colors.accent, color: theme.colors.background }}>
                Preview
              </div>
            </div>
            <div className="font-bold text-white text-sm">{theme.name}</div>
            <div className="text-xs text-zinc-400">{theme.tagline}</div>
            {selectedTheme === theme.id && (
              <div className="absolute top-2 right-2">
                <Check className="w-5 h-5 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Live Preview */}
      <Card className="p-6">
        <h4 className="font-bold text-white mb-4">Live Preview</h4>
        <div className="p-6 rounded-lg" style={{ backgroundColor: currentColors.background, color: currentColors.text }}>
          <h5 className="text-lg font-bold mb-2">Sample Interface</h5>
          <p className="mb-4" style={{ color: currentColors.textMuted }}>
            This is how your interface will look with these colors
          </p>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded font-bold text-sm"
              style={{ backgroundColor: currentColors.accent, color: currentColors.background }}>
              Action Button
            </button>
            <div className="px-4 py-2 rounded text-sm"
              style={{ backgroundColor: currentColors.surface, color: currentColors.text }}>
              Surface Card
            </div>
          </div>
        </div>
      </Card>

      {/* Custom color pickers */}
      {selectedTheme === "custom" && (
        <Card className="p-4 space-y-4">
          <h4 className="font-bold text-white">Fine-tune Colors</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(Object.keys(customColors) as Array<keyof ThemeColors>).map((key) => (
              <div key={key}>
                <Label className="text-xs text-zinc-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={customColors[key]}
                    onChange={(e) => setCustomColors({ ...customColors, [key]: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border border-zinc-700" />
                  <Input value={customColors[key]} className="font-mono text-sm"
                    onChange={(e) => setCustomColors({ ...customColors, [key]: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Button onClick={onSave} className="w-full" disabled={isSaving} data-testid="button-save-theme">
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Theme Settings
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeeSection
// ---------------------------------------------------------------------------

function FeeSection({
  feeConfig, setFeeConfig, onSave, isSaving,
}: {
  feeConfig: FeeConfig; setFeeConfig: (cfg: FeeConfig) => void;
  onSave: () => void; isSaving: boolean;
}) {
  const walletsValid = !feeConfig.wallets || feeConfig.wallets.length === 0 ||
    Math.abs(feeConfig.wallets.reduce((s, w) => s + (w.percentage || 0), 0) - 100) <= 0.01;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-bold flex items-center gap-2 text-white">
          <DollarSign className="w-5 h-5" /> Fee Configuration
        </h3>
        <p className="text-sm text-zinc-500">Configure platform fees collected on successful bets</p>
      </div>

      {/* Fee rate */}
      <div>
        <Label className="text-sm">Fee Rate (Basis Points)</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input type="number" min={0} max={1000} value={feeConfig.feeBps}
            onChange={(e) => setFeeConfig({ ...feeConfig, feeBps: parseInt(e.target.value) || 0 })}
            className="font-mono w-32" data-testid="input-fee-bps" />
          <span className="text-zinc-400 text-sm whitespace-nowrap">
            = {((feeConfig.feeBps || 0) / 100).toFixed(2)}%
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">100 bps = 1%. Max 1000 bps (10%)</p>
      </div>

      {/* Show fee in UI toggle */}
      <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-4">
        <div>
          <Label className="text-sm font-medium">Show Fee Breakdown to Users</Label>
          <p className="text-xs text-zinc-500 mt-1">Display fee calculation in the betting interface</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={feeConfig.showFeeInUI ?? false}
            onChange={(e) => setFeeConfig({ ...feeConfig, showFeeInUI: e.target.checked })}
            className="sr-only peer" data-testid="toggle-show-fee-ui" />
          <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
        </label>
      </div>

      {/* Multi-wallet */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Fee Recipients</Label>
          <Button size="sm" variant="outline" data-testid="button-add-wallet"
            onClick={() => setFeeConfig({ ...feeConfig, wallets: [...(feeConfig.wallets || []), { address: "", percentage: 0, label: "" }] })}>
            <Plus className="w-4 h-4 mr-1" /> Add Wallet
          </Button>
        </div>

        {(!feeConfig.wallets || feeConfig.wallets.length === 0) && (
          <div className="text-sm text-zinc-500 bg-zinc-800/50 rounded-lg p-3">
            No fee recipients configured. Add wallets to split fees between multiple addresses.
          </div>
        )}

        {feeConfig.wallets?.map((wallet, index) => (
          <div key={index} className="flex items-start gap-2 bg-zinc-800/50 rounded-lg p-3">
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-zinc-500">Label</Label>
                  <Input value={wallet.label || ""} placeholder="Platform, Operator..."
                    className="text-sm" data-testid={`input-wallet-label-${index}`}
                    onChange={(e) => { const ws = [...(feeConfig.wallets || [])]; ws[index] = { ...wallet, label: e.target.value }; setFeeConfig({ ...feeConfig, wallets: ws }); }} />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Wallet Address</Label>
                  <Input value={wallet.address} placeholder="0x..." className="font-mono text-sm"
                    data-testid={`input-wallet-address-${index}`}
                    onChange={(e) => { const ws = [...(feeConfig.wallets || [])]; ws[index] = { ...wallet, address: e.target.value }; setFeeConfig({ ...feeConfig, wallets: ws }); }} />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Share (%)</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} max={100} value={wallet.percentage}
                      className="font-mono text-sm" data-testid={`input-wallet-percentage-${index}`}
                      onChange={(e) => { const ws = [...(feeConfig.wallets || [])]; ws[index] = { ...wallet, percentage: parseFloat(e.target.value) || 0 }; setFeeConfig({ ...feeConfig, wallets: ws }); }} />
                    <span className="text-zinc-400">%</span>
                  </div>
                </div>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="text-zinc-500 hover:text-red-400"
              data-testid={`button-remove-wallet-${index}`}
              onClick={() => { const ws = [...(feeConfig.wallets || [])]; ws.splice(index, 1); setFeeConfig({ ...feeConfig, wallets: ws }); }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}

        {feeConfig.wallets && feeConfig.wallets.length > 0 && (() => {
          const total = feeConfig.wallets!.reduce((s, w) => s + (w.percentage || 0), 0);
          return Math.abs(total - 100) > 0.01 ? (
            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-400/10 rounded-lg p-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Wallet shares must total 100% (currently {total.toFixed(1)}%)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-400/10 rounded-lg p-2">
              <Check className="w-4 h-4" />
              <span>Shares total 100% - configuration valid</span>
            </div>
          );
        })()}
      </div>

      {/* Fee preview */}
      {feeConfig.feeBps > 0 && feeConfig.wallets && feeConfig.wallets.length > 0 && (
        <div className="bg-zinc-800 rounded-lg p-3 space-y-2">
          <div className="text-sm text-zinc-400">Fee Distribution Preview (on $100 bet)</div>
          <div className="text-sm text-white">
            Total fee: <span className="font-bold text-wild-gold">${((100 * feeConfig.feeBps) / 10000).toFixed(2)}</span>
          </div>
          <div className="space-y-1">
            {feeConfig.wallets.map((wallet, i) => (
              <div key={i} className="flex justify-between text-xs text-zinc-400">
                <span>{wallet.label || `Wallet ${i + 1}`}</span>
                <span className="font-mono">
                  ${(((100 * feeConfig.feeBps) / 10000) * (wallet.percentage / 100)).toFixed(4)} ({wallet.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button onClick={onSave} disabled={isSaving || !walletsValid} data-testid="button-save-fees">
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Fee Settings
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PointsSection
// ---------------------------------------------------------------------------

function PointsSection({
  pointsConfig, setPointsConfig, onSave, isSaving,
}: {
  pointsConfig: PointsConfig; setPointsConfig: (cfg: PointsConfig) => void;
  onSave: () => void; isSaving: boolean;
}) {
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-bold flex items-center gap-2 text-white">
          <Star className="w-5 h-5" /> Points System Configuration
        </h3>
        <p className="text-sm text-zinc-500">Configure the points/rewards system</p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-4">
        <div>
          <Label className="text-sm font-medium">Enable Points System</Label>
          <p className="text-xs text-zinc-500 mt-1">When disabled, points will be hidden throughout the app</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={pointsConfig.enabled}
            onChange={(e) => setPointsConfig({ ...pointsConfig, enabled: e.target.checked })}
            className="sr-only peer" data-testid="toggle-points-enabled" />
          <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
        </label>
      </div>

      <div>
        <Label className="text-sm">Points Name</Label>
        <Input value={pointsConfig.name} placeholder="WILD" className="mt-1 font-mono"
          data-testid="input-points-name"
          onChange={(e) => setPointsConfig({ ...pointsConfig, name: e.target.value })} />
        <p className="text-xs text-zinc-500 mt-1">The name displayed for points (e.g., "WILD", "Points", "Rewards")</p>
      </div>

      <div>
        <Label className="text-sm">Reset Schedule</Label>
        <Select value={pointsConfig.resetSchedule}
          onValueChange={(value: PointsConfig["resetSchedule"]) => setPointsConfig({ ...pointsConfig, resetSchedule: value })}>
          <SelectTrigger className="mt-1" data-testid="select-reset-schedule"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="never">Never reset</SelectItem>
            <SelectItem value="weekly">Reset weekly</SelectItem>
            <SelectItem value="monthly">Reset monthly</SelectItem>
            <SelectItem value="yearly">Reset yearly</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500 mt-1">When to reset user points to zero</p>
      </div>

      {/* Referral system */}
      <div className="border-t border-zinc-700 pt-4">
        <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-4 mb-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" /> Enable Referral System
            </Label>
            <p className="text-xs text-zinc-500 mt-1">Allow users to earn points from referrals</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={pointsConfig.referralEnabled}
              onChange={(e) => setPointsConfig({ ...pointsConfig, referralEnabled: e.target.checked })}
              className="sr-only peer" data-testid="toggle-referral-enabled" />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
          </label>
        </div>
        {pointsConfig.referralEnabled && (
          <div>
            <Label className="text-sm">Referral Percentage</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min={0} max={100} value={pointsConfig.referralPercentage}
                className="font-mono w-24" data-testid="input-referral-percentage"
                onChange={(e) => setPointsConfig({ ...pointsConfig, referralPercentage: parseInt(e.target.value) || 0 })} />
              <span className="text-zinc-400">%</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Percentage of referred user's earned points that go to the referrer</p>
          </div>
        )}
      </div>

      <Button onClick={onSave} disabled={isSaving} data-testid="button-save-points">
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Points Settings
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WildPointsManager (Points Dashboard - from PolyHouse)
// ---------------------------------------------------------------------------

function WildPointsManager() {
  const { data: wallets = [], isLoading } = useQuery<WildWallet[]>({ queryKey: ["/api/admin/wild-points"] });
  const totalPoints = wallets.reduce((sum, w) => sum + (w.polymarketWildPoints || w.calculatedWildPoints || 0), 0);
  const totalActivity = wallets.reduce((sum, w) => sum + (w.activityCount || 0), 0);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (isLoading) return <div className="text-zinc-500">Loading wallets...</div>;

  return (
    <div className="space-y-4 mt-6">
      <div>
        <h3 className="text-lg font-bold text-white">Points Dashboard</h3>
        <p className="text-sm text-zinc-500">Track points for all users. 1 USDC spent = 1 point.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Users</div>
          <div className="text-2xl font-bold font-mono text-white">{wallets.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Points</div>
          <div className="text-2xl font-bold font-mono text-wild-gold">{totalPoints.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Activity</div>
          <div className="text-2xl font-bold font-mono text-white">{totalActivity}</div>
        </Card>
      </div>

      {wallets.length === 0 ? (
        <Card className="p-8 text-center text-zinc-500">No users with wallet records yet.</Card>
      ) : (
        <Card className="divide-y divide-zinc-800">
          <div className="p-3 bg-zinc-900/50 grid grid-cols-12 gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <div className="col-span-3">EOA Wallet</div>
            <div className="col-span-3">Safe Wallet</div>
            <div className="col-span-2 text-right">Points</div>
            <div className="col-span-2 text-right">Activity</div>
            <div className="col-span-2 text-right">Joined</div>
          </div>
          {wallets.map((wallet, i) => {
            const pts = wallet.polymarketWildPoints || wallet.calculatedWildPoints || 0;
            return (
              <div key={wallet.address} className="p-3 grid grid-cols-12 gap-2 items-center" data-testid={`wild-wallet-${i}`}>
                <div className="col-span-3 font-mono text-sm truncate text-white" title={wallet.address}>{formatAddress(wallet.address)}</div>
                <div className="col-span-3 font-mono text-sm truncate text-zinc-500" title={wallet.safeAddress || ""}>{wallet.safeAddress ? formatAddress(wallet.safeAddress) : "-"}</div>
                <div className="col-span-2 text-right font-mono font-bold text-wild-gold">{pts.toLocaleString()}</div>
                <div className="col-span-2 text-right font-mono text-zinc-400">{wallet.activityCount || 0}</div>
                <div className="col-span-2 text-right text-xs text-zinc-500">{formatDate(wallet.createdAt)}</div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SportConfigEditor (from PolyHouse)
// ---------------------------------------------------------------------------

function SportConfigEditor({
  sportsData, toast,
}: {
  sportsData: SportWithMarketTypes[];
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [selectedSport, setSelectedSport] = useState<string>("");
  const [selectedMarketType, setSelectedMarketType] = useState<string>("");
  const [availableMarketTypes, setAvailableMarketTypes] = useState<{ type: string; label: string; count: number; sampleQuestion: string }[]>([]);
  const [sampleData, setSampleData] = useState<EnhancedSampleData | null>(null);
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
    outcomeStrategy: { type: "default" } as { type: string; fallback?: string; regex?: string; template?: string },
    notes: "",
  });

  const { data: configs = [] } = useQuery<SportMarketConfig[]>({ queryKey: ["/api/admin/sport-market-configs"] });

  const saveConfigMutation = useMutation({
    mutationFn: async (data: {
      sportSlug: string; sportLabel: string; marketType: string; marketTypeLabel?: string;
      titleField: string; buttonLabelField: string; betSlipTitleField: string;
      useQuestionForTitle: boolean; showLine: boolean; lineFieldPath?: string;
      lineFormatter?: string; outcomeStrategy?: { type: string; fallback?: string; regex?: string; template?: string };
      sampleData?: Record<string, unknown>; notes?: string;
    }) => apiRequest("POST", "/api/admin/sport-market-configs", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/sport-market-configs"] }); toast({ title: "Configuration saved" }); },
    onError: () => { toast({ title: "Failed to save config", variant: "destructive" }); },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async ({ sportSlug, marketType }: { sportSlug: string; marketType: string }) =>
      apiRequest("DELETE", `/api/admin/sport-market-configs/${sportSlug}/${marketType}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/sport-market-configs"] }); toast({ title: "Config deleted" }); },
  });

  const handleSelectSport = async (sportId: string) => {
    setSelectedSport(sportId); setSelectedMarketType(""); setSampleData(null); setAvailableMarketTypes([]);
    const sport = sportsData.find((s) => s.id === sportId);
    if (!sport) return;
    setLoadingMarketTypes(true);
    try {
      const response = await fetch(`/api/admin/sport-market-types/${sport.seriesId}`);
      const data = await response.json();
      setAvailableMarketTypes(data.marketTypes || []);
      setEventsScanned(data.eventsScanned || 0);
    } catch { setAvailableMarketTypes([]); setEventsScanned(0); }
    finally { setLoadingMarketTypes(false); }
  };

  const handleSelectMarketType = async (marketType: string) => {
    setSelectedMarketType(marketType);
    const sport = sportsData.find((s) => s.id === selectedSport);
    if (!sport) return;

    const existing = configs.find((c) => c.sportSlug === sport.slug && c.marketType === marketType);
    if (existing) {
      setFormData({
        titleField: existing.titleField, buttonLabelField: existing.buttonLabelField,
        betSlipTitleField: existing.betSlipTitleField, useQuestionForTitle: existing.useQuestionForTitle,
        showLine: existing.showLine, lineFieldPath: existing.lineFieldPath || "line",
        lineFormatter: existing.lineFormatter || "default",
        outcomeStrategy: existing.outcomeStrategy || { type: "default" }, notes: existing.notes || "",
      });
    } else {
      const isSpreads = marketType.includes("spread") || marketType.includes("handicap");
      const isTotals = marketType.includes("total") || marketType.includes("over_under");
      setFormData({
        titleField: "groupItemTitle", buttonLabelField: "outcomes", betSlipTitleField: "question",
        useQuestionForTitle: false, showLine: isSpreads || isTotals, lineFieldPath: "line",
        lineFormatter: isSpreads ? "spread" : isTotals ? "total" : "default",
        outcomeStrategy: { type: "default" }, notes: "",
      });
    }

    setLoadingSample(true);
    try {
      const response = await fetch(`/api/admin/sport-sample-v2/${sport.seriesId}/${marketType}`);
      setSampleData(await response.json());
    } catch { /* ignore */ }
    finally { setLoadingSample(false); }
  };

  const handleSave = () => {
    const sport = sportsData.find((s) => s.id === selectedSport);
    if (!sport || !selectedMarketType) return;
    saveConfigMutation.mutate({
      sportSlug: sport.slug, sportLabel: sport.label, marketType: selectedMarketType,
      marketTypeLabel: selectedMarketType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      ...formData, sampleData: sampleData?.market as Record<string, unknown> | undefined,
    });
  };

  const availableFields = [
    { value: "question", label: "question - Full question text" },
    { value: "groupItemTitle", label: "groupItemTitle - Short market title" },
    { value: "sportsMarketType", label: "sportsMarketType - Market type label" },
    { value: "outcomes", label: "outcomes - Outcome labels" },
    { value: "subtitle", label: "subtitle - Additional context" },
    { value: "extraInfo", label: "extraInfo - Extra market info" },
  ];

  const outcomeStrategies = [
    { value: "default", label: "Default - Use raw outcome labels" },
    { value: "team_abbrev", label: "Team Abbreviation - Parse team abbreviations" },
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
    if (typeof value === "string") return value.length > 50 ? value.slice(0, 50) + "..." : value;
    return String(value);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Sport + Market Type Configuration</h2>
        <p className="text-sm text-zinc-500">Configure display settings for each sport and bet type combination</p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>1. Select Sport</Label>
            <Select value={selectedSport} onValueChange={handleSelectSport}>
              <SelectTrigger data-testid="select-sport-config"><SelectValue placeholder="Choose a sport..." /></SelectTrigger>
              <SelectContent>
                {sportsData.map((sport) => {
                  const configCount = configs.filter((c) => c.sportSlug === sport.slug).length;
                  return (
                    <SelectItem key={sport.id} value={sport.id}>
                      {sport.label}{configCount > 0 && ` (${configCount} configs)`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>2. Select Market Type</Label>
            <Select value={selectedMarketType} onValueChange={handleSelectMarketType}
              disabled={!selectedSport || loadingMarketTypes || availableMarketTypes.length === 0}>
              <SelectTrigger data-testid="select-market-type">
                <SelectValue placeholder={loadingMarketTypes ? "Loading market types..." : "Choose bet type..."} />
              </SelectTrigger>
              <SelectContent>
                {availableMarketTypes.map((mt) => {
                  const sport = sportsData.find((s) => s.id === selectedSport);
                  const hasConfig = sport && configs.some((c) => c.sportSlug === sport.slug && c.marketType === mt.type);
                  return <SelectItem key={mt.type} value={mt.type}>{mt.label} ({mt.count}){hasConfig ? " - configured" : ""}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {eventsScanned > 0 && (
              <p className="text-xs text-zinc-500">Found {availableMarketTypes.length} market types from {eventsScanned} events</p>
            )}
          </div>
        </div>

        {selectedSport && selectedMarketType && (
          <>
            <div className="border-t border-zinc-800 pt-4">
              <h3 className="font-medium text-zinc-300 mb-3">Field Mappings</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Market Title Field", key: "titleField" },
                  { label: "Button Labels Field", key: "buttonLabelField" },
                  { label: "Bet Slip Title", key: "betSlipTitleField" },
                ].map(({ label, key }) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Select value={(formData as Record<string, string>)[key]}
                      onValueChange={(v) => setFormData((prev) => ({ ...prev, [key]: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{availableFields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="text-xs text-zinc-500 truncate">Preview: {getFieldPreview((formData as Record<string, string>)[key])}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <h3 className="font-medium text-zinc-300 mb-3">Line &amp; Outcome Display</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Show Line Number</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox checked={formData.showLine}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, showLine: checked as boolean }))}
                      data-testid="checkbox-show-line" />
                    <span className="text-sm text-zinc-400">Display line (e.g., 246.5, +12.5)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Line Formatter</Label>
                  <Select value={formData.lineFormatter}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, lineFormatter: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{lineFormatters.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Outcome Strategy</Label>
                  <Select value={formData.outcomeStrategy.type}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, outcomeStrategy: { ...prev.outcomeStrategy, type: v } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{outcomeStrategies.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Checkbox checked={formData.useQuestionForTitle}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, useQuestionForTitle: checked as boolean }))}
                  data-testid="checkbox-use-question" />
                <span className="text-sm text-zinc-400">Use question field for market title (overrides title field selection)</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={formData.notes} placeholder="Add notes about this configuration..."
                data-testid="input-notes"
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>

            <Button onClick={handleSave} disabled={saveConfigMutation.isPending} className="w-full" data-testid="button-save-config">
              {saveConfigMutation.isPending ? "Saving..." : `Save ${selectedMarketType.replace(/_/g, " ")} Configuration`}
            </Button>
          </>
        )}
      </Card>

      {/* Sample data viewer */}
      {selectedSport && sampleData?.market && (
        <Card className="p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-zinc-300">Sample API Data</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowRawJson(!showRawJson)}>
              {showRawJson ? "Hide Raw JSON" : "Show Raw JSON"}
            </Button>
          </div>
          {showRawJson ? (
            <div className="p-3 bg-zinc-900 rounded text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
              <pre>{JSON.stringify(sampleData.rawMarket || sampleData.market, null, 2)}</pre>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(sampleData.market).map(([key, value]) => (
                <div key={key} className="p-2 bg-zinc-900 rounded">
                  <span className="text-blue-400 font-mono">{key}:</span>{" "}
                  <span className="text-green-400">
                    {typeof value === "object" ? JSON.stringify(value).slice(0, 60) + "..." : String(value).slice(0, 60)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {sampleData?.eventsSearched && (
            <div className="text-xs text-zinc-400">Sample from searching {sampleData.eventsSearched} events</div>
          )}
        </Card>
      )}

      {/* Saved configs */}
      {configs.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-bold text-zinc-300">Saved Configurations ({configs.length})</h3>
          <div className="space-y-2">
            {configs.map((config) => (
              <div key={config.id} className="p-3 bg-zinc-900 rounded flex justify-between items-start gap-2"
                data-testid={`config-${config.sportSlug}-${config.marketType}`}>
                <div className="text-sm min-w-0 flex-1">
                  <div className="font-medium text-white">{config.sportLabel} - {config.marketType.replace(/_/g, " ")}</div>
                  <div className="text-zinc-500 text-xs space-y-0.5">
                    <div>Title: {config.titleField} | Buttons: {config.buttonLabelField}</div>
                    <div className="flex flex-wrap gap-1">
                      {config.showLine && <span className="text-wild-trade">Shows line</span>}
                      {config.useQuestionForTitle && <span className="text-wild-brand">Uses question</span>}
                      {config.outcomeStrategy && <span className="text-wild-scout">Strategy: {(config.outcomeStrategy as { type: string }).type}</span>}
                    </div>
                    {config.notes && <div className="text-zinc-600 italic truncate">{config.notes}</div>}
                  </div>
                </div>
                <Button variant="destructive" size="icon" disabled={deleteConfigMutation.isPending}
                  data-testid={`delete-config-${config.sportSlug}-${config.marketType}`}
                  onClick={() => deleteConfigMutation.mutate({ sportSlug: config.sportSlug, marketType: config.marketType })}>
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

// ---------------------------------------------------------------------------
// Main Admin Page (Auth Wrapper)
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("adminSecret");
    if (!stored) { setIsChecking(false); return; }
    fetch("/api/admin/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${stored}`, "Content-Type": "application/json" },
    })
      .then((res) => { if (res.ok) setIsAuthenticated(true); else localStorage.removeItem("adminSecret"); })
      .catch(() => localStorage.removeItem("adminSecret"))
      .finally(() => setIsChecking(false));
  }, []);

  if (isChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-950"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>;
  }
  if (!isAuthenticated) {
    return <AdminPasswordPrompt onAuthenticated={() => setIsAuthenticated(true)} />;
  }
  return <AuthenticatedAdmin onLogout={() => { localStorage.removeItem("adminSecret"); setIsAuthenticated(false); }} />;
}

// ---------------------------------------------------------------------------
// AuthenticatedAdmin - All 7 tabs
// ---------------------------------------------------------------------------

type AdminTab = "theme" | "points" | "fees" | "events" | "tags" | "sportConfigs" | "players";

function AuthenticatedAdmin({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>("theme");
  const [isLoading, setIsLoading] = useState(true);

  // White-label config state (loaded via adminFetch)
  const [selectedTheme, setSelectedTheme] = useState("wildcards");
  const [customColors, setCustomColors] = useState<ThemeColors>({ ...DEFAULT_CUSTOM_COLORS });
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({ feeBps: 0 });
  const [pointsConfig, setPointsConfig] = useState<PointsConfig>({
    enabled: false, name: "WILD", resetSchedule: "never", referralEnabled: false, referralPercentage: 10,
  });
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingFees, setSavingFees] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);

  // PolyHouse feature state
  const [sportsData, setSportsData] = useState<SportWithMarketTypes[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [futuresSlug, setFuturesSlug] = useState("");
  const [fetchingEvent, setFetchingEvent] = useState(false);
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const playerForm = useForm<PlayerFormData>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: { name: "", symbol: "", team: "", sport: "Basketball", fundingTarget: 100000, fundingCurrent: 0, status: "offering" },
  });

  // React Query hooks
  const { data: players = [], isLoading: playersLoading } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { data: futuresList = [], isLoading: futuresLoading } = useQuery<Futures[]>({ queryKey: ["/api/futures"] });
  const { data: adminSettings } = useQuery<AdminSettings>({ queryKey: ["/api/admin/settings"] });
  const { data: polymarketTags = [], isLoading: tagsLoading } = useQuery<PolymarketTagRecord[]>({ queryKey: ["/api/admin/tags"] });
  const { data: futuresCategories = [], isLoading: categoriesLoading } = useQuery<FuturesCategory[]>({ queryKey: ["/api/futures-categories"] });

  // Load white-label config on mount
  useEffect(() => {
    setIsLoading(true);
    adminFetch("/api/admin/white-label")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        const data: WhiteLabelConfig = await res.json();
        if (data.feeConfig) setFeeConfig(data.feeConfig);
        if (data.pointsConfig) setPointsConfig(data.pointsConfig);
        if (data.themeConfig) {
          const tc = data.themeConfig as { selectedTheme?: string; customColors?: ThemeColors };
          if (tc.selectedTheme) setSelectedTheme(tc.selectedTheme);
          if (tc.customColors) setCustomColors(tc.customColors);
        }
      })
      .catch((err) => console.error("[Admin] Failed to load config:", err))
      .finally(() => setIsLoading(false));
  }, []);

  // Load sports data for matchday/sport configs tabs
  const loadSportsLeagues = async () => {
    setLoadingLeagues(true);
    try { setSportsData(await fetchSportsWithMarketTypes()); }
    catch { toast({ title: "Failed to load sports tags", variant: "destructive" }); }
    finally { setLoadingLeagues(false); }
  };

  useEffect(() => {
    if ((activeTab === "tags" || activeTab === "sportConfigs") && sportsData.length === 0) {
      loadSportsLeagues();
    }
  }, [activeTab]);

  // Mutations
  const syncTagsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/tags/sync", {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/tags/enabled"] }); toast({ title: "Tags extracted from current events" }); },
    onError: () => toast({ title: "Failed to sync tags", variant: "destructive" }),
  });

  const toggleTagMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => apiRequest("PATCH", `/api/admin/tags/${id}/enabled`, { enabled }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/tags/enabled"] }); },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: Partial<AdminSettings>) => apiRequest("PATCH", "/api/admin/settings", updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] }); toast({ title: "Settings saved" }); },
  });

  const createFuturesMutation = useMutation({
    mutationFn: (future: { polymarketSlug: string; polymarketEventId?: string; title: string; description?: string; imageUrl?: string; startDate?: string; endDate?: string; marketData?: { question: string; outcomes: Array<{ label: string; probability: number; odds: number; marketId?: string; conditionId?: string }>; volume: number; liquidity: number; conditionId: string } }) =>
      apiRequest("POST", "/api/futures", future),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/futures"] }); toast({ title: "Future event added" }); setFuturesSlug(""); },
    onError: () => toast({ title: "Failed to add futures event", variant: "destructive" }),
  });

  const deleteFuturesMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/futures/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/futures"] }); toast({ title: "Future event removed" }); },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => {
      const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      return apiRequest("POST", "/api/futures-categories", { name, slug, sortOrder: futuresCategories.length });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/futures-categories"] }); setNewCategoryName(""); toast({ title: "Category created" }); },
    onError: () => toast({ title: "Failed to create category", variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => {
      const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      return apiRequest("PATCH", `/api/futures-categories/${id}`, { name, slug });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/futures-categories"] }); setEditingCategoryId(null); setEditingCategoryName(""); toast({ title: "Category updated" }); },
    onError: () => toast({ title: "Failed to update category", variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/futures-categories/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/futures-categories"] }); queryClient.invalidateQueries({ queryKey: ["/api/futures"] }); toast({ title: "Category deleted" }); },
    onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
  });

  const updateFuturesCategoryMutation = useMutation({
    mutationFn: ({ futuresId, categoryId }: { futuresId: string; categoryId: number | null }) =>
      apiRequest("PATCH", `/api/futures/${futuresId}/category`, { categoryId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/futures"] }),
  });

  const createPlayerMutation = useMutation({
    mutationFn: (player: InsertPlayer) => apiRequest("POST", "/api/players", player),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/players"] }); toast({ title: "Player created" }); setShowPlayerForm(false); playerForm.reset(); },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/players/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/players"] }); toast({ title: "Player deleted" }); },
  });

  // Handlers
  const handleSaveTheme = async () => {
    setSavingTheme(true);
    try {
      const res = await adminFetch("/api/admin/white-label/theme", {
        method: "PATCH",
        body: JSON.stringify({ selectedTheme, customColors: selectedTheme === "custom" ? customColors : null }),
      });
      if (res.ok) toast({ title: "Theme saved successfully" });
      else toast({ title: "Failed to save theme", variant: "destructive" });
    } catch { toast({ title: "Failed to save theme", variant: "destructive" }); }
    finally { setSavingTheme(false); }
  };

  const handleSaveFees = async () => {
    setSavingFees(true);
    try {
      const res = await adminFetch("/api/admin/white-label/fees", { method: "PATCH", body: JSON.stringify(feeConfig) });
      if (res.ok) toast({ title: "Fee settings saved" });
      else toast({ title: "Failed to save fee settings", variant: "destructive" });
    } catch { toast({ title: "Failed to save fee settings", variant: "destructive" }); }
    finally { setSavingFees(false); }
  };

  const handleSavePoints = async () => {
    setSavingPoints(true);
    try {
      const res = await adminFetch("/api/admin/white-label/points", { method: "PATCH", body: JSON.stringify(pointsConfig) });
      if (res.ok) toast({ title: "Points settings saved" });
      else toast({ title: "Failed to save points settings", variant: "destructive" });
    } catch { toast({ title: "Failed to save points settings", variant: "destructive" }); }
    finally { setSavingPoints(false); }
  };

  const handleMarketTypeToggle = (tagId: string, checked: boolean) => {
    const currentTags = adminSettings?.activeTagIds || [];
    const newTags = checked ? Array.from(new Set([...currentTags, tagId])) : currentTags.filter((id) => id !== tagId);
    updateSettingsMutation.mutate({ activeTagIds: newTags });
  };

  const handleSportToggleAll = (sport: SportWithMarketTypes, checked: boolean) => {
    const currentTags = adminSettings?.activeTagIds || [];
    const sportIds = sport.marketTypes.map((mt) => mt.id);
    const newTags = checked ? Array.from(new Set([...currentTags, ...sportIds])) : currentTags.filter((id) => !sportIds.includes(id));
    updateSettingsMutation.mutate({ activeTagIds: newTags });
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
      if (newSet.has(sportId)) newSet.delete(sportId); else newSet.add(sportId);
      return newSet;
    });
  };

  const getActiveSportsInfo = () => {
    const currentTags = adminSettings?.activeTagIds || [];
    return sportsData
      .map((sport) => ({ sport, marketTypes: sport.marketTypes.filter((mt) => currentTags.includes(mt.id)).map((mt) => mt.label) }))
      .filter(({ marketTypes }) => marketTypes.length > 0);
  };

  const handleAddFutures = async () => {
    if (!futuresSlug.trim()) { toast({ title: "Please enter a Polymarket event slug or URL", variant: "destructive" }); return; }
    setFetchingEvent(true);
    try {
      const slug = extractSlugFromInput(futuresSlug);
      const response = await fetch(`/api/polymarket/event-by-slug?slug=${encodeURIComponent(slug)}`);
      if (!response.ok) { toast({ title: "Event not found on Polymarket", variant: "destructive" }); return; }
      const result = await response.json();
      const eventData = result.data;

      if (result.type === "event") {
        const markets = eventData.markets || [];
        let marketData = undefined;
        if (markets.length > 0) {
          try {
            const allOutcomes: Array<{ label: string; probability: number; odds: number; marketId?: string; conditionId?: string }> = [];
            let totalVolume = 0, totalLiquidity = 0;
            for (const market of markets) {
              const prices = JSON.parse(market.outcomePrices || "[]");
              const outcomes = JSON.parse(market.outcomes || "[]");
              totalVolume += parseFloat(market.volume || "0");
              totalLiquidity += parseFloat(market.liquidity || "0");
              outcomes.forEach((outcomeName: string, i: number) => {
                const prob = parseFloat(prices[i] || "0");
                if (outcomeName.toLowerCase() === "yes" || markets.length === 1) {
                  let displayLabel = outcomeName;
                  if (markets.length > 1) {
                    displayLabel = market.groupItemTitle || market.question?.replace(/^Will /i, "").replace(/ (finish|win|be|make|qualify|reach|place|get|score|have|become).*$/i, "")?.trim() || outcomeName;
                  }
                  allOutcomes.push({ label: displayLabel, probability: prob, odds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 99, marketId: market.id, conditionId: market.conditionId });
                }
              });
            }
            allOutcomes.sort((a, b) => b.probability - a.probability);
            marketData = { question: eventData.title, outcomes: allOutcomes, volume: totalVolume, liquidity: totalLiquidity, conditionId: markets[0]?.conditionId || "" };
          } catch (e) { console.error("Failed to parse market data:", e); }
        }
        await createFuturesMutation.mutateAsync({ polymarketSlug: slug, polymarketEventId: eventData.id, title: eventData.title, description: eventData.description, imageUrl: eventData.image, startDate: eventData.startDate, endDate: eventData.endDate, marketData });
      } else if (result.type === "market") {
        let marketData = undefined;
        try {
          const prices = JSON.parse(eventData.outcomePrices || "[]");
          const outcomes = JSON.parse(eventData.outcomes || "[]");
          marketData = { question: eventData.question, outcomes: outcomes.map((label: string, i: number) => { const prob = parseFloat(prices[i] || "0"); return { label, probability: prob, odds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 99 }; }), volume: parseFloat(eventData.volume || "0"), liquidity: parseFloat(eventData.liquidity || "0"), conditionId: eventData.conditionId || "" };
        } catch (e) { console.error("Failed to parse market data:", e); }
        await createFuturesMutation.mutateAsync({ polymarketSlug: slug, polymarketEventId: eventData.id, title: eventData.question || slug, description: eventData.description, marketData });
      }
    } catch { toast({ title: "Failed to fetch event details", variant: "destructive" }); }
    finally { setFetchingEvent(false); }
  };

  const onSubmitPlayer = (data: PlayerFormData) => {
    const fundingPercentage = Math.round((data.fundingCurrent / data.fundingTarget) * 100);
    const avatarInitials = data.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    createPlayerMutation.mutate({
      name: data.name, symbol: data.symbol.toUpperCase(), team: data.team, sport: data.sport,
      avatarInitials, fundingTarget: data.fundingTarget, fundingCurrent: data.fundingCurrent,
      fundingPercentage, generation: 1, status: data.status,
      stats: data.status === "available" ? { holders: Math.floor(Math.random() * 500) + 50, marketCap: data.fundingTarget, change24h: 0 } : undefined,
    });
  };

  // Tab config
  const tabs: { id: AdminTab; label: string; icon?: React.ReactNode }[] = [
    { id: "theme", label: "Theme", icon: <Palette className="w-4 h-4 mr-2" /> },
    { id: "points", label: "Points", icon: <Star className="w-4 h-4 mr-2" /> },
    { id: "fees", label: "Fees", icon: <DollarSign className="w-4 h-4 mr-2" /> },
    { id: "events", label: `Events (${futuresList.length})` },
    { id: "tags", label: `Tags (${polymarketTags.filter((t) => t.enabled).length})` },
    { id: "sportConfigs", label: "Sport Configs" },
    { id: "players", label: `Players (${players.length})` },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black">Admin CMS</h1>
            <p className="text-sm text-zinc-500">Unified admin panel - all products</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="text-zinc-400 hover:text-white" data-testid="button-logout">
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <Button key={tab.id} variant={activeTab === tab.id ? "default" : "secondary"} size="sm"
              onClick={() => setActiveTab(tab.id)} data-testid={`tab-${tab.id}`}>
              {tab.icon}{tab.label}
            </Button>
          ))}
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            {/* Tab 1: Theme */}
            {activeTab === "theme" && (
              <ThemeSection selectedTheme={selectedTheme} setSelectedTheme={setSelectedTheme}
                customColors={customColors} setCustomColors={setCustomColors}
                onSave={handleSaveTheme} isSaving={savingTheme} />
            )}

            {/* Tab 2: Points */}
            {activeTab === "points" && (
              <div className="space-y-6">
                <PointsSection pointsConfig={pointsConfig} setPointsConfig={setPointsConfig}
                  onSave={handleSavePoints} isSaving={savingPoints} />
                <WildPointsManager />
              </div>
            )}

            {/* Tab 3: Fees */}
            {activeTab === "fees" && (
              <FeeSection feeConfig={feeConfig} setFeeConfig={setFeeConfig}
                onSave={handleSaveFees} isSaving={savingFees} />
            )}

            {/* Tab 4: Events (Futures) */}
            {activeTab === "events" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold">Futures - Long-term Events</h2>
                  <p className="text-sm text-zinc-500">Add Polymarket events by slug or URL for long-term betting</p>
                </div>

                <Card className="p-4 space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input placeholder="Paste Polymarket event URL or slug (e.g., super-bowl-winner-2026)"
                        value={futuresSlug} onChange={(e) => setFuturesSlug(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddFutures()} data-testid="input-futures-slug" />
                    </div>
                    <Button onClick={handleAddFutures} disabled={fetchingEvent || !futuresSlug.trim()} data-testid="button-add-futures">
                      {fetchingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Link2 className="w-4 h-4 mr-2" />Add</>}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-600">Examples: "super-bowl-winner-2026" or full Polymarket URL</p>
                </Card>

                {/* Categories */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-zinc-300">Categories</h3>
                  <Card className="p-4 space-y-3">
                    <div className="flex gap-2">
                      <Input placeholder="New category name (e.g., Football, Basketball)" value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && newCategoryName.trim() && createCategoryMutation.mutate(newCategoryName.trim())}
                        data-testid="input-new-category" />
                      <Button onClick={() => newCategoryName.trim() && createCategoryMutation.mutate(newCategoryName.trim())}
                        disabled={createCategoryMutation.isPending || !newCategoryName.trim()} data-testid="button-add-category">
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </div>
                    {categoriesLoading ? <div className="text-zinc-500 text-sm">Loading...</div> :
                     futuresCategories.length === 0 ? <div className="text-zinc-600 text-sm">No categories yet.</div> : (
                      <div className="flex flex-wrap gap-2">
                        {futuresCategories.map((cat) => (
                          <div key={cat.id} className="flex items-center gap-1 bg-zinc-800 rounded px-2 py-1">
                            {editingCategoryId === cat.id ? (
                              <>
                                <Input value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)}
                                  className="h-6 w-24 text-xs" autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && editingCategoryName.trim()) updateCategoryMutation.mutate({ id: cat.id, name: editingCategoryName.trim() });
                                    if (e.key === "Escape") { setEditingCategoryId(null); setEditingCategoryName(""); }
                                  }} />
                                <Button size="icon" variant="ghost" className="h-6 w-6"
                                  onClick={() => updateCategoryMutation.mutate({ id: cat.id, name: editingCategoryName.trim() })}><Check className="w-3 h-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6"
                                  onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <span className="text-sm cursor-pointer hover:text-wild-brand"
                                  onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}>{cat.name}</span>
                                <Button size="icon" variant="ghost" className="h-5 w-5 ml-1"
                                  onClick={() => deleteCategoryMutation.mutate(cat.id)}><X className="w-3 h-3" /></Button>
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
                  <h3 className="font-semibold text-zinc-300">Futures Events</h3>
                  {futuresLoading ? <div className="text-zinc-500">Loading...</div> :
                   futuresList.length === 0 ? <Card className="p-8 text-center text-zinc-500">No futures events yet.</Card> : (
                    <div className="space-y-2">
                      {futuresList.map((future) => (
                        <Card key={future.id} className="p-4 flex justify-between items-start gap-4" data-testid={`futures-${future.id}`}>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate">{future.title}</div>
                            <div className="text-sm text-zinc-500 truncate">Slug: {future.polymarketSlug}</div>
                            {future.marketData?.outcomes && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {future.marketData.outcomes.slice(0, 3).map((outcome, i) => (
                                  <span key={i} className="text-xs px-2 py-1 bg-zinc-800 rounded">
                                    {outcome.label}: {(outcome.probability * 100).toFixed(0)}%
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-3">
                              <span className="text-xs text-zinc-500">Category:</span>
                              <Select value={future.categoryId?.toString() || "none"}
                                onValueChange={(value) => updateFuturesCategoryMutation.mutate({ futuresId: future.id, categoryId: value === "none" ? null : parseInt(value) })}>
                                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Uncategorized</SelectItem>
                                  {futuresCategories.map((cat) => <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            {future.endDate && <div className="text-xs text-zinc-600 mt-1">Ends: {new Date(future.endDate).toLocaleDateString()}</div>}
                          </div>
                          <Button variant="destructive" size="icon" disabled={deleteFuturesMutation.isPending}
                            onClick={() => deleteFuturesMutation.mutate(future.id)} data-testid={`button-delete-futures-${future.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: Tags + Match Day */}
            {activeTab === "tags" && (
              <div className="space-y-8">
                {/* Tag Management */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center gap-2 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold">Tag Management</h2>
                      <p className="text-sm text-zinc-500">Enable sports tags to show in both Match Day and Futures views</p>
                    </div>
                    <Button variant="outline" onClick={() => syncTagsMutation.mutate()} disabled={syncTagsMutation.isPending} data-testid="button-sync-tags">
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncTagsMutation.isPending ? "animate-spin" : ""}`} /> Sync Tags from Events
                    </Button>
                  </div>
                  {tagsLoading ? <div className="text-zinc-500">Loading tags...</div> :
                   polymarketTags.length === 0 ? <Card className="p-8 text-center text-zinc-500">No tags found. Click "Sync Tags from Events".</Card> : (
                    <div className="space-y-2">
                      {polymarketTags.filter((tag) => tag.category === "league").sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((tag) => (
                        <Card key={tag.id}
                          className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${tag.enabled ? "bg-wild-brand/10 border-wild-brand/30" : ""}`}
                          onClick={() => toggleTagMutation.mutate({ id: tag.id, enabled: !tag.enabled })} data-testid={`tag-${tag.slug}`}>
                          <div className="flex items-center gap-3">
                            <Checkbox checked={tag.enabled} onClick={(e) => e.stopPropagation()}
                              onCheckedChange={(checked) => toggleTagMutation.mutate({ id: tag.id, enabled: checked as boolean })} />
                            <div>
                              <div className="text-white font-medium">{tag.label}</div>
                              <div className="text-xs text-zinc-500">{tag.slug} &bull; {tag.eventCount || 0} events</div>
                            </div>
                          </div>
                          {tag.enabled && <Check className="w-4 h-4 text-wild-brand" />}
                        </Card>
                      ))}
                    </div>
                  )}
                  {polymarketTags.filter((t) => t.enabled).length > 0 && (
                    <div className="mt-4 p-4 bg-zinc-900 rounded-md">
                      <div className="text-sm text-zinc-400 mb-2">Enabled Tags - Events will be fetched for:</div>
                      <div className="flex flex-wrap gap-2">
                        {polymarketTags.filter((t) => t.enabled).map((tag) => (
                          <span key={tag.id} className="px-2 py-1 bg-wild-brand/20 text-wild-brand rounded text-xs">{tag.label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Match Day */}
                <div className="space-y-4 border-t border-zinc-800 pt-8">
                  <div className="flex justify-between items-center gap-2 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold">Match Day - Sports Leagues</h2>
                      <p className="text-sm text-zinc-500">Select leagues and bet types to show in the Predict tab</p>
                    </div>
                    <Button variant="outline" onClick={loadSportsLeagues} disabled={loadingLeagues} data-testid="button-refresh-leagues">
                      <RefreshCw className={`w-4 h-4 mr-2 ${loadingLeagues ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                  </div>
                  {loadingLeagues ? <div className="text-zinc-500">Loading sports from Polymarket...</div> :
                   sportsData.length === 0 ? <Card className="p-8 text-center text-zinc-500">No sports found. Click "Refresh".</Card> : (
                    <div className="space-y-2">
                      {sportsData.map((sport) => {
                        const isExpanded = expandedSports.has(sport.id);
                        const isPartial = isSportPartiallySelected(sport);
                        const isFull = isSportFullySelected(sport);
                        return (
                          <Card key={sport.id} className="overflow-hidden">
                            <div className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isPartial ? "bg-wild-brand/5" : ""}`}
                              onClick={() => toggleSportExpansion(sport.id)} data-testid={`sport-${sport.slug}`}>
                              <div className="flex items-center gap-3">
                                <Checkbox checked={isFull} onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={(checked) => handleSportToggleAll(sport, checked as boolean)} />
                                {sport.image && <img src={sport.image} alt={sport.label} className="w-8 h-8 rounded object-cover" />}
                                <div>
                                  <div className="text-white font-medium">{sport.label}</div>
                                  <div className="text-xs text-zinc-500">
                                    {isPartial ? (
                                      <span className="text-wild-brand">
                                        {sport.marketTypes.filter((mt) => adminSettings?.activeTagIds?.includes(mt.id)).length} of {sport.marketTypes.length} bet types
                                      </span>
                                    ) : `${sport.marketTypes.length} bet types available`}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isPartial && <Check className="w-4 h-4 text-wild-brand" />}
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                                {sport.marketTypes.map((mt) => {
                                  const isActive = adminSettings?.activeTagIds?.includes(mt.id);
                                  return (
                                    <div key={mt.id} className={`p-2 rounded flex items-center gap-3 cursor-pointer transition-colors ${isActive ? "bg-wild-brand/10" : "hover:bg-zinc-800"}`}
                                      onClick={() => handleMarketTypeToggle(mt.id, !isActive)} data-testid={`market-type-${mt.id}`}>
                                      <Checkbox checked={isActive} onClick={(e) => e.stopPropagation()}
                                        onCheckedChange={(checked) => handleMarketTypeToggle(mt.id, checked as boolean)} />
                                      <div>
                                        <div className="text-sm text-white">{mt.label}</div>
                                        <div className="text-xs text-zinc-500">{mt.type}</div>
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
                      <div className="text-sm text-zinc-400 mb-2">Active Selections - Games will auto-populate:</div>
                      <div className="space-y-2">
                        {getActiveSportsInfo().map(({ sport, marketTypes }) => (
                          <div key={sport.id} className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-white">{sport.label}:</span>
                            {marketTypes.map((mtLabel) => (
                              <span key={mtLabel} className="px-2 py-1 bg-wild-brand/20 text-wild-brand rounded text-xs">{mtLabel}</span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 6: Sport Configs */}
            {activeTab === "sportConfigs" && (
              <SportConfigEditor sportsData={sportsData} toast={toast} />
            )}

            {/* Tab 7: Players */}
            {activeTab === "players" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold">Player Management</h2>
                    <p className="text-sm text-zinc-500">Create and manage player entities</p>
                  </div>
                  <Button onClick={() => setShowPlayerForm(!showPlayerForm)} data-testid="button-toggle-player-form">
                    {showPlayerForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showPlayerForm ? "Cancel" : "Add Player"}
                  </Button>
                </div>

                {showPlayerForm && (
                  <Card className="p-4">
                    <form onSubmit={playerForm.handleSubmit(onSubmitPlayer)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Name</Label>
                          <Input {...playerForm.register("name")} placeholder="Player name" data-testid="input-player-name" />
                          {playerForm.formState.errors.name && <p className="text-red-400 text-xs mt-1">{playerForm.formState.errors.name.message}</p>}
                        </div>
                        <div>
                          <Label>Symbol</Label>
                          <Input {...playerForm.register("symbol")} placeholder="SYM" maxLength={6} data-testid="input-player-symbol" />
                          {playerForm.formState.errors.symbol && <p className="text-red-400 text-xs mt-1">{playerForm.formState.errors.symbol.message}</p>}
                        </div>
                        <div>
                          <Label>Team</Label>
                          <Input {...playerForm.register("team")} placeholder="Team name" data-testid="input-player-team" />
                        </div>
                        <div>
                          <Label>Sport</Label>
                          <Input {...playerForm.register("sport")} placeholder="Basketball" data-testid="input-player-sport" />
                        </div>
                        <div>
                          <Label>Funding Target</Label>
                          <Input type="number" {...playerForm.register("fundingTarget", { valueAsNumber: true })} data-testid="input-funding-target" />
                        </div>
                        <div>
                          <Label>Funding Current</Label>
                          <Input type="number" {...playerForm.register("fundingCurrent", { valueAsNumber: true })} data-testid="input-funding-current" />
                        </div>
                      </div>
                      <div>
                        <Label>Status</Label>
                        <Select value={playerForm.watch("status")}
                          onValueChange={(v) => playerForm.setValue("status", v as "offering" | "available" | "closed")}>
                          <SelectTrigger data-testid="select-player-status"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="offering">Offering</SelectItem>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" disabled={createPlayerMutation.isPending} data-testid="button-create-player">
                        {createPlayerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Create Player
                      </Button>
                    </form>
                  </Card>
                )}

                {playersLoading ? <div className="text-zinc-500">Loading players...</div> :
                 players.length === 0 ? <Card className="p-8 text-center text-zinc-500">No players yet. Click "Add Player" to create one.</Card> : (
                  <div className="space-y-2">
                    {players.map((player) => (
                      <Card key={player.id} className="p-4 flex justify-between items-center" data-testid={`player-${player.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm">
                            {player.avatarInitials}
                          </div>
                          <div>
                            <div className="font-bold text-white">{player.name} <span className="text-zinc-400 font-mono text-sm">${player.symbol}</span></div>
                            <div className="text-xs text-zinc-500">{player.team} &bull; {player.sport} &bull; {player.status}</div>
                            <div className="text-xs text-zinc-600">
                              Funding: ${player.fundingCurrent?.toLocaleString()} / ${player.fundingTarget?.toLocaleString()} ({player.fundingPercentage}%)
                            </div>
                          </div>
                        </div>
                        <Button variant="destructive" size="icon" disabled={deletePlayerMutation.isPending}
                          onClick={() => deletePlayerMutation.mutate(player.id)} data-testid={`button-delete-player-${player.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
