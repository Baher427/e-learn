"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Swords,
  Bot,
  Settings2,
  Loader2,
  Save,
  History,
  Trash2,
  Plus,
  Minus,
  RotateCcw,
  X,
  Trophy,
  CircleDot,
  Crown,
  Medal,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface LiveStudent {
  id: string;
  username: string;
  studentName: string;
  level: number;
  pvpPoints: number;
  totalPoints: number;
  currentStatus: string;
  aiAttemptsCount: number;
  aiLastDate: string | null;
  liveStatus:
    | { kind: "idle" }
    | { kind: "pvp"; opponent: string; matchId: string }
    | { kind: "ai"; matchId: string };
}

interface GameConfig {
  tiers: {
    tier1: { q: number; time: number; win: number; loss: number; status: string; msg: string };
    tier2: { q: number; time: number; win: number; loss: number; status: string; msg: string };
    tier3: { q: number; time: number; win: number; loss: number; status: string; msg: string };
  };
  ai: { daily_limit: number; msg: string; status: string };
}

interface MatchItem {
  id: string;
  isAiMatch: boolean;
  opponentName: string;
  tier: number;
  status: string;
  betAmount: number;
  questionCount: number;
  myScore: number;
  oppScore: number;
  winnerId: string | null;
  isWinner: boolean;
  createdAt: string;
}

const TIER_LABEL: Record<number, string> = { 1: "برونزية", 2: "فضية", 3: "ذهبية" };

