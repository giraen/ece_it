import Dexie, { type EntityTable } from "dexie";

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

class AppDB extends Dexie {
  nodes!: EntityTable<TreeNode, "id">;
  questions!: EntityTable<Question, "id">;
  images!: EntityTable<StoredImage, "id">;

  constructor() {
    super("ece-review");
    this.version(1).stores({
      nodes: "id, kind, parentId, updatedAt",
      questions: "id, topicId, updatedAt, *tags",
      images: "id",
    });
  }
}

export const db = new AppDB();
