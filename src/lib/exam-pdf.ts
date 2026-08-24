/**
 * Client-side exam PDF generator.
 *
 * Uses jsPDF + jspdf-autotable to build an A4 PDF with:
 *   - Header (title, username, date)
 *   - One section per operation type
 *     · Add/Sub & Imagination → vertical grid (autoTable, columnsCount per row)
 *     · Multiply & Divide     → horizontal (2 per row, doc.text)
 *   - Final "Answer Key" pages with the answers filled in
 *   - Faint diagonal watermark of the logged-in username on every page
 *
 * Imported by <ExamGeneratorView /> only. Must run client-side because
 * jsPDF touches `window`. The function returns a blob URL that an
 * <iframe src=...> can render directly.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { generateBatch, Question } from "@/lib/game";

export interface ExamSettings {
  as_questionsCount: number;
  as_numberLength: number;
  as_termsCount: number;
  as_solvingMethod: string;
  mul_questionsCount: number;
  mul_num1Length: number;
  mul_num2Length: number;
  div_questionsCount: number;
  div_dividendLength: number;
  div_divisorLength: number;
  div_decimalOption: "integers" | "decimals";
  im_questionsCount: number;
  im_numberLength: number;
  im_termsCount: number;
  im_solvingMethod: string;
}

export interface ExamPdfInput {
  examTitle: string;
  username: string;
  columnsCount: number;
  settings: ExamSettings;
}

interface Section {
  title: string;
  layout: "vertical" | "horizontal";
  questions: Question[];
}

const PAGE_MARGIN = 36;

/**
 * Build the PDF and return a blob URL ready to drop into an iframe.
 * A fresh seed is used so each call produces different questions.
 */
export function generateExamPdf(input: ExamPdfInput): string {
  const seed = `exam-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const sections = buildSections(input.settings, seed);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let y = drawHeader(doc, input.examTitle, input.username, PAGE_MARGIN, pageW);

  for (const section of sections) {
    if (y + 80 > pageH - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN + 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(section.title, pageW - PAGE_MARGIN, y, { align: "right" });
    y += 18;

    if (section.layout === "vertical") {
      y = drawVerticalSection(
        doc,
        section.questions,
        input.columnsCount,
        PAGE_MARGIN,
        y,
        pageW,
        pageH,
        false
      );
    } else {
      y = drawHorizontalSection(
        doc,
        section.questions,
        PAGE_MARGIN,
        y,
        pageW,
        pageH,
        false
      );
    }
    y += 24;
  }

  // ---- Answer Key ----
  doc.addPage();
  y = drawHeader(
    doc,
    `${input.examTitle} - Answer Key`,
    input.username,
    PAGE_MARGIN,
    pageW
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Answer Key", pageW - PAGE_MARGIN, y, { align: "right" });
  y += 18;

  for (const section of sections) {
    if (y + 80 > pageH - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN + 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(section.title, pageW - PAGE_MARGIN, y, { align: "right" });
    y += 14;

    if (section.layout === "vertical") {
      y = drawVerticalSection(
        doc,
        section.questions,
        input.columnsCount,
        PAGE_MARGIN,
        y,
        pageW,
        pageH,
        true
      );
    } else {
      y = drawHorizontalSection(
        doc,
        section.questions,
        PAGE_MARGIN,
        y,
        pageW,
        pageH,
        true
      );
    }
    y += 18;
  }

  // ---- Watermark on every page (drawn last so it sits on top, faint) ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawWatermark(doc, input.username, pageW, pageH);
  }

  return doc.output("bloburl") as unknown as string;
}

// --------------------------------------------------------------------
// Section builders
// --------------------------------------------------------------------

function buildSections(s: ExamSettings, seed: string): Section[] {
  const out: Section[] = [];
  if (s.as_questionsCount > 0) {
    out.push({
      title: "Addition & Subtraction",
      layout: "vertical",
      questions: generateBatch(
        {
          type: "addition_subtraction",
          numberLength: s.as_numberLength,
          termsCount: s.as_termsCount,
          seed: `${seed}-as`,
        },
        s.as_questionsCount
      ),
    });
  }
  if (s.mul_questionsCount > 0) {
    out.push({
      title: "Multiplication",
      layout: "horizontal",
      questions: generateBatch(
        {
          type: "multiplication",
          num1Length: s.mul_num1Length,
          num2Length: s.mul_num2Length,
          seed: `${seed}-mul`,
        },
        s.mul_questionsCount
      ),
    });
  }
  if (s.div_questionsCount > 0) {
    out.push({
      title: "Division",
      layout: "horizontal",
      questions: generateBatch(
        {
          type: "division",
          dividendLength: s.div_dividendLength,
          divisorLength: s.div_divisorLength,
          seed: `${seed}-div`,
        },
        s.div_questionsCount
      ),
    });
  }
  if (s.im_questionsCount > 0) {
    out.push({
      title: "Imagination",
      layout: "vertical",
      questions: generateBatch(
        {
          type: "imagination",
          numberLength: s.im_numberLength,
          termsCount: s.im_termsCount,
          seed: `${seed}-im`,
        },
        s.im_questionsCount
      ),
    });
  }
  return out;
}

// --------------------------------------------------------------------
// Header + watermark
// --------------------------------------------------------------------

function drawHeader(
  doc: jsPDF,
  title: string,
  username: string,
  margin: number,
  pageW: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(title, pageW / 2, 40, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Generated by: ${username}`, pageW - margin, 56, { align: "right" });
  doc.text(new Date().toLocaleDateString(), margin, 56, { align: "left" });

  doc.setLineWidth(0.7);
  doc.setDrawColor(150);
  doc.line(margin, 64, pageW - margin, 64);

  doc.setTextColor(0);
  return 80;
}