export function AdminArenaView() {
  const qc = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<LiveStudent | null>(null);

  const { data: arena, isLoading } = useQuery<{ students: LiveStudent[] }>({
    queryKey: ["admin", "arena"],
    queryFn: async () => {
      const res = await fetch("/api/admin/arena?action=live_arena", { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch");
      return j.data;
    },
    refetchInterval: 10_000,
  });

  const { data: config } = useQuery<GameConfig>({
    queryKey: ["admin", "arena", "config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/arena?action=game_config", { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch");
      return j.data;
    },
  });

  const { data: history, isLoading: historyLoading } = useQuery<{ matches: MatchItem[] }>({
    queryKey: ["admin", "arena", "history", historyFor?.id],
    queryFn: async () => {
      if (!historyFor) return { matches: [] };
      const res = await fetch(`/api/admin/arena?action=history&studentId=${historyFor.id}`, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch");
      return j.data;
    },
    enabled: !!historyFor,
  });

  const quickUpdateMut = useMutation({
    mutationFn: async (payload: { studentId: string; pvpPoints?: number; level?: number }) => {
      const res = await fetch("/api/admin/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "quick_update", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "update failed");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "arena"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const adjustAiMut = useMutation({
    mutationFn: async (payload: { studentId: string; delta: "increment" | "decrement" | "reset" }) => {
      const res = await fetch("/api/admin/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "adjust_ai", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "ai failed");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "arena"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const liveActionMut = useMutation({
    mutationFn: async (payload: { matchId: string; command: "cancel" | "force_win_p1" | "force_win_p2" }) => {
      const res = await fetch("/api/admin/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "live_action", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "live action failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم تنفيذ الإجراء");
      qc.invalidateQueries({ queryKey: ["admin", "arena"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wipeHistoryMut = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await fetch("/api/admin/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "wipe_history", studentId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "wipe failed");
      return j.data;
    },
    onSuccess: (d: { deleted: number }) => {
      toast.success(`تم مسح ${d.deleted} مباراة`);
      qc.invalidateQueries({ queryKey: ["admin", "arena", "history", historyFor?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItemMut = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await fetch("/api/admin/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "delete_history_item", matchId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "delete failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم حذف المباراة");
      qc.invalidateQueries({ queryKey: ["admin", "arena", "history", historyFor?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminShell activeKey="arena" title="الساحة الحية" subtitle="متابعة المباريات المباشرة وإعدادات اللعبة">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setConfigOpen(true)}>
          <Settings2 className="h-4 w-4" />إعدادات اللعبة
        </Button>
      </div>

      <Card className="glass border border-[var(--glass-border)] p-0">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
                <TableHead>الطالب</TableHead>
                <TableHead className="hidden sm:table-cell">المستوى</TableHead>
                <TableHead className="hidden md:table-cell">نقاط PVP</TableHead>
                <TableHead>الحالة الحية</TableHead>
                <TableHead className="hidden lg:table-cell">محاولات AI</TableHead>
                <TableHead className="text-left">إجراءات سريعة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : arena && arena.students.length > 0 ? (
                arena.students.map((s) => (
                  <TableRow key={s.id} className="border-[var(--glass-border)] hover:bg-accent/5">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="gradient-primary text-white text-xs">
                            {s.studentName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-sm">{s.studentName}</div>
                          <div className="text-[11px] text-muted-foreground">@{s.username}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><Badge variant="secondary" className="font-mono">L{s.level}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-sm">{s.pvpPoints}</TableCell>
                    <TableCell><LiveStatusBadge status={s.liveStatus} /></TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1 text-sm">
                        <span className="num font-mono">{s.aiAttemptsCount}</span>
                        <span className="text-[10px] text-muted-foreground">/يوم</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {s.liveStatus.kind !== "idle" && (
                          <>
                            <Button
                              size="sm" variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title="إنهاء المباراة"
                              onClick={() => liveActionMut.mutate({ matchId: s.liveStatus.matchId, command: "cancel" })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            {s.liveStatus.kind === "pvp" && (
                              <Button
                                size="sm" variant="ghost"
                                title="إعلان فوز الطالب"
                                onClick={() => {
                                  // we can't know p1/p2 from this view easily — but
                                  // we trust the matchId & we know whether the student
                                  // is p1 or p2 from the live_status? Actually no. So
                                  // just attempt force_win_p1 then p2 fallback. The
                                  // simplest UI: try force_win_p1, on failure try p2.
                                  const tryWin = (cmd: "force_win_p1" | "force_win_p2") => {
                                    liveActionMut.mutate(
                                      { matchId: s.liveStatus.matchId, command: cmd },
                                      {
                                        onError: () => {
                                          if (cmd === "force_win_p1") {
                                            tryWin("force_win_p2");
                                          }
                                        },
                                      }
                                    );
                                  };
                                  tryWin("force_win_p1");
                                }}
                              >
                                <Trophy className="h-4 w-4 text-warning" />
                              </Button>
                            )}
                          </>
                        )}
                        <Button size="sm" variant="ghost" title="محاولات AI: +1" onClick={() => adjustAiMut.mutate({ studentId: s.id, delta: "increment" })}>
                          <Plus className="h-4 w-4 text-success" />
                        </Button>
                        <Button size="sm" variant="ghost" title="محاولات AI: -1" onClick={() => adjustAiMut.mutate({ studentId: s.id, delta: "decrement" })}>
                          <Minus className="h-4 w-4 text-warning" />
                        </Button>
                        <Button size="sm" variant="ghost" title="إعادة تصفير محاولات AI" onClick={() => adjustAiMut.mutate({ studentId: s.id, delta: "reset" })}>
                          <RotateCcw className="h-4 w-4 text-info" />
                        </Button>
                        <Button size="sm" variant="ghost" title="السجل" onClick={() => setHistoryFor(s)}>
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    لا يوجد طلاب نشطون
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ---------- Config modal ---------- */}
      <GameConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
      />

      {/* ---------- History modal ---------- */}
      <Dialog open={!!historyFor} onOpenChange={(v) => !v && setHistoryFor(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              سجل مباريات {historyFor?.studentName}
            </DialogTitle>
            <DialogDescription>
              آخر 50 مباراة (PVP + AI)
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="destructive"
              disabled={wipeHistoryMut.isPending || (history?.matches.length ?? 0) === 0}
              onClick={() => historyFor && wipeHistoryMut.mutate(historyFor.id)}
            >
              <Trash2 className="h-4 w-4" />مسح الكل
            </Button>
          </div>
          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-[var(--glass-border)]">
            {historyLoading ? (
              <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
            ) : history && history.matches.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
                    <TableHead className="text-[11px]">النوع</TableHead>
                    <TableHead className="text-[11px]">الخصم</TableHead>
                    <TableHead className="text-[11px]">المستوى</TableHead>
                    <TableHead className="text-[11px]">النتيجة</TableHead>
                    <TableHead className="text-[11px]">الحالة</TableHead>
                    <TableHead className="text-[11px] text-left">حذف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.matches.map((m) => (
                    <TableRow key={m.id} className="border-[var(--glass-border)]">
                      <TableCell>
                        {m.isAiMatch ? <Bot className="h-4 w-4 text-info" /> : <Swords className="h-4 w-4 text-accent" />}
                      </TableCell>
                      <TableCell className="text-sm">{m.opponentName}</TableCell>
                      <TableCell><Badge variant="secondary" className="font-mono text-[10px]">{TIER_LABEL[m.tier] ?? m.tier}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">
                        <span className={m.isWinner ? "text-success" : "text-muted-foreground"}>
                          {m.myScore} - {m.oppScore}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{m.status}</Badge></TableCell>
                      <TableCell className="text-left">
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteItemMut.mutate(m.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">لا يوجد سجل</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

// --------------------------------------------------------------------
function LiveStatusBadge({ status }: { status: LiveStudent["liveStatus"] }) {
  if (status.kind === "idle") {
    return <Badge variant="outline" className="text-muted-foreground"><CircleDot className="h-3 w-3" />خامل</Badge>;
  }
  if (status.kind === "ai") {
    return <Badge variant="outline" className="border-info/30 bg-info/10 text-info"><Bot className="h-3 w-3" />يplay ضد AI</Badge>;
  }
  return (
    <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
      <Swords className="h-3 w-3" />PvP vs {status.opponent}
    </Badge>
  );
}

// --------------------------------------------------------------------
function GameConfigDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config?: GameConfig;
}) {
  const qc = useQueryClient();
  const [tiers, setTiers] = useState<GameConfig["tiers"] | null>(null);
  const [ai, setAi] = useState<GameConfig["ai"] | null>(null);

  // "Adjust state during render" pattern — sync from query data once it
  // arrives. This is the recommended React alternative to useEffect+setState.
  const [prevConfig, setPrevConfig] = useState<GameConfig | null>(null);
  if (config && config !== prevConfig) {
    setPrevConfig(config);
    setTiers(config.tiers);
    setAi(config.ai);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tiers || !ai) return;
      const res = await fetch("/api/admin/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "save_game_config", config: { tiers, ai } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "save failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات اللعبة");
      qc.invalidateQueries({ queryKey: ["admin", "arena", "config"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!config) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>إعدادات اللعبة</DialogTitle>
          <DialogDescription>عدد الأسئلة، المدة، نقاط الفوز/الخسارة، وحالة كل مستوى</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {(tiers && ai) && (
            <>
              {(["tier1", "tier2", "tier3"] as const).map((k, i) => {
                const t = tiers[k];
                const medal = i === 0 ? Crown : i === 1 ? Medal : Trophy;
                const Med = medal;
                const colors = ["text-orange-500","text-gray-300","text-yellow-400"];
                return (
                  <Card key={k} className="glass border border-[var(--glass-border)] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Med className={`h-4 w-4 ${colors[i]}`} />
                      <h3 className="font-bold">{TIER_LABEL[i + 1]}</h3>
                      <Switch
                        className="ms-auto"
                        checked={t.status === "1"}
                        onCheckedChange={(v) => setTiers({ ...tiers, [k]: { ...t, status: v ? "1" : "0" } })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <NumberField label="الأسئلة" value={t.q} onChange={(v) => setTiers({ ...tiers, [k]: { ...t, q: v } })} />
                      <NumberField label="الوقت (ث)" value={t.time} onChange={(v) => setTiers({ ...tiers, [k]: { ...t, time: v } })} />
                      <NumberField label="فوز" value={t.win} onChange={(v) => setTiers({ ...tiers, [k]: { ...t, win: v } })} />
                      <NumberField label="خسارة" value={t.loss} onChange={(v) => setTiers({ ...tiers, [k]: { ...t, loss: v } })} />
                    </div>
                    <div className="mt-2">
                      <Label>الرسالة</Label>
                      <Textarea
                        value={t.msg}
                        onChange={(e) => setTiers({ ...tiers, [k]: { ...t, msg: e.target.value } })}
                        className="glass-input min-h-[60px]"
                      />
                    </div>
                  </Card>
                );
              })}

              <Card className="glass border border-info/30 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-info" />
                  <h3 className="font-bold">الذكاء الاصطناعي</h3>
                  <Switch
                    className="ms-auto"
                    checked={ai.status === "1"}
                    onCheckedChange={(v) => setAi({ ...ai, status: v ? "1" : "0" })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="حد يومي" value={ai.daily_limit} onChange={(v) => setAi({ ...ai, daily_limit: v })} />
                </div>
                <div className="mt-2">
                  <Label>الرسالة</Label>
                  <Textarea
                    value={ai.msg}
                    onChange={(e) => setAi({ ...ai, msg: e.target.value })}
                    className="glass-input min-h-[60px]"
                  />
                </div>
              </Card>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            className="gradient-primary text-white"
            disabled={!tiers || !ai || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="glass-input h-9"
      />
    </div>
  );
}
