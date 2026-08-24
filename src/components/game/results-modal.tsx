"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Save,
  FileDown,
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";

export interface ResultRow {
  questionIndex: number;
  questionText: string;
  correctAnswer: number | string;
  userAnswer: number | string;
  isCorrect: boolean;
  timeTaken?: number; // seconds
}

export interface ResultsModalProps {
  open: boolean;
  rows: ResultRow[];
  correctCount: number;
  totalCount: number;
  averageScore: number;
  totalTimeMs: number;
  averageTimeMs: number;
  studentName: string;
  gameTitle: string;
  settingsSummary: string;
  dateLabel: string;
  saving?: boolean;
  onSave: () => void;
  onDownloadPdf: () => void;
  onExit: () => void;
}

/** Subset of ResultsModalProps — just the data needed to render the PDF. */
export interface PdfReportProps {
  rows: ResultRow[];
  correctCount: number;
  totalCount: number;
  averageScore: number;
  totalTimeMs: number;
  averageTimeMs: number;
  studentName: string;
  gameTitle: string;
  settingsSummary: string;
  dateLabel: string;
}

/**
 * End-game modal: shows stats + per-question table + action buttons.
 * Renders a hidden printable HTML container (`#pdf-report`) which the
 * `downloadPdf` helper captures via html2canvas + jspdf.
 */
export function ResultsModal({
  open,
  rows,
  correctCount,
  totalCount,
  averageScore,
  totalTimeMs,
  averageTimeMs,
  studentName,
  gameTitle,
  settingsSummary,
  dateLabel,
  saving,
  onSave,
  onDownloadPdf,
  onExit,
}: ResultsModalProps) {
  const avgSec = (averageTimeMs / 1000).toFixed(2);
  const totalSec = (totalTimeMs / 1000).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onExit()}>
      <DialogContent
        className="glass-strong max-h-[92vh] w-full max-w-3xl overflow-y-auto sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader className="text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-lg">
            <Trophy className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className="text-2xl font-bold">انتهت الجلسة!</DialogTitle>
          <DialogDescription className="text-sm">
            {gameTitle} · {studentName} · {dateLabel}
          </DialogDescription>
        </DialogHeader>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="إجابات صحيحة"
            value={`${correctCount}/${totalCount}`}
            color="text-success"
          />
          <StatCard
            icon={<Trophy className="h-4 w-4" />}
            label="النتيجة"
            value={`${averageScore.toFixed(0)}%`}
            color="text-primary"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="متوسط الوقت"
            value={`${avgSec}ث`}
            color="text-warning"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="الزمن الكلي"
            value={`${totalSec}ث`}
            color="text-muted-foreground"
          />
        </div>

        {/* Per-question table */}
        <Card className="glass border border-[var(--glass-border)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">تفاصيل الإجابات</h3>
            <Badge variant="secondary" className="glass font-mono">{rows.length} سؤال</Badge>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-background/80 backdrop-blur-sm text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-center">#</th>
                  <th className="px-2 py-2 text-center">السؤال</th>
                  <th className="px-2 py-2 text-center">إجابتك</th>
                  <th className="px-2 py-2 text-center">الصحيحة</th>
                  <th className="px-2 py-2 text-center">النتيجة</th>
                  <th className="px-2 py-2 text-center">الزمن</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.questionIndex} className="border-t border-[var(--glass-border)]">
                    <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">{r.questionIndex + 1}</td>
                    <td className="px-2 py-1.5 text-center font-mono" dir="ltr">{r.questionText}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{String(r.userAnswer) || "—"}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-success">{r.correctAnswer}</td>
                    <td className="px-2 py-1.5 text-center">
                      {r.isCorrect ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="mx-auto h-4 w-4 text-destructive" />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
                      {r.timeTaken != null ? `${r.timeTaken.toFixed(1)}ث` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Button onClick={onSave} disabled={saving} className="gradient-primary text-white">
            <Save className="h-4 w-4" />
            {saving ? "جارٍ الحفظ…" : "حفظ وخروج"}
          </Button>
          <Button onClick={onDownloadPdf} variant="outline" className="glass">
            <FileDown className="h-4 w-4" />
            تحميل تقرير PDF
          </Button>
          <Button onClick={onExit} variant="ghost">
            <ArrowRight className="h-4 w-4" />
            خروج بدون حفظ
          </Button>
        </div>

        {/* Hidden printable container for PDF generation */}
        <div className="hidden" aria-hidden>
          <PdfReportTemplate
            rows={rows}
            correctCount={correctCount}
            totalCount={totalCount}
            averageScore={averageScore}
            totalTimeMs={totalTimeMs}
            averageTimeMs={averageTimeMs}
            studentName={studentName}
            gameTitle={gameTitle}
            settingsSummary={settingsSummary}
            dateLabel={dateLabel}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Card className="glass border border-[var(--glass-border)] p-3 text-center">
      <div className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full glass ${color}`}>
        {icon}
      </div>
      <div className={`font-mono text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </Card>
  );
}

