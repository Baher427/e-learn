/**
 * POST /api/exam/generate
 *
 * Final step of the 5-wizard exam generator. Validates the user-supplied
 * settings (zod), inserts a row into `generated_exams`, logs the activity,
 * and returns the new examId. The PDF itself is generated client-side
 * (see src/lib/exam-pdf.ts) so the server only stores the recipe, not the
 * rendered PDF — this keeps the payload tiny and reproducible.
 *
 * Body: {
 *   examTitle: string (3-30 ASCII alnum + spaces)
 *   columnsCount: 5 | 10
 *   settings: { ...all the wizard settings }
 *   selectedOps: string[]  // e.g. ["add_sub","multiply"]
 * }
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  fail,
  requireUser,
  parseBody,
  withRatelimit,
  clientIp,
} from "@/lib/api";
import { z } from "zod";

const settingsSchema = z.object({
  as_questionsCount: z.number().int().min(0).max(100),
  as_numberLength: z.number().int().min(1).max(5),
  as_termsCount: z.number().int().min(2).max(10),
  as_solvingMethod: z.enum([
    "direct",
    "friendsOf5",
    "friendsOf10",
    "friendsOf5And10",
  ]),
  mul_questionsCount: z.number().int().min(0).max(100),
  mul_num1Length: z.number().int().min(1).max(3),
  mul_num2Length: z.number().int().min(1).max(2),
  div_questionsCount: z.number().int().min(0).max(100),
  div_dividendLength: z.number().int().min(2).max(4),
  div_divisorLength: z.number().int().min(1).max(4),
  div_decimalOption: z.enum(["integers", "decimals"]),
  im_questionsCount: z.number().int().min(0).max(100),
  im_numberLength: z.number().int().min(1).max(5),
  im_termsCount: z.number().int().min(2).max(10),
  im_solvingMethod: z.enum([
    "direct",
    "friendsOf5",
    "friendsOf10",
    "friendsOf5And10",
  ]),
});

const VALID_OPS = ["add_sub", "multiply", "divide", "imagination"] as const;

const schema = z
  .object({
    examTitle: z
      .string()
      .min(3, "العنوان 3 أحرف على الأقل")
      .max(30, "العنوان 30 حرفاً على الأكثر")
      .regex(/^[a-zA-Z0-9 ]+$/, "حروف وأرقام إنجليزية ومسافات فقط"),
    columnsCount: z.union([z.literal(5), z.literal(10)]),
    settings: settingsSchema,
    selectedOps: z
      .array(z.enum(VALID_OPS))
      .min(1, "اختر قسماً واحداً على الأقل"),
  })
  .superRefine((data, ctx) => {
    const s = data.settings;

    // Each section is either skipped (0) or has >= 5 questions
    const sections: Array<{
      key: string;
      count: number;
      op: string;
    }> = [
      { key: "as_questionsCount", count: s.as_questionsCount, op: "add_sub" },
      {
        key: "mul_questionsCount",
        count: s.mul_questionsCount,
        op: "multiply",
      },
      {
        key: "div_questionsCount",
        count: s.div_questionsCount,
        op: "divide",
      },
      {
        key: "im_questionsCount",
        count: s.im_questionsCount,
        op: "imagination",
      },
    ];

    for (const sec of sections) {
      if (sec.count !== 0 && sec.count < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["settings", sec.key],
          message: "0 أو 5 على الأقل",
        });
      }
    }

    // Total must be > 0
    const total = sections.reduce((a, b) => a + b.count, 0);
    if (total === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedOps"],
        message: "اختر قسماً واحداً على الأقل",
      });
    }

    // For each op in selectedOps, the corresponding count must be > 0
    for (const op of data.selectedOps) {
      const sec = sections.find((x) => x.op === op);
      if (sec && sec.count === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selectedOps"],
          message: `القسم ${op} محدد لكن عدد الأسئلة 0`,
        });
      }
    }

    // Integer division feasibility: dividendLength >= divisorLength
    if (
      s.div_questionsCount > 0 &&
      s.div_decimalOption === "integers" &&
      s.div_dividendLength < s.div_divisorLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settings", "div_dividendLength"],
        message:
          "في القسمة الصحيحة: طول المقسوم يجب أن يكون أكبر من أو يساوي طول المقسوم عليه",
      });
    }
  });

export async function POST(req: NextRequest) {
  return withRatelimit(`exam-gen:${clientIp(req)}`, async () => {
    const got = await requireUser();
    if ("error" in got) return got.error;

    const parsed = await parseBody(req, schema);
    if ("error" in parsed) return parsed.error;

    const { examTitle, columnsCount, settings, selectedOps } = parsed.data;

    const totalCount =
      settings.as_questionsCount +
      settings.mul_questionsCount +
      settings.div_questionsCount +
      settings.im_questionsCount;

    // Insert into generated_exams
    const exam = await db.generatedExam.create({
      data: {
        userId: got.session.userId,
        examTitle,
        questionsCount: totalCount,
        operationTypes: selectedOps.join(","),
        settingsJson: JSON.stringify({
          examTitle,
          columnsCount,
          settings,
          selectedOps,
        }),
      },
    });

    // Activity log (audit trail)
    await db.activityLog.create({
      data: {
        userId: got.session.userId,
        activityType: "exam_generated",
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
        metaJson: JSON.stringify({
          examId: exam.id,
          title: examTitle,
          questionsCount: totalCount,
          operationTypes: selectedOps.join(","),
        }),
      },
    });

    return ok({
      examId: exam.id,
      questionsCount: totalCount,
      operationTypes: selectedOps,
    });
  }, 5, 60_000); // 5 exams / min / IP
}