function drawWatermark(
  doc: jsPDF,
  username: string,
  pageW: number,
  pageH: number
) {
  // Faint diagonal watermark across the page
  doc.saveGraphicsState();
  const gs = (doc as any).GState?.({ opacity: 0.12 });
  if (gs) {
    (doc as any).setGState(gs);
  }
  doc.setFontSize(60);
  doc.setTextColor(150);
  // Repeating watermark pattern across the page diagonally
  for (let dy = -pageH; dy < pageW + pageH; dy += 120) {
    doc.text(username, dy, pageH / 2, { align: "center", angle: 45 });
  }
  doc.setTextColor(0);
  doc.restoreGraphicsState();
}

// --------------------------------------------------------------------
// Vertical layout (autoTable) — used by Add/Sub & Imagination
// --------------------------------------------------------------------

function drawVerticalSection(
  doc: jsPDF,
  questions: Question[],
  columnsCount: number,
  margin: number,
  startY: number,
  pageW: number,
  pageH: number,
  showAnswer: boolean
): number {
  if (questions.length === 0) return startY;
  let y = startY;

  for (let rowStart = 0; rowStart < questions.length; rowStart += columnsCount) {
    const slice = questions.slice(rowStart, rowStart + columnsCount);
    const count = slice.length;

    // Header row: question numbers (right-padded with empty cells)
    const head: string[] = [];
    for (let i = 0; i < columnsCount; i++) {
      head.push(i < count ? String(rowStart + i + 1) : "");
    }

    // Body rows: first term, then (op, num) pairs, then answer row
    const termsCount = slice[0].terms.length;
    const body: string[][] = [];

    // First term row
    body.push(
      slice.map((q, i) => (i < count ? String(q.terms[0] ?? "") : ""))
    );

    // Subsequent (op, num) pairs
    for (let t = 1; t < termsCount; t += 2) {
      body.push(
        slice.map((q, i) => {
          if (i >= count) return "";
          const op = q.terms[t] ?? "";
          const num = q.terms[t + 1] ?? "";
          return `${op} ${num}`;
        })
      );
    }

    // Answer row (blank for student, filled in for answer key)
    body.push(
      slice.map((q, i) =>
        i < count && showAnswer ? String(q.answer) : ""
      )
    );

    // Estimate height and possibly break to a new page
    const estimatedHeight = (body.length + 1) * 22;
    if (y + estimatedHeight > pageH - margin) {
      doc.addPage();
      y = margin + 16;
    }

    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: "grid",
      styles: {
        halign: "center",
        valign: "middle",
        fontSize: 10,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        lineWidth: 0.4,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: 0,
        fontStyle: "bold",
        fontSize: 10,
      },
      margin: { left: margin, right: margin },
      tableWidth: pageW - 2 * margin,
      pageBreak: "avoid",
    });

    // jspdf-autotable stores finalY on the doc instance
    const lastY: number | undefined = (doc as any).lastAutoTable?.finalY;
    y = (lastY ?? y + estimatedHeight) + 14;
  }
  return y;
}

// --------------------------------------------------------------------
// Horizontal layout — used by Multiply & Divide (2 per row)
// --------------------------------------------------------------------

function drawHorizontalSection(
  doc: jsPDF,
  questions: Question[],
  margin: number,
  startY: number,
  pageW: number,
  pageH: number,
  showAnswer: boolean
): number {
  if (questions.length === 0) return startY;
  const cellHeight = 22;
  const cellWidth = (pageW - 2 * margin) / 2;
  let y = startY;

  for (let i = 0; i < questions.length; i++) {
    const col = i % 2;
    if (col === 0 && i > 0) {
      y += cellHeight;
      if (y + cellHeight > pageH - margin) {
        doc.addPage();
        y = margin + 16;
      }
    }
    const x = margin + col * cellWidth;
    drawHorizontalQuestion(doc, questions[i], i, x, y, showAnswer);
  }
  return y + cellHeight;
}

function drawHorizontalQuestion(
  doc: jsPDF,
  q: Question,
  index: number,
  x: number,
  y: number,
  showAnswer: boolean
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20);

  let text = `${index + 1}.   `;
  for (let i = 0; i < q.terms.length; i++) {
    text += String(q.terms[i]) + " ";
  }
  text += "= ";
  text += showAnswer ? String(q.answer) : "____________";
  doc.text(text, x + 8, y + 14);
}