/** HTML template rendered off-screen, then captured by html2canvas for PDF. */
export function PdfReportTemplate({
  rows,
  correctCount,
  totalCount,
  averageScore,
  totalTimeMs,
  averageTimeMs,
  studentName,
  gameTitle,
  settingsSummary,
  dateLabel,
}: PdfReportProps) {
  const avgSec = (averageTimeMs / 1000).toFixed(2);
  const totalSec = (totalTimeMs / 1000).toFixed(2);

  return (
    <div
      id="pdf-report"
      style={{
        background: "#ffffff",
        color: "#0f172a",
        fontFamily: "Cairo, sans-serif",
        padding: "32px",
        width: "800px",
        direction: "rtl",
      }}
    >
      <div style={{ textAlign: "center", borderBottom: "3px solid #4f46e5", paddingBottom: "16px", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "28px", margin: 0, color: "#4f46e5" }}>منصة e-learn — تقرير تدريب</h1>
        <p style={{ margin: "4px 0 0", color: "#475569" }}>{gameTitle} · {dateLabel}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px", fontSize: "14px" }}>
        <div><strong>الطالب:</strong> {studentName}</div>
        <div><strong>الإعداد:</strong> {settingsSummary}</div>
        <div><strong>عدد الأسئلة:</strong> {totalCount}</div>
        <div><strong>الإجابات الصحيحة:</strong> {correctCount}</div>
        <div><strong>النتيجة:</strong> {averageScore.toFixed(0)}%</div>
        <div><strong>متوسط الزمن:</strong> {avgSec} ث</div>
        <div><strong>الزمن الكلي:</strong> {totalSec} ث</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "#4f46e5", color: "#fff" }}>
            <th style={{ padding: "8px", border: "1px solid #c7d2fe" }}>#</th>
            <th style={{ padding: "8px", border: "1px solid #c7d2fe" }}>السؤال</th>
            <th style={{ padding: "8px", border: "1px solid #c7d2fe" }}>إجابتك</th>
            <th style={{ padding: "8px", border: "1px solid #c7d2fe" }}>الصحيحة</th>
            <th style={{ padding: "8px", border: "1px solid #c7d2fe" }}>النتيجة</th>
            <th style={{ padding: "8px", border: "1px solid #c7d2fe" }}>الزمن (ث)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.questionIndex} style={{ background: r.isCorrect ? "#f0fdf4" : "#fef2f2" }}>
              <td style={{ padding: "6px", border: "1px solid #e2e8f0", textAlign: "center" }}>{r.questionIndex + 1}</td>
              <td style={{ padding: "6px", border: "1px solid #e2e8f0", textAlign: "center", direction: "ltr", fontFamily: "monospace" }}>{r.questionText}</td>
              <td style={{ padding: "6px", border: "1px solid #e2e8f0", textAlign: "center", fontFamily: "monospace" }}>{String(r.userAnswer) || "—"}</td>
              <td style={{ padding: "6px", border: "1px solid #e2e8f0", textAlign: "center", color: "#16a34a", fontFamily: "monospace" }}>{r.correctAnswer}</td>
              <td style={{ padding: "6px", border: "1px solid #e2e8f0", textAlign: "center", color: r.isCorrect ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                {r.isCorrect ? "صحيح" : "خطأ"}
              </td>
              <td style={{ padding: "6px", border: "1px solid #e2e8f0", textAlign: "center", fontFamily: "monospace" }}>
                {r.timeTaken != null ? r.timeTaken.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: "20px", fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>
        تم إنشاء هذا التقرير آلياً بواسطة منصة e-learn — جميع النتائج محسوبة من جانب الخادم لضمان النزاهة.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF generation helper (client-only)
// ---------------------------------------------------------------------------

export async function downloadTrainingPdf(): Promise<void> {
  const [{ default: jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasMod.default;
  const node = document.getElementById("pdf-report");
  if (!node) return;

  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  let position = 0;
  if (imgH <= pageH) {
    pdf.addImage(imgData, "PNG", 0, 0, pageW, imgH);
  } else {
    // Multi-page: tile the image
    let remaining = imgH;
    let offset = 0;
    while (remaining > 0) {
      pdf.addImage(imgData, "PNG", 0, -offset, pageW, imgH);
      remaining -= pageH;
      offset += pageH;
      if (remaining > 0) pdf.addPage();
    }
    position = 0;
  }
  pdf.save("training-report.pdf");
}
