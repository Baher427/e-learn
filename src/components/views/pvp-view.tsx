"use client";

/**
 * PvpView — ساحة المعارك (PVP Challenges Lobby)
 *
 * Sticky glass-header nav, daily-bonus banner, AI card, 5 tabs:
 *   lobby / friends / leaderboard / history / wallet
 *
 * Polls `/api/pvp/lobby?action=get_lobby_data` every 5s for the lobby, and
 * `/api/pvp/invite?action=check_incoming` every 1.5s for incoming invites.
 *
 * The wallet tab delegates to the standalone WalletView via setView("wallet")
 * to avoid duplicating OTP + withdrawal logic (out of scope).
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Trophy,
  Bot,
  Bell,
  LogOut,
  Users,
  UserPlus,
  UserMinus,
  Swords,
  Crown,
  Medal,
  Wallet,
  History,
  Gift,
  Coins,
  ChevronLeft,
  Loader2,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { formatCountdown } from "@/lib/pvp";
import type { TierConfig } from "@/lib/pvp";

// ---------------------------------------------------------------------------
// Types matching the API payloads
// ---------------------------------------------------------------------------

interface OnlineUser {
  id: string;
  username: string;
  studentName: string;
  level: number;
  pvpPoints: number;
  currentStatus: string;
  isOnline: boolean;
  lastActivityAgoSec: number;
}

interface FriendUser extends OnlineUser {
  friendshipId: string;
}

interface IncomingRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderLevel: number;
  createdAt: string;
}

interface IncomingRejection {
  id: string;
  otherUserId: string;
  otherUserName: string;
}

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  studentName: string;
  pvpPoints: number;
  level: number;
}

interface LobbyData {
  online: OnlineUser[];
  friends: FriendUser[];
  friendRequests: IncomingRequest[];
  friendRejections: IncomingRejection[];
  leaderboard: LeaderboardEntry[];
  myRank: number;
  myPoints: number;
  myLevel: number;
  aiAttemptsLeft: number;
  aiDailyLimit: number;
  bonusAvailable: boolean;
  secondsToMidnight: number;
  gameConfig: {
    tiers: TierConfig[];
    ai_status: 0 | 1;
    ai_msg: string;
  };
}

interface IncomingInvite {
  matchId: string;
  fromUserId: string;
  fromUserName: string;
  fromUserUsername: string;
  fromUserLevel: number;
  fromUserPoints: number;
  tier: number;
  bet: number;
  createdAt: string;
}

interface IncomingResponse {
  invite: IncomingInvite | null;
  activeGame: {
    id: string;
    isAi: boolean;
    questionCount: number;
    tier: number;
    questions: Array<{ i: number; q: string; terms: (number | string)[] }>;
  } | null;
}

interface HistoryItem {
  kind: "pvp" | "ai";
  id: string;
  date: string;
  opponent: string;
  result: "win" | "loss" | "draw" | "cancelled" | "rejected" | "surrender";
  points: number;
  tier?: number;
}

interface HistoryPage {
  history: HistoryItem[];
  hasMore: boolean;
  currentPage: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postJson<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/pvp/lobby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.status !== "success") {
    throw new Error(json.message ?? "خطأ في الخادم");
  }
  return json.data as T;
}

async function postInvite<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/pvp/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.status !== "success") {
    throw new Error(json.message ?? "خطأ في الخادم");
  }
  return json.data as T;
}

function lastSeenLabel(sec: number): string {
  if (sec < 60) return "الآن";
  if (sec < 3600) return `${Math.floor(sec / 60)} د`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} س`;
  return `${Math.floor(sec / 86400)} ي`;
}

const TIER_STYLES: Record<number, { ring: string; text: string; bg: string; icon: string }> = {
  1: { ring: "ring-amber-700/40", text: "text-amber-700 dark:text-amber-500", bg: "bg-amber-700/10", icon: "🥉" },
  2: { ring: "ring-slate-400/40", text: "text-slate-500 dark:text-slate-300", bg: "bg-slate-500/10", icon: "🥈" },
  3: { ring: "ring-yellow-500/40", text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", icon: "🥇" },
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function PvpView() {
  const { user, logout, unreadNotifications } = useAuth();
  const setView = useUIStore((s) => s.setView);
  const { socket, connected } = useSocket();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"lobby" | "friends" | "leaderboard" | "history" | "wallet">("lobby");
  const [dismissedInviteIds, setDismissedInviteIds] = useState<string[]>([]);

  // ---- Lobby data poll (5s) ----
  const lobbyQ = useQuery<LobbyData>({
    queryKey: ["pvp", "lobby"],
    queryFn: () => postJson<LobbyData>({ action: "get_lobby_data" }),
    refetchInterval: 5_000,
    retry: 1,
  });

  // ---- Incoming invites / active-game poll (1.5s) ----
  const incomingQ = useQuery<IncomingResponse>({
    queryKey: ["pvp", "incoming"],
    queryFn: () => postInvite<IncomingResponse>({ action: "check_incoming" }),
    refetchInterval: 1_500,
    retry: 1,
  });

  // ---- Auto-redirect into the arena if there's an active game ----
  useEffect(() => {
    const ag = incomingQ.data?.activeGame;
    if (ag) {
      setView("pvp-arena", { matchId: ag.id, ...(ag.isAi ? { mode: "ai" } : {}) });
    }
  }, [incomingQ.data?.activeGame?.id, setView]);

  // ---- Join lobby presence on socket ----
  useEffect(() => {
    if (!socket || !connected || !user) return;
    socket.emit("join_lobby", { userId: user.id });
  }, [socket, connected, user?.id]);

  // ---- Mutations ----
  const sendInviteMut = useMutation({
    mutationFn: async (vars: { targetId: string; tier: 1 | 2 | 3 }) =>
      postInvite<{ matchId: string }>({ action: "send_invite", targetId: vars.targetId, tier: vars.tier }),
    onSuccess: (data, vars) => {
      toast.success("تم إرسال الدعوة! بانتظار الرد...");
      if (socket && user) {
        socket.emit("send_invite", {
          fromUserId: user.id,
          toUserId: vars.targetId,
          tier: vars.tier,
          matchId: data.matchId,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respondInviteMut = useMutation({
    mutationFn: async (vars: { matchId: string; response: "accept" | "reject" }) =>
      postInvite<{ status: string }>({
        action: "respond_invite",
        matchId: vars.matchId,
        response: vars.response,
      }),
    onSuccess: (_data, vars) => {
      if (socket && user && pendingIncomingInvite) {
        socket.emit("respond_invite", {
          matchId: vars.matchId,
          response: vars.response,
          fromUserId: pendingIncomingInvite.fromUserId,
          toUserId: user.id,
        });
      }
      if (vars.response === "accept") {
        toast.success("تم قبول الدعوة! جارٍ الانتقال للساحة...");
        setTimeout(() => setView("pvp-arena", { matchId: vars.matchId }), 600);
      } else {
        toast.info("تم رفض الدعوة");
      }
      setDismissedInviteIds((prev) => [...prev, vars.matchId]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const friendRequestMut = useMutation({
    mutationFn: async (targetId: string) =>
      postJson<{ status: string }>({ action: "friend_request", targetId }),
    onSuccess: () => {
      toast.success("تم إرسال طلب الصداقة");
      qc.invalidateQueries({ queryKey: ["pvp", "lobby"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respondFriendMut = useMutation({
    mutationFn: async (vars: { requestId: string; response: "accept" | "reject" }) =>
      postJson<{ status: string }>({
        action: "respond_friend",
        requestId: vars.requestId,
        response: vars.response,
      }),
    onSuccess: () => {
      toast.success("تم");
      qc.invalidateQueries({ queryKey: ["pvp", "lobby"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFriendMut = useMutation({
    mutationFn: async (friendId: string) =>
      postJson<{ status: string }>({ action: "remove_friend", friendId }),
    onSuccess: () => {
      toast.info("تم حذف الصديق");
      qc.invalidateQueries({ queryKey: ["pvp", "lobby"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearRejectionMut = useMutation({
    mutationFn: async (rejectionId: string) =>
      postJson<{ status: string }>({ action: "clear_rejection", rejectionId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pvp", "lobby"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const claimBonusMut = useMutation({
    mutationFn: async () => postJson<{ awarded: number; balance: number }>({ action: "claim_daily_bonus" }),
    onSuccess: (data) => {
      toast.success(`+${data.awarded} نقطة! 🎁`);
      qc.invalidateQueries({ queryKey: ["pvp", "lobby"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startAiMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pvp/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "start_ai_game" }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json.message ?? "خطأ في الخادم");
      }
      return json.data as { matchId: string };
    },
    onSuccess: (data) => {
      toast.success("جارٍ بدء التحدي ضد الذكاء الاصطناعي!");
      setView("pvp-arena", { matchId: data.matchId, mode: "ai" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Derived state ----
  // The bonus countdown comes straight from `lobbyQ.data.secondsToMidnight`,
  // which is re-fetched every 5s. We don't need a JS 1s timer — the 5s
  // re-fetch keeps the value fresh enough for a daily-bonus countdown.
  const bonusBanner = lobbyQ.data
    ? {
        available: lobbyQ.data.bonusAvailable,
        countdown: formatCountdown(lobbyQ.data.secondsToMidnight),
      }
    : null;

  // ---- Compute the currently-visible incoming invite ----
  // (skipping any invites the user has dismissed)
  const currentInvite = incomingQ.data?.invite ?? null;
  const pendingIncomingInvite =
    currentInvite && !dismissedInviteIds.includes(currentInvite.matchId)
      ? currentInvite
      : null;

  if (!user) return null;
  if (lobbyQ.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8" dir="rtl">
      {/* ---- Sticky glass header ---- */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Card className="glass border border-[var(--glass-border)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-white shadow-lg">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold sm:text-lg">ساحة المعارك</h1>
                <p className="text-[10px] text-muted-foreground sm:text-xs">
                  @{user.username} · مستوى {lobbyQ.data?.myLevel ?? user.level}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="glass gap-1">
                <Coins className="h-3 w-3 text-accent" />
                <span className="font-mono">{lobbyQ.data?.myPoints ?? user.pvpPoints}</span>
              </Badge>
              <Badge variant="secondary" className="glass gap-1">
                <Crown className="h-3 w-3 text-warning" />
                <span>#{lobbyQ.data?.myRank ?? "—"}</span>
              </Badge>
              <Button
                variant="outline"
                size="icon"
                className="glass relative h-9 w-9"
                onClick={() => setView("notifications")}
                aria-label="الإشعارات"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-2 -left-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                    {unreadNotifications}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  logout();
                  setView("landing");
                }}
                aria-label="تسجيل الخروج"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ---- Daily-bonus banner ---- */}
      {bonusBanner && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          {bonusBanner.available ? (
            <Card className="glass border border-success/30 bg-success/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Gift className="h-6 w-6 text-success" />
                  <div>
                    <p className="text-sm font-bold">مكافأة يومية متاحة!</p>
                    <p className="text-xs text-muted-foreground">احصل على 50-60 نقطة PVP إضافية</p>
                  </div>
                </div>
                <Button
                  onClick={() => claimBonusMut.mutate()}
                  disabled={claimBonusMut.isPending}
                  className="gradient-primary text-white"
                  size="sm"
                >
                  {claimBonusMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Coins className="h-4 w-4" />
                  )}
                  استلام
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="glass border border-[var(--glass-border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">المكافأة التالية بعد</p>
                    <p className="text-[10px] text-muted-foreground">تتجدد عند منتصف الليل بتوقيت القاهرة</p>
                  </div>
                </div>
                <span className="font-mono text-lg font-bold gradient-text" dir="ltr">
                  {bonusBanner.countdown}
                </span>
              </div>
            </Card>
          )}
        </motion.div>
      )}

      {/* ---- AI card ---- */}
      {lobbyQ.data && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-4"
        >
          <Card className="border-none overflow-hidden p-0">
            <div className="relative bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-700 p-4 sm:p-5">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-2 right-3 text-4xl">🤖</div>
                <div className="absolute bottom-2 left-3 text-3xl">⚡</div>
                <div className="absolute top-1/2 right-1/4 text-2xl">+</div>
                <div className="absolute bottom-1/3 left-1/3 text-2xl">÷</div>
              </div>
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white sm:text-lg">تحدّي الذكاء الاصطناعي</h2>
                    <p className="text-xs text-white/80">
                      {lobbyQ.data.gameConfig.ai_status === 1
                        ? lobbyQ.data.gameConfig.ai_msg
                        : "الوضع مغلق حالياً"}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-xs text-white/70">المتبقي اليوم</div>
                  <div className="font-mono text-2xl font-bold text-white">
                    {lobbyQ.data.aiAttemptsLeft}
                    <span className="text-sm text-white/70">/{lobbyQ.data.aiDailyLimit}</span>
                  </div>
                </div>
              </div>
              <div className="relative mt-3 flex items-center gap-3">
                <Progress
                  value={
                    lobbyQ.data.aiDailyLimit > 0
                      ? (lobbyQ.data.aiAttemptsLeft / lobbyQ.data.aiDailyLimit) * 100
                      : 0
                  }
                  className="h-1.5 bg-white/20"
                />
                <Button
                  onClick={() => startAiMut.mutate()}
                  disabled={
                    startAiMut.isPending ||
                    lobbyQ.data.gameConfig.ai_status !== 1 ||
                    lobbyQ.data.aiAttemptsLeft <= 0
                  }
                  className="bg-white text-purple-700 hover:bg-white/90 hover:text-purple-800 shadow-lg"
                  size="sm"
                >
                  {startAiMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Swords className="h-4 w-4" />
                  )}
                  ابدأ التحدي
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ---- Tabs ---- */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="mb-4 grid w-full grid-cols-5">
          <TabsTrigger value="lobby" className="gap-1">
            <Users className="h-3 w-3" />
            <span className="hidden sm:inline">الروّاد</span>
            <span className="sm:hidden">روّاد</span>
          </TabsTrigger>
          <TabsTrigger value="friends" className="gap-1">
            <UserPlus className="h-3 w-3" />
            <span className="hidden sm:inline">الأصدقاء</span>
            <span className="sm:hidden">أصدقاء</span>
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1">
            <Crown className="h-3 w-3" />
            <span className="hidden sm:inline">المتصدّرون</span>
            <span className="sm:hidden">متصدّرون</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-3 w-3" />
            <span className="hidden sm:inline">السجل</span>
            <span className="sm:hidden">سجل</span>
          </TabsTrigger>
          <TabsTrigger value="wallet" className="gap-1">
            <Wallet className="h-3 w-3" />
            <span className="hidden sm:inline">المحفظة</span>
            <span className="sm:hidden">محفظة</span>
          </TabsTrigger>
        </TabsList>

        {/* ---- Lobby tab ---- */}
        <TabsContent value="lobby">
          <LobbyTab
            data={lobbyQ.data}
            userId={user.id}
            onSendInvite={(targetId, tier) => sendInviteMut.mutate({ targetId, tier })}
            onAddFriend={(targetId) => friendRequestMut.mutate(targetId)}
            sendingTargetId={sendInviteMut.isPending ? null : null}
          />
        </TabsContent>

        {/* ---- Friends tab ---- */}
        <TabsContent value="friends">
          <FriendsTab
            data={lobbyQ.data}
            onAccept={(id) => respondFriendMut.mutate({ requestId: id, response: "accept" })}
            onReject={(id) => respondFriendMut.mutate({ requestId: id, response: "reject" })}
            onRemove={(fid) => removeFriendMut.mutate(fid)}
            onClearRejection={(rid) => clearRejectionMut.mutate(rid)}
            onSendInvite={(targetId, tier) => sendInviteMut.mutate({ targetId, tier })}
          />
        </TabsContent>

        {/* ---- Leaderboard tab ---- */}
        <TabsContent value="leaderboard">
          <LeaderboardTab data={lobbyQ.data} userId={user.id} />
        </TabsContent>

        {/* ---- History tab ---- */}
        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>

        {/* ---- Wallet tab ---- */}
        <TabsContent value="wallet">
          <Card className="glass border border-[var(--glass-border)] p-6 text-center">
            <Wallet className="mx-auto mb-3 h-12 w-12 text-accent" />
            <h2 className="mb-1 text-lg font-bold">محفظتي</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              للوصول إلى عمليات السحب والتحويل، انتقل إلى صفحة المحفظة الكاملة.
            </p>
            <Button onClick={() => setView("wallet")} className="gradient-primary text-white">
              <Wallet className="h-4 w-4" />
              الذهاب إلى المحفظة
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- Incoming invite modal ---- */}
      <Dialog
        open={!!pendingIncomingInvite}
        onOpenChange={(open) => {
          if (!open && pendingIncomingInvite) {
            setDismissedInviteIds((prev) => [...prev, pendingIncomingInvite.matchId]);
          }
        }}
      >
        <DialogContent className="glass-strong border border-[var(--glass-border)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-accent" />
              تحدٍ جديد!
            </DialogTitle>
            <DialogDescription>
              {pendingIncomingInvite?.fromUserName} يتحدّاك في مباراة PVP
            </DialogDescription>
          </DialogHeader>
          {pendingIncomingInvite && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 gradient-primary">
                    <AvatarFallback className="gradient-primary text-white font-bold">
                      {pendingIncomingInvite.fromUserName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold">{pendingIncomingInvite.fromUserName}</p>
                    <p className="text-xs text-muted-foreground">
                      @{pendingIncomingInvite.fromUserUsername} · مستوى {pendingIncomingInvite.fromUserLevel}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <Badge variant="secondary" className="mb-1 glass">
                    {TIER_STYLES[pendingIncomingInvite.tier]?.icon} فئة {pendingIncomingInvite.tier}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    الرهان: <span className="font-mono font-bold">{pendingIncomingInvite.bet}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    respondInviteMut.mutate({
                      matchId: pendingIncomingInvite.matchId,
                      response: "accept",
                    })
                  }
                  disabled={respondInviteMut.isPending}
                  className="flex-1 gradient-primary text-white"
                >
                  <Check className="h-4 w-4" />
                  قبول
                </Button>
                <Button
                  onClick={() =>
                    respondInviteMut.mutate({
                      matchId: pendingIncomingInvite.matchId,
                      response: "reject",
                    })
                  }
                  disabled={respondInviteMut.isPending}
                  variant="outline"
                  className="flex-1"
                >
                  <X className="h-4 w-4" />
                  رفض
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lobby tab
// ---------------------------------------------------------------------------

function LobbyTab({
  data,
  userId,
  onSendInvite,
  onAddFriend,
}: {
  data: LobbyData | undefined;
  userId: string;
  onSendInvite: (targetId: string, tier: 1 | 2 | 3) => void;
  onAddFriend: (targetId: string) => void;
  sendingTargetId: string | null;
}) {
  const setView = useUIStore((s) => s.setView);
  const [challengeTarget, setChallengeTarget] = useState<OnlineUser | null>(null);

  if (!data) return null;

  const online = data.online;
  const friends = new Set<string>(data.friends.map((f) => f.id));
  const friendReqSent = new Set<string>(data.friendRequests.map((r) => r.senderId));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {online.length === 0
            ? "لا يوجد رياضيون متصلون حالياً. تحقّق لاحقاً!"
            : `${online.length} رياضي متصل الآن`}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
          <ChevronLeft className="h-4 w-4" />
          لوحة التحكم
        </Button>
      </div>

      {online.length === 0 ? (
        <Card className="glass border border-[var(--glass-border)] p-8 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">سيظهر هنا كل رياضي متصل. ادعُ أصدقاءك!</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {online.map((u, i) => {
            const isFriend = friends.has(u.id);
            const isPendingReq = friendReqSent.has(u.id);
            return (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
              >
                <Card className="glass h-full border border-[var(--glass-border)] p-4 transition-all hover:scale-[1.01] hover:border-accent/30">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-700 text-white font-bold">
                        {u.studentName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{u.studentName}</p>
                      <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="glass gap-0.5 text-[10px]">
                          <Crown className="h-3 w-3 text-warning" />
                          {u.level}
                        </Badge>
                        <Badge variant="secondary" className="glass gap-0.5 text-[10px]">
                          <Coins className="h-3 w-3 text-accent" />
                          <span className="font-mono">{u.pvpPoints}</span>
                        </Badge>
                        {u.currentStatus === "playing" && (
                          <Badge className="bg-destructive/15 text-destructive gap-0.5 text-[10px]">
                            مشغول
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {!isFriend && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="glass flex-1"
                        disabled={isPendingReq || friendReqSent.has(u.id)}
                        onClick={() => onAddFriend(u.id)}
                      >
                        {isPendingReq ? (
                          <>
                            <Check className="h-3 w-3" /> تم
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3 w-3" /> صديق
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gradient-primary flex-1 text-white"
                      disabled={u.currentStatus === "playing"}
                      onClick={() => setChallengeTarget(u)}
                    >
                      <Swords className="h-3 w-3" />
                      تحدٍّ
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Challenge tier dialog */}
      <ChallengeDialog
        key={`lobby-challenge-${challengeTarget?.id ?? "none"}`}
        target={challengeTarget}
        tiers={data.gameConfig.tiers}
        myPoints={data.myPoints}
        onClose={() => setChallengeTarget(null)}
        onConfirm={(tier) => {
          if (challengeTarget) {
            onSendInvite(challengeTarget.id, tier);
            setChallengeTarget(null);
          }
        }}
      />
    </div>
  );
}

function ChallengeDialog({
  target,
  tiers,
  myPoints,
  onClose,
  onConfirm,
}: {
  target: OnlineUser | null;
  tiers: TierConfig[];
  myPoints: number;
  onClose: () => void;
  onConfirm: (tier: 1 | 2 | 3) => void;
}) {
  // Reset to tier 1 each time the dialog opens for a different target.
  // Using `key` on the parent remounts this component, so `useState(1)`
  // initializes fresh.
  const [selected, setSelected] = useState<1 | 2 | 3>(1);

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-strong border border-[var(--glass-border)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-accent" />
            تحدَّ {target?.studentName ?? ""}
          </DialogTitle>
          <DialogDescription>اختر الفئة المناسبة لمستواك</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {tiers.map((t) => {
            const st = TIER_STYLES[t.id] ?? TIER_STYLES[1];
            const isOpen = t.status === 1;
            const canAfford = myPoints >= t.loss;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => isOpen && canAfford && setSelected(t.id)}
                disabled={!isOpen || !canAfford}
                className={`w-full rounded-xl border p-3 text-right transition-all ${
                  selected === t.id ? "border-primary bg-primary/10" : "border-[var(--glass-border)]"
                } ${!isOpen || !canAfford ? "cursor-not-allowed opacity-50" : "hover:border-primary/50"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{st.icon}</span>
                    <div>
                      <p className="font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.q} سؤال · {t.time} دقيقة
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-success">+{t.win} ربح</p>
                    <p className="text-xs text-destructive">-{t.loss} رهان</p>
                  </div>
                </div>
                {!isOpen && t.msg && (
                  <p className="mt-2 text-xs text-warning">{t.msg}</p>
                )}
                {isOpen && !canAfford && (
                  <p className="mt-2 text-xs text-destructive">
                    نقاطك غير كافية (تحتاج {t.loss} نقطة)
                  </p>
                )}
              </button>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="flex-1">
              إلغاء
            </Button>
          </DialogClose>
          <Button
            onClick={() => onConfirm(selected)}
            className="flex-1 gradient-primary text-white"
          >
            <Swords className="h-4 w-4" />
            تأكيد التحدّي
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Friends tab
// ---------------------------------------------------------------------------

function FriendsTab({
  data,
  onAccept,
  onReject,
  onRemove,
  onClearRejection,
  onSendInvite,
}: {
  data: LobbyData | undefined;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onRemove: (friendId: string) => void;
  onClearRejection: (rejectionId: string) => void;
  onSendInvite: (targetId: string, tier: 1 | 2 | 3) => void;
}) {
  const [challengeTarget, setChallengeTarget] = useState<FriendUser | null>(null);

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Incoming friend requests */}
      {data.friendRequests.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <UserPlus className="h-4 w-4 text-primary" />
            طلبات الصداقة ({data.friendRequests.length})
          </h3>
          <div className="space-y-2">
            {data.friendRequests.map((r) => (
              <Card
                key={r.id}
                className="glass flex items-center justify-between border border-[var(--glass-border)] p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-700 text-white text-sm font-bold">
                      {r.senderName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-sm">{r.senderName}</p>
                    <p className="text-xs text-muted-foreground">
                      @{r.senderUsername} · مستوى {r.senderLevel}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onAccept(r.id)} className="gradient-primary text-white">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReject(r.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Rejections surfaced */}
      {data.friendRejections.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-muted-foreground">طلبات مرفوضة</h3>
          <div className="space-y-2">
            {data.friendRejections.map((r) => (
              <Card
                key={r.id}
                className="glass flex items-center justify-between border border-warning/20 bg-warning/5 p-3"
              >
                <p className="text-sm">
                  رفض <span className="font-bold">{r.otherUserName}</span> طلبك
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onClearRejection(r.id)}
                >
                  مسح
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Friends list */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Users className="h-4 w-4 text-primary" />
          أصدقاؤك ({data.friends.length})
        </h3>
        {data.friends.length === 0 ? (
          <Card className="glass border border-[var(--glass-border)] p-6 text-center">
            <p className="text-sm text-muted-foreground">
              لا أصدقاء بعد. ابحث عن رياضيين متصلين في تبويب "الروّاد" وادعُهم!
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.friends.map((f) => (
              <Card
                key={f.friendshipId}
                className={`glass flex flex-col gap-3 border p-3 ${
                  f.isOnline
                    ? "border-success/30 bg-success/5"
                    : "border-[var(--glass-border)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-700 text-white font-bold">
                      {f.studentName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-sm">{f.studentName}</p>
                    <p className="truncate text-[10px] text-muted-foreground">@{f.username}</p>
                  </div>
                  <Badge variant="secondary" className="glass text-[10px]">
                    {f.isOnline ? "الآن" : lastSeenLabel(f.lastActivityAgoSec)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="gradient-primary flex-1 text-white"
                    disabled={f.currentStatus === "playing"}
                    onClick={() => setChallengeTarget(f)}
                  >
                    <Swords className="h-3 w-3" />
                    تحدٍّ
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive">
                        <UserMinus className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>حذف الصديق؟</AlertDialogTitle>
                        <AlertDialogDescription>
                          سيتم حذف {f.studentName} من قائمة أصدقائك. يمكنك إضافته مجدداً لاحقاً.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white"
                          onClick={() => onRemove(f.id)}
                        >
                          حذف
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Challenge dialog (friends version — reuses the same dialog) */}
      <ChallengeDialog
        key={`friends-challenge-${challengeTarget?.id ?? "none"}`}
        target={challengeTarget ? { ...challengeTarget } : null}
        tiers={data.gameConfig.tiers}
        myPoints={data.myPoints}
        onClose={() => setChallengeTarget(null)}
        onConfirm={(tier) => {
          if (challengeTarget) {
            onSendInvite(challengeTarget.id, tier);
            setChallengeTarget(null);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard tab
// ---------------------------------------------------------------------------

function LeaderboardTab({
  data,
  userId,
}: {
  data: LobbyData | undefined;
  userId: string;
}) {
  if (!data) return null;
  const medals = [Crown, Medal, Trophy];

  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-muted-foreground">
        ترتيبك الحالي: <span className="font-mono font-bold gradient-text">#{data.myRank}</span> ·
        إجمالي {data.leaderboard.length > 0 ? "أكثر من" : "0"} لاعب
      </p>
      {data.leaderboard.map((e, i) => {
        const Med = medals[i] ?? Trophy;
        const isMe = e.id === userId;
        return (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
          >
            <Card
              className={`glass flex items-center gap-3 border p-3 ${
                isMe
                  ? "border-primary/50 bg-primary/5"
                  : "border-[var(--glass-border)]"
              } ${i < 3 ? "ring-1 ring-accent/20" : ""}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono font-bold ${
                  i === 0
                    ? "bg-yellow-500/20 text-yellow-500"
                    : i === 1
                      ? "bg-gray-400/20 text-gray-400"
                      : i === 2
                        ? "bg-orange-700/20 text-orange-700"
                        : "glass text-muted-foreground"
                }`}
              >
                {i < 3 ? <Med className="h-5 w-5" /> : e.rank}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {e.studentName}
                  {isMe && (
                    <span className="mr-2 text-xs text-primary">(أنت)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">@{e.username} · مستوى {e.level}</p>
              </div>
              <div className="text-left">
                <div className="font-mono text-lg font-bold gradient-text">{e.pvpPoints}</div>
                <div className="text-[10px] text-muted-foreground">نقطة PVP</div>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab (paginated)
// ---------------------------------------------------------------------------

function HistoryTab() {
  const [page, setPage] = useState(1);
  const q = useQuery<HistoryPage>({
    queryKey: ["pvp", "history", page],
    queryFn: () =>
      postJson<HistoryPage>({ action: "get_history_page", page }),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!q.data || q.data.history.length === 0) {
    return (
      <Card className="glass border border-[var(--glass-border)] p-8 text-center">
        <History className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          لا يوجد سجل قتال بعد. ابدأ تحدّياً ضد رياضي أو ضد الذكاء الاصطناعي ليظهر هنا.
        </p>
      </Card>
    );
  }

  const resultStyle: Record<string, string> = {
    win: "text-success",
    loss: "text-destructive",
    draw: "text-warning",
    cancelled: "text-muted-foreground",
    rejected: "text-muted-foreground",
    surrender: "text-destructive",
  };
  const resultLabel: Record<string, string> = {
    win: "فوز",
    loss: "خسارة",
    draw: "تعادل",
    cancelled: "ملغاة",
    rejected: "مرفوضة",
    surrender: "استسلام",
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {q.data.history.map((h, i) => (
          <motion.div
            key={`${h.kind}-${h.id}`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
          >
            <Card className="glass flex items-center gap-3 border border-[var(--glass-border)] p-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  h.kind === "ai"
                    ? "bg-purple-500/15 text-purple-500"
                    : "bg-accent/15 text-accent"
                }`}
              >
                {h.kind === "ai" ? <Bot className="h-5 w-5" /> : <Swords className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-sm">{h.opponent}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(h.date).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}
                  {h.tier ? ` · فئة ${h.tier}` : ""}
                </p>
              </div>
              <div className="text-left">
                <p className={`text-sm font-bold ${resultStyle[h.result]}`}>
                  {resultLabel[h.result]}
                </p>
                <p
                  className={`font-mono text-xs font-bold ${
                    h.points > 0 ? "text-success" : h.points < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {h.points > 0 ? "+" : ""}
                  {h.points}
                </p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={q.data.currentPage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          السابق
        </Button>
        <p className="text-xs text-muted-foreground">
          صفحة <span className="font-mono font-bold">{q.data.currentPage}</span> من{" "}
          <span className="font-mono">{q.data.totalPages}</span>
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={!q.data.hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          التالي
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </Button>
      </div>
    </div>
  );
}
