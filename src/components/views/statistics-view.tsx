"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
  Plus,
  X,
  Divide,
  TrendingUp,
  TrendingDown,
  Award,
  Target,
  Hash,
  CheckCircle2,
  Clock,
  Activity,
  BarChart3,
  PieChart as PieIcon,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/components/auth-context";
import { useUIStore } from "@/lib/ui-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// --------------------------------------------------------------------
// Types — mirror /api/statistics response shape
// --------------------------------------------------------------------

type GameType = "addition_subtraction" | "multiplication" | "division";

interface GeneralStats {
  totalTrainings: number;
  totalQuestions: number;
  totalCorrect: number;
  totalAccuracy: number;
  avgTime: number;
}

interface GamePerf {
  count: number;
  correct: number;
  total: number;
  time: number;
  avgScore: number;
  avgTime: number;
}

interface ImprovementRow {
  index: number;
  label: string;
  date: string;
  addition_subtraction: number | null;
  multiplication: number | null;
  division: number | null;
}

interface BarRow {
  gameType: GameType;
  label: string;
  avgScore: number;
  avgTime: number;
}

interface SettingsRow {
  label: string;
  count: number;
}

interface HistoryItem {
  id: string;
  gameType: GameType;
  settingsSummary: string;
  date: string;
  correctCount: number;
  questionCount: number;
  accuracy: number;
  avgTime: number;
  improvement: number | null;
}

interface StatsResponse {
  generalStats: GeneralStats;
  gamePerformance: Record<GameType, GamePerf>;
  chartData: {
    improvement: ImprovementRow[];
    barComparison: BarRow[];
    settingsDist: SettingsRow[];
  };
  bestGame: GameType | null;
  history: {
    items: HistoryItem[];
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
  };
  totalPoints: number;
}

// --------------------------------------------------------------------
// Static config (colors, labels, icons)
// --------------------------------------------------------------------

const CHART_COLORS: Record<GameType, string> = {
  addition_subtraction: "#6366f1", // chart-1 (indigo)
  multiplication: "#8b5cf6", // chart-2 (violet)
  division: "#10b981", // chart-3 (emerald)
};

const DOUGHNUT_PALETTE = [
  "#6366f1", // chart-1
  "#8b5cf6", // chart-2
  "#10b981", // chart-3
  "#f59e0b", // chart-4 (amber)
  "#f43f5e", // chart-5 (rose)
];

const BAR_COLORS = {
  avgScore: "#f59e0b", // amber
  avgTime: "#f43f5e", // rose
};

const GAME_META: Record<
  GameType,
  { label: string; icon: typeof Plus; color: string }
> = {
  addition_subtraction: {
    label: "الجمع والطرح",
    icon: Plus,
    color: CHART_COLORS.addition_subtraction,
  },
  multiplication: {
    label: "الضرب",
    icon: X,
    color: CHART_COLORS.multiplication,
  },
  division: {
    label: "القسمة",
    icon: Divide,
    color: CHART_COLORS.division,
  },
};

const FILTERS: { value: "all" | GameType; label: string }[] = [
  { value: "all", label: "كل الألعاب" },
  { value: "addition_subtraction", label: "الجمع والطرح" },
  { value: "multiplication", label: "الضرب" },
  { value: "division", label: "القسمة" },
];

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

function formatArabicDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

