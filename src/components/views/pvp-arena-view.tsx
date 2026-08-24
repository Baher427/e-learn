"use client";

/**
 * PvpArenaView — ساحة اللعب (PVP + AI game arena)
 *
 * Reads `matchId` from `params`. Fetches the questions (text only — the
 * answer key stays server-side) via `check_incoming`. Renders a full-screen
 * chalkboard UI with the on-screen GameKeypad from `@/components/game/keypad`.
 *
 * Modes:
 *   - AI mode (params.mode === "ai" or activeGame.isAi):
 *       Simulate the bot client-side (random delay in [botMin, botMax], 85%
 *       correct). The final scoring is server-authoritative — only the user's
 *       `answers[] + timesMs[]` are sent; the server recomputes both the
 *       user's correctness AND the bot's correctness from the stored seed.
 *   - PVP mode:
 *       `submit_score` over socket.io every 1s (or on answer submit);
 *       listen for `opponent_score` events from the socket relay. As a
 *       fallback, also call `/api/pvp/sync?action=game_sync` every 2s.
 *
 * Endgame modal:
 *   - AI: submits the answers, gets back the win/loss.
 *   - PVP: waits for opponent to finish (or for game_sync to return 'completed').
 *
 * Surrender:
 *   - AlertDialog (shadcn SweetAlert2-style confirm). On confirm: POSTs
 *     `/api/pvp/sync?action=surrender_game` and navigates back.
 *
 * To break cross-reference cycles between timer-driven helpers (which the
 * React Compiler flags), we wrap each helper in a `useRef` updated by a
 * single layout effect. The timers then call `xxxRef.current(...)`, so the
 * timer setup doesn't need to re-run when the helper bodies change.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { useSocket } from "@/components/socket-provider";
import { GameKeypad } from "@/components/game/keypad";
import { Countdown } from "@/components/game/countdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Swords,
  Clock,
  Hash,
  Flag,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicQuestion {
  i: number;
  q: string;
  terms: (number | string)[];
}

interface IncomingResponse {
  invite: unknown | null;
  activeGame: {
    id: string;
    isAi: boolean;
    questionCount: number;
    tier: number;
    questions: PublicQuestion[];
  } | null;
}

interface AiSubmitResponse {
  status: "win" | "loss";
  myScore: number;
  myWrong: number;
  myTimeMs: number;
  oppScore: number;
  oppTimeMs: number;
  pointsAwarded: number;
  winReason: string;
  resultStatus: "win" | "loss";
}

interface SyncResponse {
  status: "playing" | "completed" | "ended";
  myScore?: number;
  oppScore?: number;
  oppProgress?: number;
  opponentFinished?: boolean;
  iFinished?: boolean;
  winnerId?: string | null;
  check_result?: {
    winnerId: string | null;
    pot: number;
    myScore: number;
    oppScore: number;
  };
}

interface EndResult {
  title: string;
  color: string;
  detail: string;
  pointsAwarded: number;
  isWin: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
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

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}`;
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function PvpArenaView({ params }: { params: Record<string, string> }) {
  const matchId = params.matchId;
  const aiMode = params.mode === "ai";
  const setView = useUIStore((s) => s.setView);
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [isAi, setIsAi] = useState<boolean>(aiMode);
  const [tier, setTier] = useState<number>(1);

  // Game state
  const [phase, setPhase] = useState<"loading" | "countdown" | "playing" | "ended">("loading");
  const [qIndex, setQIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [inputEnabled, setInputEnabled] = useState(false);
  const [answers, setAnswers] = useState<Array<{ questionIndex: number; userAnswer: number | string }>>([]);
  const [timesMs, setTimesMs] = useState<number[]>([]);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  const [surrenderOpen, setSurrenderOpen] = useState(false);
  const [endResult, setEndResult] = useState<EndResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [botMin] = useState(1500);
  const [botMax] = useState(3000);

  const qStartRef = useRef<number>(0);
  const matchRoomJoinedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs that hold the latest versions of the cross-referenced helpers.
  // The React Compiler flags direct calls between helper functions defined
  // later in the component as "accessed before declared". Indirection via
  // a ref gives the compiler a stable target and lets the helpers update
  // their captured state on each render.
  const scheduleNextBotMoveRef = useRef<() => void>(() => {});
  const doGameSyncRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const finishWithResultRef = useRef<
    (r: { winnerId: string | null; pot: number; myScore: number; oppScore: number }) => void
  >(() => {});
  const endGameRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const submitAnswerRef = useRef<() => void>(() => {});

  // ---- Fetch the questions (text only — server strips the answers) ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await postJson<IncomingResponse>("/api/pvp/invite", {
          action: "check_incoming",
        });
        if (cancelled) return;
        const ag = data.activeGame;
        if (!ag || ag.id !== matchId) {
          setError("هذه المباراة غير نشطة بعد. عد إلى الساحة.");
          setLoading(false);
          return;
        }
        setQuestions(ag.questions);
        setIsAi(ag.isAi);
        setTier(ag.tier);
        setLoading(false);
        setPhase("countdown");
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }
    if (matchId) load();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // ---- Join the socket.io match room ----
  useEffect(() => {
    if (!socket || !connected || !user || !matchId || matchRoomJoinedRef.current) return;
    socket.emit("join_match", { matchId, userId: user.id });
    matchRoomJoinedRef.current = true;
  }, [socket, connected, user, matchId]);

  // ---- Listen for opponent_score / opponent_surrendered events ----
  useEffect(() => {
    if (!socket || !matchId) return;
    const onOpponentScore = (payload: {
      matchId: string;
      userId: string;
      score: number;
      progress: number;
      finished: boolean;
    }) => {
      if (payload.matchId !== matchId) return;
      if (payload.userId === user?.id) return;
      setOpponentScore(payload.score);
      setOpponentProgress(payload.progress);
      setOpponentFinished(payload.finished);
    };
    const onOpponentSurrendered = () => {
      toast.success("استسلم الخصم! 🏳️");
      void doGameSyncRef.current();
    };
    socket.on("opponent_score", onOpponentScore);
    socket.on("opponent_surrendered", onOpponentSurrendered);
    return () => {
      socket.off("opponent_score", onOpponentScore);
      socket.off("opponent_surrendered", onOpponentSurrendered);
    };
  }, [socket, matchId, user?.id]);

  // ---- Helper definitions (updated on every render via the layout effect below) ----

  function scheduleNextBotMove() {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    const delay = botMin + Math.floor(Math.random() * (botMax - botMin + 1));
    botTimerRef.current = setTimeout(() => {
      // 85% chance of correct → bump bot score; else just bump progress
      if (Math.random() > 0.15) {
        setOpponentScore((s) => s + 1);
      }
      setOpponentProgress((p) => {
        const next = p + 1;
        // Schedule the next move if we haven't exhausted the questions
        if (phase === "playing" && next < questions.length) {
          scheduleNextBotMoveRef.current();
        } else {
          setOpponentFinished(true);
        }
        return next;
      });
    }, delay);
  }

  async function doGameSync() {
    if (!matchId) return;
    try {
      const data = await postJson<SyncResponse>("/api/pvp/sync", {
        action: "game_sync",
        matchId,
      });
      if (data.status === "completed" && data.check_result) {
        finishWithResultRef.current(data.check_result);
      } else if (data.status === "ended") {
        setEndResult({
          title: data.winnerId === user?.id ? "فزت! 🏆" : "انتهت المباراة",
          color: data.winnerId === user?.id ? "text-success" : "text-muted-foreground",
          detail: `نتيجتك: ${data.myScore ?? 0} · الخصم: ${data.oppScore ?? 0}`,
          pointsAwarded: 0,
          isWin: data.winnerId === user?.id,
        });
        setPhase("ended");
      } else {
        if (typeof data.oppScore === "number") setOpponentScore(data.oppScore);
        if (typeof data.oppProgress === "number") setOpponentProgress(data.oppProgress);
        if (typeof data.opponentFinished === "boolean") setOpponentFinished(data.opponentFinished);
      }
    } catch (e) {
      // Silent — the socket.io path takes over
      console.error("game_sync error:", e);
    }
  }

  function finishWithResult(r: {
    winnerId: string | null;
    pot: number;
    myScore: number;
    oppScore: number;
  }) {
    const iWon = r.winnerId === user?.id;
    const isDraw = r.winnerId === null;
    setEndResult({
      title: isDraw ? "تعادل! 🤝" : iWon ? "فزت! 🏆" : "خسرت 😢",
      color: isDraw ? "text-warning" : iWon ? "text-success" : "text-destructive",
      detail: `نتيجتك: ${r.myScore} · الخصم: ${r.oppScore}${iWon ? ` · +${r.pot} نقطة` : ""}`,
      pointsAwarded: iWon ? r.pot : 0,
      isWin: iWon,
    });
    setPhase("ended");
  }

  async function endGame() {
    if (submitting) return;
    setSubmitting(true);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    if (botTimerRef.current) clearTimeout(botTimerRef.current);

    try {
      if (isAi) {
        const data = await postJson<AiSubmitResponse>("/api/pvp/ai", {
          action: "submit_ai_score",
          matchId,
          answers,
          timesMs,
        });
        setEndResult({
          title: data.status === "win" ? "فزت على الذكاء الاصطناعي! 🏆" : "تفوّق عليك الروبوت 🤖",
          color: data.status === "win" ? "text-success" : "text-destructive",
          detail: `نتيجتك: ${data.myScore}/${data.myScore + data.myWrong} · الروبوت: ${data.oppScore} (${data.winReason})`,
          pointsAwarded: data.pointsAwarded,
          isWin: data.status === "win",
        });
      } else {
        if (socket && user) {
          socket.emit("submit_score", {
            matchId,
            userId: user.id,
            score: answers.length,
            progress: answers.length,
            finished: true,
          });
        }
        const data = await postJson<SyncResponse>("/api/pvp/sync", {
          action: "game_sync",
          matchId,
        });
        if (data.status === "completed" && data.check_result) {
          finishWithResultRef.current(data.check_result);
        } else {
          setEndResult({
            title: "بانتظار الخصم…",
            color: "text-warning",
            detail: `نتيجتك المبدئية: ${myScore} · تابع التقدّم`,
            pointsAwarded: 0,
            isWin: false,
          });
          syncTimerRef.current = setInterval(() => {
            void doGameSyncRef.current();
          }, 1500);
        }
      }
      setPhase("ended");
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitting(false);
    }
  }

  function submitAnswer() {
    if (phase !== "playing" || !inputEnabled) return;
    if (!userInput) {
      toast.error("أدخل إجابة أولاً");
      return;
    }
    const dt = performance.now() - qStartRef.current;
    const userNum = parseInt(userInput, 10);
    setAnswers((prev) => [...prev, { questionIndex: qIndex, userAnswer: userNum }]);
    setTimesMs((prev) => [...prev, dt]);
    setMyScore((prev) => prev + 1);
    setUserInput("");
    setInputEnabled(false);

    if (socket && user && !isAi) {
      socket.emit("submit_score", {
        matchId,
        userId: user.id,
        score: answers.length + 1,
        progress: qIndex + 1,
        finished: qIndex + 1 >= questions.length,
      });
    }

    if (qIndex + 1 >= questions.length) {
      void endGameRef.current();
    } else {
      setTimeout(() => {
        setQIndex((i) => i + 1);
      }, 500);
    }
  }

  function addDigit(d: string) {
    if (!inputEnabled) return;
    setUserInput((prev) => (prev.length >= 9 ? prev : prev + d));
  }
  function deleteDigit() {
    if (!inputEnabled) return;
    setUserInput((prev) => prev.slice(0, -1));
  }
  function onReady() {
    setInputEnabled(true);
    qStartRef.current = performance.now();
  }

  async function doSurrender() {
    setSurrenderOpen(false);
    try {
      if (socket && user) {
        socket.emit("surrender", { matchId, userId: user.id, opponentId: "" });
      }
      await postJson("/api/pvp/sync", {
        action: "surrender_game",
        matchId,
      });
      toast.info("تم تسجيل الاستسلام");
      setEndResult({
        title: "استسلمت 🏳️",
        color: "text-destructive",
        detail: "تم احتساب المباراة كخسارة",
        pointsAwarded: 0,
        isWin: false,
      });
      setPhase("ended");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function leaveArena() {
    if (socket && user && matchId) {
      socket.emit("leave_match", { matchId, userId: user.id });
    }
    setView("pvp");
  }

  // ---- Update the helper refs on every render via a layout effect ----
  // This is the recommended pattern for breaking "accessed before declared"
  // cycles in the React Compiler.
  useEffect(() => {
    scheduleNextBotMoveRef.current = scheduleNextBotMove;
    doGameSyncRef.current = doGameSync;
    finishWithResultRef.current = finishWithResult;
    endGameRef.current = endGame;
    submitAnswerRef.current = submitAnswer;
  });

  // ---- When playing starts: set initial timer, kick off AI bot if needed ----
  // Note: the initial `setRemainingSec(...)` is needed to seed the countdown
  // when the game transitions from "countdown" → "playing". The setState-in-
  // effect rule has a carve-out for "initialize external system on mount/
  // transition" — this is that pattern.
  useEffect(() => {
    if (phase !== "playing") return;
    const initialSec = isAi ? 7 * 60 : 5 * 60;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemainingSec(initialSec);

    countdownTimerRef.current = setInterval(() => {
      setRemainingSec((s) => {
        if (s <= 1) {
          void endGameRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    if (!isAi) {
      syncTimerRef.current = setInterval(() => {
        void doGameSyncRef.current();
      }, 2000);
    }

    if (isAi) {
      scheduleNextBotMoveRef.current();
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [phase, isAi]);

  // ---- Keyboard support (uses submitAnswerRef for stability) ----
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        addDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        deleteDigit();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitAnswerRef.current();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSurrenderOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, inputEnabled]);

  // ---- Render ----
  if (loading || !matchId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8 text-center" dir="rtl">
        <Card className="glass border border-destructive/30 p-6">
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <Button onClick={leaveArena} className="gradient-primary text-white">
            <ArrowRight className="h-4 w-4" />
            العودة للساحة
          </Button>
        </Card>
      </div>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6" dir="rtl">
        <PreGameCard isAi={isAi} tier={tier} questionCount={questions.length} />
        <Countdown onComplete={() => setPhase("playing")} />
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <EndGameModal result={endResult} submitting={submitting} onLeave={leaveArena} />
    );
  }

  // phase === "playing"
  const currentQ = questions[qIndex];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6" dir="rtl">
      {/* ---- Top bar ---- */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <AlertDialog open={surrenderOpen} onOpenChange={setSurrenderOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Flag className="h-4 w-4" />
              استسلام
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الاستسلام؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم احتساب المباراة كخسارة. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white"
                onClick={() => void doSurrender()}
              >
                استسلام
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="flex items-center gap-2">
          <Badge className="glass gap-1" variant="secondary">
            <Clock className="h-3 w-3 text-warning" />
            <span className="font-mono" dir="ltr">
              {formatTime(remainingSec)}
            </span>
          </Badge>
          <Badge className="glass gap-1" variant="secondary">
            <Hash className="h-3 w-3 text-primary" />
            <span className="font-mono">{qIndex + 1}</span>/{questions.length}
          </Badge>
        </div>
      </div>

      <Progress
        value={Math.min(((qIndex + 1) / questions.length) * 100, 100)}
        className="mb-4"
      />

      {/* ---- Player stats ---- */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <PlayerCard
          name={user?.studentName ?? "أنا"}
          score={myScore}
          progress={qIndex}
          isMe
          icon={<Swords className="h-4 w-4 text-primary" />}
        />
        <PlayerCard
          name={isAi ? "الروبوت 🤖" : "الخصم"}
          score={opponentScore}
          progress={opponentProgress}
          finished={opponentFinished}
          icon={
            isAi ? (
              <Bot className="h-4 w-4 text-purple-500" />
            ) : (
              <Swords className="h-4 w-4 text-destructive" />
            )
          }
        />
      </div>

      {/* ---- Chalkboard ---- */}
      <Card className="glass-strong border border-[var(--glass-border)] p-6">
        {currentQ ? <QuestionBlock question={currentQ} onReady={onReady} qIndex={qIndex} /> : null}

        {/* Input display */}
        <div className="my-4 flex items-center justify-center">
          <motion.div
            animate={{
              boxShadow: inputEnabled ? "0 0 0 3px var(--ring)" : "0 0 0 0 transparent",
              opacity: inputEnabled ? 1 : 0.5,
            }}
            className="glass-input flex min-h-16 min-w-32 items-center justify-center rounded-2xl px-6 font-mono text-3xl font-bold sm:text-4xl"
            dir="ltr"
          >
            {userInput || <span className="text-muted-foreground">؟</span>}
          </motion.div>
        </div>
      </Card>

      {/* ---- Keypad ---- */}
      <div className="mt-4">
        <GameKeypad
          onNum={addDigit}
          onDelete={deleteDigit}
          onSubmit={() => submitAnswerRef.current()}
          disabled={!inputEnabled}
          submitDisabled={!userInput}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PreGameCard({
  isAi,
  tier,
  questionCount,
}: {
  isAi: boolean;
  tier: number;
  questionCount: number;
}) {
  const setView = useUIStore((s) => s.setView);
  return (
    <Card className="glass border border-[var(--glass-border)] p-6 text-center">
      <div
        className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg ${
          isAi
            ? "bg-gradient-to-br from-violet-500 to-purple-700"
            : "bg-gradient-to-br from-accent to-purple-600"
        }`}
      >
        {isAi ? <Bot className="h-8 w-8" /> : <Swords className="h-8 w-8" />}
      </div>
      <h1 className="mb-2 text-xl font-bold sm:text-2xl">
        {isAi ? "تحدّي الذكاء الاصطناعي" : "مباراة PVP"}
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        الاستعدادات جارية… ابدأ التركيز، فالعدّ التنازلي على وشك البدء!
      </p>
      <div className="mx-auto max-w-xs">
        <Badge variant="secondary" className="glass mb-1 w-full justify-center gap-1.5">
          <Hash className="h-3 w-3 text-primary" />
          {questionCount} سؤال · فئة {tier}
        </Badge>
      </div>
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setView("pvp")}>
        <ArrowRight className="h-4 w-4" />
        إلغاء
      </Button>
    </Card>
  );
}

function PlayerCard({
  name,
  score,
  progress,
  isMe,
  finished,
  icon,
}: {
  name: string;
  score: number;
  progress: number;
  isMe?: boolean;
  finished?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card
      className={`glass p-3 ${
        isMe ? "border-primary/30 bg-primary/5" : "border-[var(--glass-border)]"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="truncate text-sm font-bold">{name}</p>
        {finished && (
          <Badge variant="secondary" className="ml-auto bg-success/15 text-success text-[10px]">
            انتهى
          </Badge>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-2xl font-bold gradient-text">{score}</div>
          <div className="text-[10px] text-muted-foreground">صحيحة (مبدئي)</div>
        </div>
        <div className="text-left">
          <div className="font-mono text-lg">{progress}</div>
          <div className="text-[10px] text-muted-foreground">تقدّم</div>
        </div>
      </div>
    </Card>
  );
}

function QuestionBlock({
  question,
  onReady,
  qIndex,
}: {
  question: PublicQuestion;
  onReady: () => void;
  qIndex: number;
}) {
  useEffect(() => {
    const t = setTimeout(onReady, 100);
    return () => clearTimeout(t);
  }, [onReady, qIndex]);

  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center py-4" dir="ltr">
      <motion.div
        key={`q-${qIndex}`}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center gap-1 font-mono"
      >
        {question.terms.map((term, i) => {
          if (typeof term === "string") {
            return (
              <span key={i} className="text-3xl font-bold text-primary sm:text-4xl">
                {term}
              </span>
            );
          }
          return (
            <span key={i} className="text-4xl font-bold sm:text-5xl">
              {term}
            </span>
          );
        })}
        <span className="mt-2 text-4xl font-bold text-warning sm:text-5xl">؟</span>
      </motion.div>
    </div>
  );
}

function EndGameModal({
  result,
  submitting,
  onLeave,
}: {
  result: EndResult | null;
  submitting: boolean;
  onLeave: () => void;
}) {
  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="glass-strong border border-[var(--glass-border)]"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-center">
            <Trophy className={`h-8 w-8 ${result?.color ?? "text-warning"}`} />
            <span className={result?.color ?? ""}>{result?.title ?? "جارٍ الحساب…"}</span>
          </DialogTitle>
          <DialogDescription className="text-center">
            {result?.detail ?? "بانتظار نتيجة الخادم…"}
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div className="text-center">
            {result.pointsAwarded > 0 && (
              <Badge className="bg-success/15 text-success text-base">
                +{result.pointsAwarded} نقطة
              </Badge>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            onClick={onLeave}
            className="gradient-primary flex-1 text-white"
            disabled={submitting && !result}
          >
            <ArrowRight className="h-4 w-4" />
            {submitting && !result ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                بانتظار النتيجة…
              </>
            ) : (
              "العودة للساحة"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
