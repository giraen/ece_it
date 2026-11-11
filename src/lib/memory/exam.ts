"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { now } from "@/lib/ids";
import { examPlan, type ExamPlan } from "./schedule";

/**
 * When the board exam is. Set either or both: the month you expect it in ("2027-04"), and the exact date once it
 * is announced ("2027-04-20"). Memory plans for whichever comes first, so it is never late.
 */
const MONTH = "examMonth";
const DATE = "examDate";

export interface ExamSetting {
  month: string | null;
  date: string | null;
}

const clean = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : null);

export async function loadExam(): Promise<ExamSetting> {
  const [m, d] = await db.settings.bulkGet([MONTH, DATE]);
  return {
    month: m && !m.deletedAt ? clean(m.value, /^\d{4}-\d{2}$/) : null,
    date: d && !d.deletedAt ? clean(d.value, /^\d{4}-\d{2}-\d{2}$/) : null,
  };
}

export function useExam(): ExamSetting | undefined {
  return useLiveQuery(() => loadExam(), []);
}

export function useExamPlan(): ExamPlan | null | undefined {
  const exam = useExam();
  return exam === undefined ? undefined : examPlan(exam.month, exam.date);
}

/** Saves the month or the date. An empty value clears it. */
export async function saveExam(which: "month" | "date", value: string): Promise<void> {
  const id = which === "month" ? MONTH : DATE;
  const t = now();
  if (!value) await db.settings.put({ id, value: null, updatedAt: t, deletedAt: t });
  else await db.settings.put({ id, value, updatedAt: t });
}
