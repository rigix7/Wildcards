/**
 * LeaderboardPanel – Referral leaderboard rendered within PredictView's LEADERBOARD sub-tab
 *
 * Shows period info, user stats, rankings, and historical archives.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Copy, Share2, Clock, Users, Star, ChevronDown, ChevronUp, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/terminal/EmptyState";

interface LeaderboardPanelProps {
  walletAddress?: string;
  isConnected: boolean;
}

interface LeaderboardEntry {
  rank: number;
  address: string;
  tradingPoints: number;
  bonusPoints: number;
  totalPoints: number;
  referralCount: number;
}

interface ActivePeriodResponse {
  active: boolean;
  period: {
    id: number;
    name: string;
    strategy: string;
    resetMode: string;
    startsAt: string;
    endsAt: string | null;
    refereeBenefits: { signupBonus: number; firstBetMultiplier: number; maxStake: number };
  } | null;
}

interface LeaderboardResponse {
  rankings: LeaderboardEntry[];
  periodActive: boolean;
  periodId?: number;
  periodName?: string;
  strategy?: string;
  startsAt?: string;
  endsAt?: string;
}

interface MyCodeResponse {
  code: string;
  referralCount: number;
  shareUrl: string;
}

interface ArchivesResponse {
  archives: Array<{
    id: number;
    periodId: number;
    periodStart: string;
    periodEnd: string;
    resetMode: string;
    rankings: Array<{ rank: number; address: string; points: number; referrals: number; bonusPoints: number }>;
    stats: { totalUsers: number; totalReferrals: number; totalBonusAwarded: number; topReferrer?: string };
  }>;
}

type LeaderboardTab = "rankings" | "referrals" | "history";

const STRATEGY_LABELS: Record<string, string> = {
  growth_multiplier: "Growth Multiplier",
  revenue_share: "Revenue Share",
  milestone_quest: "Milestone Quest",
  team_volume: "Team Volume",
};

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPoints(pts: number): string {
  if (pts >= 1000000) return `${(pts / 1000000).toFixed(1)}M`;
  if (pts >= 1000) return `${(pts / 1000).toFixed(1)}K`;
  return pts.toFixed(0);
}

export function LeaderboardPanel({ walletAddress, isConnected }: LeaderboardPanelProps) {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("rankings");
  const [copied, setCopied] = useState(false);

  // Fetch active period
  const { data: periodData } = useQuery<ActivePeriodResponse>({
    queryKey: ["referral-active-period"],
    queryFn: async () => {
      const res = await fetch("/api/referral/active-period");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch leaderboard
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["referral-leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/referral/leaderboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch my code (only if connected)
  const { data: myCodeData } = useQuery<MyCodeResponse>({
    queryKey: ["referral-my-code", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/referral/my-code/${walletAddress}`);
      return res.json();
    },
    enabled: isConnected && !!walletAddress,
  });

  // Fetch archives
  const { data: archivesData } = useQuery<ArchivesResponse>({
    queryKey: ["referral-archives"],
    queryFn: async () => {
      const res = await fetch("/api/referral/archives");
      return res.json();
    },
    enabled: activeTab === "history",
  });

  // Fetch my bonus
  const { data: bonusData } = useQuery({
    queryKey: ["referral-bonus", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/referral/${walletAddress}/bonus`);
      return res.json();
    },
    enabled: isConnected && !!walletAddress && !!periodData?.active,
    refetchInterval: 30000,
  });

  const handleCopyCode = async () => {
    if (!myCodeData?.code) return;
    try {
      await navigator.clipboard.writeText(myCodeData.shareUrl || myCodeData.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = myCodeData.shareUrl || myCodeData.code;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (!myCodeData?.shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Wildcards!",
          text: "Use my referral link to earn bonus points",
          url: myCodeData.shareUrl,
        });
      } catch {
        handleCopyCode();
      }
    } else {
      handleCopyCode();
    }
  };

  // Find my rank in leaderboard
  const myRank = walletAddress
    ? leaderboardData?.rankings?.find(
        (r) => r.address.toLowerCase() === walletAddress.toLowerCase(),
      )
    : null;

  // No active period
  if (!periodData?.active) {
    return (
      <div className="p-4 space-y-4">
        <EmptyState
          icon={Trophy}
          title="No Active Referral Program"
          description="Check back soon! The operator will launch a referral program with bonus rewards."
        />

        {/* Show history if available */}
        {archivesData?.archives && archivesData.archives.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <History className="w-4 h-4" />
              Past Seasons
            </h3>
            {archivesData.archives.map((archive) => (
              <ArchiveCard key={archive.id} archive={archive} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const period = periodData.period!;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Period Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{period.name}</h2>
          <Badge variant="outline" className="text-xs">
            {STRATEGY_LABELS[period.strategy] || period.strategy}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Started {formatDate(period.startsAt)}
          </span>
          {period.endsAt && (
            <span>Ends {formatDate(period.endsAt)}</span>
          )}
        </div>
      </div>

      {/* My Stats Card */}
      {isConnected && (
        <div className="px-4 py-2">
          <Card className="p-3 bg-gradient-to-r from-[var(--card-bg)]/80 to-[var(--card-bg-elevated)]/80 border border-[var(--border-primary)]">
            <div className="grid grid-cols-3 text-center gap-2 mb-3">
              <div>
                <div className="text-xl font-bold text-[var(--text-primary)]">
                  {myRank?.rank ?? "-"}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Rank</div>
              </div>
              <div>
                <div className="text-xl font-bold text-[var(--text-primary)]">
                  {bonusData?.bonus != null ? formatPoints(bonusData.bonus) : "0"}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Bonus Pts</div>
              </div>
              <div>
                <div className="text-xl font-bold text-[var(--text-primary)]">
                  {myCodeData?.referralCount ?? 0}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Referrals</div>
              </div>
            </div>

            {myCodeData?.code && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[var(--page-bg)] rounded px-3 py-1.5 font-mono text-sm text-[var(--text-primary)] text-center tracking-widest">
                  {myCodeData.code}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleCopyCode}
                >
                  <Copy className={`w-4 h-4 ${copied ? "text-green-500" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleShare}
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 flex border-b border-[var(--border-primary)]">
        {(["rankings", "referrals", "history"] as LeaderboardTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-mono uppercase tracking-wide border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[var(--nav-active,#fbbf24)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "rankings" && (
          <RankingsTab
            rankings={leaderboardData?.rankings || []}
            loading={leaderboardLoading}
            currentAddress={walletAddress}
          />
        )}

        {activeTab === "referrals" && (
          <ReferralsTab
            walletAddress={walletAddress}
            isConnected={isConnected}
            periodId={period.id}
          />
        )}

        {activeTab === "history" && (
          <HistoryTab archives={archivesData?.archives || []} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RankingsTab({
  rankings,
  loading,
  currentAddress,
}: {
  rankings: LeaderboardEntry[];
  loading: boolean;
  currentAddress?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-[var(--card-bg)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (rankings.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No Rankings Yet"
        description="Be the first to refer friends and climb the leaderboard!"
      />
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-12 gap-1 px-2 py-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-mono">
        <div className="col-span-1">#</div>
        <div className="col-span-4">Address</div>
        <div className="col-span-3 text-right">Points</div>
        <div className="col-span-2 text-right">Bonus</div>
        <div className="col-span-2 text-right">Refs</div>
      </div>

      {rankings.map((entry) => {
        const isMe = currentAddress && entry.address.toLowerCase() === currentAddress.toLowerCase();
        const rankDisplay =
          entry.rank === 1 ? "\u{1F947}" : entry.rank === 2 ? "\u{1F948}" : entry.rank === 3 ? "\u{1F949}" : String(entry.rank);

        return (
          <div
            key={entry.address}
            className={`grid grid-cols-12 gap-1 px-2 py-2 rounded text-sm ${
              isMe
                ? "bg-[var(--nav-active,#fbbf24)]/10 border border-[var(--nav-active,#fbbf24)]/30"
                : "hover:bg-[var(--card-bg)]"
            }`}
          >
            <div className="col-span-1 font-mono text-[var(--text-muted)]">{rankDisplay}</div>
            <div className="col-span-4 font-mono text-[var(--text-primary)] truncate">
              {isMe ? "You" : formatAddress(entry.address)}
            </div>
            <div className="col-span-3 text-right font-mono text-[var(--text-primary)]">
              {formatPoints(entry.totalPoints)}
            </div>
            <div className="col-span-2 text-right font-mono text-[var(--text-muted)]">
              {formatPoints(entry.bonusPoints)}
            </div>
            <div className="col-span-2 text-right font-mono text-[var(--text-muted)]">
              {entry.referralCount}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReferralsTab({
  walletAddress,
  isConnected,
  periodId,
}: {
  walletAddress?: string;
  isConnected: boolean;
  periodId: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["referral-my-referrals", walletAddress, periodId],
    queryFn: async () => {
      const res = await fetch(`/api/referral/${walletAddress}/referrals`);
      return res.json();
    },
    enabled: isConnected && !!walletAddress,
    refetchInterval: 30000,
  });

  if (!isConnected) {
    return (
      <EmptyState
        icon={Users}
        title="Connect Wallet"
        description="Connect your wallet to see your referrals"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-[var(--card-bg)] animate-pulse" />
        ))}
      </div>
    );
  }

  const referrals = data?.referrals || [];

  if (referrals.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No Referrals Yet"
        description="Share your referral code to start earning bonus points!"
      />
    );
  }

  return (
    <div className="space-y-2">
      {referrals.map((ref: { address: string; status: string; linkedAt: string; firstBetAt: string | null; lifetimeVolume: number }, i: number) => (
        <Card key={i} className="p-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-sm text-[var(--text-primary)]">
              {formatAddress(ref.address)}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Joined {formatDate(ref.linkedAt)}
            </div>
          </div>
          <div className="text-right">
            <Badge
              variant={ref.status === "active" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {ref.status}
            </Badge>
            {ref.lifetimeVolume > 0 && (
              <div className="text-xs text-[var(--text-muted)] mt-1">
                ${ref.lifetimeVolume.toFixed(2)} vol
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function HistoryTab({
  archives,
}: {
  archives: ArchivesResponse["archives"];
}) {
  if (archives.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No History"
        description="Completed referral seasons will appear here"
      />
    );
  }

  return (
    <div className="space-y-3">
      {archives.map((archive) => (
        <ArchiveCard key={archive.id} archive={archive} />
      ))}
    </div>
  );
}

function ArchiveCard({
  archive,
}: {
  archive: ArchivesResponse["archives"][0];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-3">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="text-left">
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {formatDate(archive.periodStart)} - {formatDate(archive.periodEnd)}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {archive.stats.totalUsers} participants, {archive.stats.totalReferrals} referrals
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-1">
          {archive.rankings.slice(0, 10).map((entry) => (
            <div
              key={entry.address}
              className="grid grid-cols-12 gap-1 text-xs font-mono px-1 py-1"
            >
              <div className="col-span-1 text-[var(--text-muted)]">{entry.rank}</div>
              <div className="col-span-5 text-[var(--text-primary)] truncate">
                {formatAddress(entry.address)}
              </div>
              <div className="col-span-3 text-right text-[var(--text-primary)]">
                {formatPoints(entry.points)} pts
              </div>
              <div className="col-span-3 text-right text-[var(--text-muted)]">
                {entry.referrals} refs
              </div>
            </div>
          ))}
          {archive.rankings.length > 10 && (
            <div className="text-xs text-[var(--text-muted)] text-center py-1">
              +{archive.rankings.length - 10} more
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