// --------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  delay,
}: {
  icon: typeof Plus;
  label: string;
  value: string;
  sub?: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="glass relative overflow-hidden border border-[var(--glass-border)] p-4 sm:p-6">
        <div
          className="absolute inset-x-0 top-0 h-1 opacity-80"
          style={{ background: color }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
            <p className="mt-1 font-mono text-2xl font-bold sm:text-3xl">
              {value}
            </p>
            {sub && <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{sub}</p>}
          </div>
          <div
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}22`, color }}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

interface TooltipCarrierProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string | number;
    payload?: ImprovementRow | BarRow;
  }>;
  label?: string | number;
}

function ImprovementTooltip({ active, payload, label }: TooltipCarrierProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as ImprovementRow | undefined;
  return (
    <div className="glass-strong rounded-lg border border-[var(--glass-border)] p-3 text-xs shadow-xl">
      <p className="mb-1 font-bold">{label ?? row?.label}</p>
      {row && (
        <p className="mb-2 text-[10px] text-muted-foreground">
          {formatArabicDate(row.date)}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="font-mono font-bold">
              {p.value !== undefined && p.value !== null
                ? `${fmtNum(p.value)}%`
                : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarTooltip({ active, payload, label }: TooltipCarrierProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-strong rounded-lg border border-[var(--glass-border)] p-3 text-xs shadow-xl">
      <p className="mb-2 font-bold">{label}</p>
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="font-mono font-bold">
              {p.name === "متوسط الوقت"
                ? `${fmtNum(p.value ?? 0)} ث`
                : `${fmtNum(p.value ?? 0)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoughnutTooltip({ active, payload }: TooltipCarrierProps) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const data = p?.payload as SettingsRow | undefined;
  if (!data) return null;
  return (
    <div className="glass-strong rounded-lg border border-[var(--glass-border)] p-3 text-xs shadow-xl">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: p.color }}
        />
        <span className="font-bold">{data.label}</span>
      </div>
      <p className="mt-1 font-mono">
        <span className="text-muted-foreground">عدد التدريبات: </span>
        <span className="font-bold">{data.count}</span>
      </p>
    </div>
  );
}

