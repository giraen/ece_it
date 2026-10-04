import Dexie, { type EntityTable } from "dexie";
import type { Sureness } from "./scoring";

export type NodeKind = "category" | "subject" | "topic";

/** One node of the category > subject > topic tree. */
export interface TreeNode {
  id: string;
  kind: NodeKind;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  /** Soft delete. Kept so the backup merge can tell "deleted" from "never existed". */
  deletedAt?: number;
}

export interface Choice {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  topicId: string;
  /** Only "standard" exists in step 1. "computation" arrives in step 5. */
  type: "standard" | "computation";
  stem: string;
  choices: Choice[];
  correctChoiceId: string;
  tags: string[];
  difficulty?: number;
  targetSec?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface StoredImage {
  /** SHA-256 of the stored bytes, so the same picture is saved once. */
  id: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  createdAt: number;
}

/** One question inside a quiz, with a frozen copy of its content so later edits never change history. */
export interface AttemptItem {
  questionId: string;
  type: Question["type"];
  stem: string;
  choices: Choice[];
  correctChoiceId: string;
  tags: string[];
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  categoryId: string;
  categoryName: string;
  /** Choice ids in the order shown. Saved so a refresh keeps the same order. */
  choiceOrder: string[];
  targetSec: number;
  selectedChoiceId?: string;
  sureness?: Sureness;
  confirmed: boolean;
  /** Total time spent on this question while it was on screen, in ms. */
  activeMs: number;
  /** Time on the question when the first choice was picked. */
  firstSelectMs?: number;
  /** How many times the picked choice was changed. */
  changes: number;
  /** Filled in when the quiz is submitted. */
  answered: boolean;
  correct: boolean;
  credit: number;
}

export interface AttemptSummary {
  n: number;
  answered: number;
  correct: number;
  accuracy: number;
  /** Average credit across all questions. */
  credit: number;
  totalMs: number;
  passed: boolean;
  bar: number;
  failedGroups: string[];
}

export interface QuizAttempt {
  id: string;
  scopeNodeId: string;
  scopeKind: NodeKind;
  /** "Elex › Circuits › DC analysis" at the time the quiz started. */
  scopeName: string;
  mode: "standard" | "mock";
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: number;
  submittedAt?: number;
  currentIndex: number;
  items: AttemptItem[];
  summary?: AttemptSummary;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

class AppDB extends Dexie {
  nodes!: EntityTable<TreeNode, "id">;
  questions!: EntityTable<Question, "id">;
  images!: EntityTable<StoredImage, "id">;
  attempts!: EntityTable<QuizAttempt, "id">;

  constructor() {
    super("ece-review");
    this.version(1).stores({
      nodes: "id, kind, parentId, updatedAt",
      questions: "id, topicId, updatedAt, *tags",
      images: "id",
    });
    this.version(2).stores({
      nodes: "id, kind, parentId, updatedAt",
      questions: "id, topicId, updatedAt, *tags",
      images: "id",
      attempts: "id, scopeNodeId, status, startedAt, updatedAt",
    });
  }
}

export const db = new AppDB();
