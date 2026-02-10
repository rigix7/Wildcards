/**
 * Admin Panel – Simplified for the shared points/fee system
 *
 * Adapted from PolyHouse-main/client/src/pages/admin.tsx, stripped down to
 * just the sections both products need:
 *   - Points configuration (enabled, name, referral %, reset schedule)
 *   - Fee configuration (bps, wallet addresses, multi-wallet splits)
 *
 * Password-protected via ADMIN_SECRET_KEY environment variable. The secret
 * is sent as a Bearer token and persisted in localStorage for the session.
 */

import { useState, useEffect } from "react";
import {
  Loader2,
  Lock,
  LogOut,
  DollarSign,
  Star,
  Users,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
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
// Auth-aware fetch helper
// ---------------------------------------------------------------------------

function getAdminHeaders(): HeadersInit {
  const secret = localStorage.getItem("adminSecret");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  };
}

async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...getAdminHeaders(), ...(init?.headers || {}) },
  });
}

// ---------------------------------------------------------------------------
// Password prompt component
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fee Configuration Section
// From PolyHouse admin.tsx WhiteLabelSection – fees tab
// ---------------------------------------------------------------------------

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
                  <Label className="text-xs text-zinc-500">Wallet Address</Label>
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
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Fee Settings
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Points Configuration Section
// From PolyHouse admin.tsx WhiteLabelSection – points tab
// ---------------------------------------------------------------------------

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
              setPointsConfig({ ...pointsConfig, enabled: e.target.checked })
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
          <SelectTrigger className="mt-1" data-testid="select-reset-schedule">
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
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Points Settings
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Admin Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Config state
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"points" | "fees">("points");
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

  // Load white-label config after auth
  useEffect(() => {
    if (!isAuthenticated) return;

    setIsLoading(true);
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
        setIsLoading(false);
      });
  }, [isAuthenticated]);

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

  const handleLogout = () => {
    localStorage.removeItem("adminSecret");
    setIsAuthenticated(false);
  };

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

  // Main admin UI
  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-sm text-zinc-500">
              Configure points system and fee settings
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
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
            className={`rounded-lg p-3 text-sm ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-red-500/10 text-red-400 border border-red-500/30"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-2">
          <Button
            variant={activeTab === "points" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("points")}
            data-testid="tab-points"
          >
            <Star className="w-4 h-4 mr-2" />
            Points
          </Button>
          <Button
            variant={activeTab === "fees" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("fees")}
            data-testid="tab-fees"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Fees
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            {activeTab === "points" && (
              <PointsSection
                pointsConfig={pointsConfig}
                setPointsConfig={setPointsConfig}
                onSave={handleSavePoints}
                isSaving={savingPoints}
              />
            )}
            {activeTab === "fees" && (
              <FeeSection
                feeConfig={feeConfig}
                setFeeConfig={setFeeConfig}
                onSave={handleSaveFees}
                isSaving={savingFees}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