function GameTypeIcon({ gameType }: { gameType: GameType }) {
  const meta = GAME_META[gameType];
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
      style={{ background: `${meta.color}22`, color: meta.color }}
      title={meta.label}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function ImprovementBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const isUp = value >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  const color = isUp ? "text-emerald-500" : "text-rose-500";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono font-bold ${color}`}>
      <Icon className="h-3 w-3" />
      {isUp ? "+" : ""}
      {fmtNum(value)}%
    </span>
  );
}

// --------------------------------------------------------------------
// Empty state
// --------------------------------------------------------------------

function EmptyState() {
  const setView = useUIStore((s) => s.setView);
  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <BarChart3 className="h-10 w-10" />
      </div>
      <h2 className="mb-2 text-xl font-bold">لا توجد إحصائيات بعد</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        لم تكمل أي تدريب بعد. ابدأ أول جلسة تدريب لرؤية تحسنك، إحصائياتك
        الأدائية، ومقارنتك بين أنواع الألعاب هنا.
      </p>
      <Button
        className="gradient-primary text-white"
        onClick={() => setView("trainings")}
      >
        <Plus className="h-4 w-4" />
        ابدأ التدريب الآن
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------
// Main view
// --------------------------------------------------------------------

export function StatisticsView() {
  const { user } = useAuth();
  const setView = useUIStore((s) => s.setView);
  const [gameType, setGameType] = useState<"all" | GameType>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery<StatsResponse>({
    queryKey: ["statistics", gameType, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/statistics?game_type=${gameType}&page=${page}`,
        { credentials: "same-origin" },
      );
      const j = await res.json();
      if (!res.ok || j.status !== "success") {
        throw new Error(j.message ?? "فشل تحميل الإحصائيات");
      }
      return j.data as StatsResponse;
    },
    staleTime: 30_000,
  });

  if (isError) {
    toast.error(
      error instanceof Error ? error.message : "تعذّر تحميل الإحصائيات",
    );
  }

  const onFilterChange = (v: string) => {
    setGameType(v as "all" | GameType);
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* ---------------- Header ---------------- */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setView("dashboard")}
          >
            <ArrowRight className="h-4 w-4" />
            لوحة التحكم
          </Button>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Activity className="h-6 w-6 text-primary" />
            إحصائياتي
          </h1>
        </div>
        {user && (
          <Badge className="gap-1 glass" variant="secondary">
            <Award className="h-3 w-3 text-primary" />
            <span className="font-mono">{data?.totalPoints ?? user.totalPoints}</span>
            نقطة
          </Badge>
        )}
      </div>

      {/* ---------------- Loading ---------------- */}
      {isLoading && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* ---------------- Body ---------------- */}
      {!isLoading && data && (
        <>
          {data.generalStats.totalTrainings === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {/* Stats cards */}
              <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard
                  icon={Hash}
                  label="إجمالي التدريبات"
                  value={fmtNum(data.generalStats.totalTrainings, 0)}
                  sub="جلسة محفوظة"
                  color="#6366f1"
                  delay={0}
                />
                <StatCard
                  icon={Target}
                  label="إجمالي الأسئلة"
                  value={fmtNum(data.generalStats.totalQuestions, 0)}
                  sub="سؤال تم حله"
                  color="#8b5cf6"
                  delay={0.05}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="إجمالي الإجابات الصحيحة"
                  value={fmtNum(data.generalStats.totalCorrect, 0)}
                  sub="إجابة صحيحة"
                  color="#10b981"
                  delay={0.1}
                />
                <StatCard
                  icon={Clock}
                  label="متوسط الدقة"
                  value={`${fmtNum(data.generalStats.totalAccuracy)}%`}
                  sub={`متوسط الوقت: ${fmtNum(data.generalStats.avgTime)} ث`}
                  color="#f59e0b"
                  delay={0.15}
                />
              </section>

              {/* Best game highlight */}
              {data.bestGame && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.2 }}
                >
                  <Card className="glass relative overflow-hidden border border-primary/30 p-4 sm:p-6">
                    <div className="absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-primary to-accent" />
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-primary text-white">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground sm:text-sm">
                          لعبتك الأقوى
                        </p>
                        <p className="text-lg font-bold sm:text-xl">
                          {GAME_META[data.bestGame].label}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground">
                          متوسط الدقة
                        </p>
                        <p className="font-mono text-2xl font-bold gradient-text">
                          {fmtNum(data.gamePerformance[data.bestGame].avgScore)}%
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Charts — line + bar */}
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Improvement line chart */}
                <Card className="glass border border-[var(--glass-border)] p-4 sm:p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-bold sm:text-lg">
                      التطوّر عبر الجلسات
                    </h2>
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">
                    نسبة الدقة (٪) لكل جلسة تدريب مرتبة زمنياً، مفصولة حسب نوع
                    اللعبة.
                  </p>
                  <div className="h-72 w-full sm:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={data.chartData.improvement}
                        margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(148,163,184,0.18)"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "currentColor" }}
                          tickLine={false}
                          axisLine={{ stroke: "rgba(148,163,184,0.3)" }}
                          interval="preserveStartEnd"
                          angle={-15}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis
                          orientation="right"
                          domain={[0, 100]}
                          unit="%"
                          tick={{ fontSize: 10, fill: "currentColor" }}
                          tickLine={false}
                          axisLine={{ stroke: "rgba(148,163,184,0.3)" }}
                          width={42}
                        />
                        <Tooltip content={<ImprovementTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          iconType="circle"
                        />
                        <Line
                          type="monotone"
                          name="الجمع والطرح"
                          dataKey="addition_subtraction"
                          stroke={CHART_COLORS.addition_subtraction}
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          name="الضرب"
                          dataKey="multiplication"
                          stroke={CHART_COLORS.multiplication}
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          name="القسمة"
                          dataKey="division"
                          stroke={CHART_COLORS.division}
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Bar comparison (dual axis) */}
                <Card className="glass border border-[var(--glass-border)] p-4 sm:p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-accent" />
                    <h2 className="text-base font-bold sm:text-lg">
                      مقارنة الألعاب
                    </h2>
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">
                    متوسط الدقة (٪) ومتوسط الوقت (ث) لكل نوع لعبة.
                  </p>
                  <div className="h-72 w-full sm:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.chartData.barComparison}
                        margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                        barGap={4}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(148,163,184,0.18)"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: "currentColor" }}
                          tickLine={false}
                          axisLine={{ stroke: "rgba(148,163,184,0.3)" }}
                        />
                        <YAxis
                          yAxisId="percent"
                          orientation="right"
                          domain={[0, 100]}
                          unit="%"
                          tick={{ fontSize: 10, fill: BAR_COLORS.avgScore }}
                          tickLine={false}
                          axisLine={{ stroke: BAR_COLORS.avgScore }}
                          width={42}
                        />
                        <YAxis
                          yAxisId="seconds"
                          orientation="left"
                          tick={{ fontSize: 10, fill: BAR_COLORS.avgTime }}
                          tickLine={false}
                          axisLine={{ stroke: BAR_COLORS.avgTime }}
                          width={36}
                        />
                        <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          iconType="circle"
                        />
                        <Bar
                          yAxisId="percent"
                          name="متوسط الدقة"
                          dataKey="avgScore"
                          fill={BAR_COLORS.avgScore}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={36}
                        />
                        <Bar
                          yAxisId="seconds"
                          name="متوسط الوقت"
                          dataKey="avgTime"
                          fill={BAR_COLORS.avgTime}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={36}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </section>

              {/* Doughnut chart */}
              <section>
                <Card className="glass border border-[var(--glass-border)] p-4 sm:p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <PieIcon className="h-5 w-5 text-emerald-500" />
                    <h2 className="text-base font-bold sm:text-lg">
                      توزيع إعدادات التدريب
                    </h2>
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">
                    عدد الجلسات لكل مزيج إعدادات فريد (مثل «جمع - آحاد»،
                    «ضرب 2×1»، «قسمة 3÷1»).
                  </p>
                  {data.chartData.settingsDist.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                      لا توجد بيانات كافية
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.chartData.settingsDist}
                              dataKey="count"
                              nameKey="label"
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              stroke="none"
                            >
                              {data.chartData.settingsDist.map((_, i) => (
                                <Cell
                                  key={i}
                                  fill={
                                    DOUGHNUT_PALETTE[
                                      i % DOUGHNUT_PALETTE.length
                                    ]
                                  }
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<DoughnutTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {data.chartData.settingsDist.map((row, i) => {
                          const color =
                            DOUGHNUT_PALETTE[i % DOUGHNUT_PALETTE.length];
                          const total = data.chartData.settingsDist.reduce(
                            (s, r) => s + r.count,
                            0,
                          );
                          const pct =
                            total > 0 ? (row.count / total) * 100 : 0;
                          return (
                            <div
                              key={`${row.label}-${i}`}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span
                                className="inline-block h-3 w-3 shrink-0 rounded-full"
                                style={{ background: color }}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {row.label}
                              </span>
                              <span className="font-mono font-bold">
                                {fmtNum(row.count, 0)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({fmtNum(pct)}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              </section>

              {/* History table */}
              <section>
                <Card className="glass border border-[var(--glass-border)] p-4 sm:p-6">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <h2 className="text-base font-bold sm:text-lg">
                        سجل التدريبات
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="game-filter"
                        className="text-xs text-muted-foreground"
                      >
                        فلترة:
                      </label>
                      <Select value={gameType} onValueChange={onFilterChange}>
                        <SelectTrigger
                          id="game-filter"
                          className="glass-input h-9 w-40"
                        >
                          <SelectValue placeholder="نوع اللعبة" />
                        </SelectTrigger>
                        <SelectContent>
                          {FILTERS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className="border-[var(--glass-border)]">
                        <TableHead className="text-right">النوع</TableHead>
                        <TableHead className="text-right">الإعدادات</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">النتيجة</TableHead>
                        <TableHead className="text-right">الدقة</TableHead>
                        <TableHead className="text-right">الوقت</TableHead>
                        <TableHead className="text-right">التطوّر</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.history.items.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            لا توجد سجلات في هذه الصفحة.
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.history.items.map((it) => (
                          <TableRow
                            key={it.id}
                            className="border-[var(--glass-border)]"
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <GameTypeIcon gameType={it.gameType} />
                                <span className="text-xs sm:text-sm">
                                  {GAME_META[it.gameType].label}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {it.settingsSummary}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground sm:text-sm">
                              {formatArabicDate(it.date)}
                            </TableCell>
                            <TableCell className="font-mono text-xs sm:text-sm">
                              <span className="text-emerald-500">
                                {it.correctCount}
                              </span>
                              <span className="text-muted-foreground">
                                {" / "}
                                {it.questionCount}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold sm:text-sm">
                              {fmtNum(it.accuracy)}%
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground sm:text-sm">
                              {fmtNum(it.avgTime)} ث
                            </TableCell>
                            <TableCell>
                              <ImprovementBadge value={it.improvement} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      صفحة {fmtNum(data.history.currentPage, 0)} من{" "}
                      {fmtNum(data.history.totalPages, 0)}
                    </p>
                    <Pagination className="mx-0 w-auto">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() =>
                              setPage((p) => Math.max(1, p - 1))
                            }
                            aria-disabled={data.history.currentPage <= 1}
                            className={
                              data.history.currentPage <= 1
                                ? "pointer-events-none opacity-40"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              setPage((p) => (data.history.hasMore ? p + 1 : p))
                            }
                            aria-disabled={!data.history.hasMore}
                            className={
                              !data.history.hasMore
                                ? "pointer-events-none opacity-40"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </Card>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
