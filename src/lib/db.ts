import Dexie, { type EntityTable } from "dexie";

/** How sure the user was when answering. */
export type Sureness = "sure" | "not_sure" | "wise_guess" | "just_guessed";

export type NodeKind = "category" | "subject" | "topic";

/** One node of the category > subject > topic tree. */
export interface TreeNode {
  id: string;
  kind: NodeKind;
  parentId: string | null;
  name: string;
  order: number;
  /** For a subject: every category it belongs to. `parentId` is the first of them. Missing means just `parentId`. */
  parentIds?: string[];
  /** One of the four fixed categories (GEAS, ESAT, ELEX, MATH). They cannot be added, renamed, or deleted. */
  fixed?: boolean;
  createdAt: number;
  updatedAt: number;
  /** Soft delete. Kept so the backup merge can tell "deleted" from "never existed". */
  deletedAt?: number;
}

export interface Choice {
  id: string;
  text: string;
}

/**
 * A reworded version of a question made by an AI model, kept in the cache.
 * "concept": a whole reworded question. "frame": only a new wording (`stem`) for a computation question.
 */
export interface Variant {
  id: string;
  questionId: string;
  kind: "concept" | "frame";
  /** pending = not yet checked, approved = checked and usable in quizzes, discarded = thrown away. */
  status: "pending" | "approved" | "discarded";
  stem: string;
  choices: Choice[];
  correctChoiceId: string;
  provider: string;
  model: string;
  /** Why it was discarded, or other notes. */
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** A short study note on one idea, such as crosstalk. It is review material and a source for drafting questions. */
export interface Concept {
  id: string;
  topicId: string;
  title: string;
  /** Markdown with LaTeX and images, like a question stem. */
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** A question an AI drafted from a concept. It joins the bank only when the user accepts it. */
export interface DraftQuestion {
  id: string;
  conceptId: string;
  topicId: string;
  stem: string;
  choices: Choice[];
  correctChoiceId: string;
  provider: string;
  model: string;
  status: "pending" | "accepted" | "discarded";
  note?: string;
  /** The question created when this draft was accepted. */
  questionId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** A named setting. The id is the setting's name, so settings merge like everything else. */
export interface SettingRow {
  id: string;
  value: unknown;
  updatedAt: number;
  deletedAt?: number;
}

/** One AI provider. Its API key is never stored here: the user adds it in the browser and it stays on that device. */
export interface ProviderConfig {
  id: string;
  name: string;
  /** "openai" is any OpenAI-compatible chat endpoint, called through /api/ai. "webllm" runs a small model in the browser. */
  type: "openai" | "webllm";
  baseUrl: string;
  model: string;
  enabled: boolean;
  /** Only used for computation wordings, where code checks the numbers. */
  computationOnly: boolean;
}

/** How a given value is drawn each time a computation question is rolled. Numbers may carry SI suffixes: 4.7k, 2.2u, 10m. */
export type ValueRule =
  | { kind: "list"; values: string[] }
  | { kind: "range"; from: string; to: string; step: string }
  | { kind: "int"; from: string; to: string }
  | { kind: "decimal"; from: string; to: string; decimals: number }
  | { kind: "fraction"; numFrom: string; numTo: string; denFrom: string; denTo: string };

export interface Given {
  id: string;
  name: string;
  unit: string;
  rule: ValueRule;
}

export interface Derived {
  id: string;
  name: string;
  unit: string;
  formula: string;
}

export interface AnswerFormat {
  unit: string;
  sigFigs: number;
  notation: "engineering" | "plain";
}

/**
 * The recipe for a computation question. The choices live on the question itself: each choice's `text`
 * is a formula, and `correctChoiceId` marks the right one.
 */
export interface ComputationTemplate {
  givens: Given[];
  derived: Derived[];
  /** Conditions every roll must satisfy, such as "R1 != R2". */
  constraints: string[];
  /** Wordings of the question with {name} slots. One is picked at random each time. */
  stems: string[];
  format: AnswerFormat;
  /** For the editor only: the mistake each wrong choice models. */
  mistakes: Record<string, string>;
}

export interface Question {
  id: string;
  topicId: string;
  type: "standard" | "computation";
  /** For a computation question this is the first wording, used for lists and search. */
  stem: string;
  /** Present only when `type` is "computation". */
  template?: ComputationTemplate;
  choices: Choice[];
  correctChoiceId: string;
  tags: string[];
  /** Whether AI-reworded versions of this question may be shown in quizzes. Missing means no. */
  allowAi?: boolean;
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

/** One line of a mock blueprint: a subject or topic and its share of the quiz. */
export interface BlueprintEntry {
  id: string;
  nodeId: string;
  percent: number;
}

/** How a category's mock board is built. One per category, so its id is the category id. */
export interface Blueprint {
  id: string;
  categoryId: string;
  totalItems: number;
  entries: BlueprintEntry[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
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
  /** If a reworded variant was served, which one. Missing means the original question. */
  variantId?: string;
  /** For a category quiz built from a blueprint: which entry this question was drawn for. */
  entryId?: string;
  entryName?: string;
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
  /** The score and group floors were met. */
  passed: boolean;
  /** Passed AND the quiz was eligible. Only this earns mastery. */
  masteryAwarded?: boolean;
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
  /** False when the quiz was too short or too thin to award mastery. Missing means eligible. */
  eligible?: boolean;
  ineligibleReason?: string;
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
  blueprints!: EntityTable<Blueprint, "id">;
  variants!: EntityTable<Variant, "id">;
  settings!: EntityTable<SettingRow, "id">;
  concepts!: EntityTable<Concept, "id">;
  drafts!: EntityTable<DraftQuestion, "id">;

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
    this.version(3).stores({
      nodes: "id, kind, parentId, updatedAt",
      questions: "id, topicId, updatedAt, *tags",
      images: "id",
      attempts: "id, scopeNodeId, status, startedAt, updatedAt",
      blueprints: "id, categoryId, updatedAt",
    });
    this.version(4).stores({
      nodes: "id, kind, parentId, updatedAt",
      questions: "id, topicId, updatedAt, *tags",
      images: "id",
      attempts: "id, scopeNodeId, status, startedAt, updatedAt",
      blueprints: "id, categoryId, updatedAt",
      variants: "id, questionId, status, updatedAt",
      settings: "id",
    });
    this.version(5).stores({
      nodes: "id, kind, parentId, updatedAt",
      questions: "id, topicId, updatedAt, *tags",
      images: "id",
      attempts: "id, scopeNodeId, status, startedAt, updatedAt",
      blueprints: "id, categoryId, updatedAt",
      variants: "id, questionId, status, updatedAt",
      settings: "id",
      concepts: "id, topicId, updatedAt",
      drafts: "id, conceptId, status, updatedAt",
    });
  }
}

export const db = new AppDB();