import { BackupError, encodeFile, type Container, type ImageFile, type Manifest } from "./backupFormat";
import {
  db,
  type Blueprint,
  type Concept,
  type DraftQuestion,
  type Question,
  type SettingRow,
  type TreeNode,
  type Variant,
} from "./db";
import { now } from "./ids";
import {
  planBackupMerge,
  planPackImport,
  type BackupMergePlan,
  type PackData,
  type PackOptions,
  type PackPlan,
  type Tables,
} from "./merge";
import { selectPackContent } from "./share";

/** Everything stored in this browser, deleted records included. */
async function loadTables(): Promise<Tables> {
  const [nodes, questions, blueprints, attempts, variants, settings, concepts, drafts] = await Promise.all([
    db.nodes.toArray(),
    db.questions.toArray(),
    db.blueprints.toArray(),
    db.attempts.toArray(),
    db.variants.toArray(),
    db.settings.toArray(),
    db.concepts.toArray(),
    db.drafts.toArray(),
  ]);
  return { nodes, questions, blueprints, attempts, variants, settings, concepts, drafts };
}

async function imageFiles(only?: Set<string>): Promise<ImageFile[]> {
  const rows = only
    ? (await db.images.bulkGet(Array.from(only))).filter((r) => r !== undefined)
    : await db.images.toArray();
  const out: ImageFile[] = [];
  for (const r of rows) {
    out.push({
      id: r.id,
      mime: r.mime,
      width: r.width,
      height: r.height,
      createdAt: r.createdAt,
      bytes: new Uint8Array(await r.blob.arrayBuffer()),
    });
  }
  return out;
}

function manifest(kind: "backup" | "pack", counts: Record<string, number>, name?: string): Manifest {
  return { app: "ece-review", format: 1, kind, createdAt: now(), name, counts };
}

/** A full backup of this browser: the bank, images, attempts, blueprints. Needs a password. */
export async function buildFullBackup(
  password: string,
): Promise<{ bytes: Uint8Array; counts: Record<string, number> }> {
  const tables = await loadTables();
  const images = await imageFiles();
  const counts = {
    questions: tables.questions.filter((q) => !q.deletedAt).length,
    attempts: tables.attempts.length,
    variants: tables.variants.filter((v) => v.status === "approved" && !v.deletedAt).length,
    images: images.length,
  };
  const container: Container = { manifest: manifest("backup", counts), data: { ...tables }, images };
  return { bytes: await encodeFile(container, password), counts };
}

export interface PackExport {
  bytes: Uint8Array;
  counts: Record<string, number>;
  blueprintsSkipped: number;
}

/** A bank pack: learning material only. No attempts, mastery, cooldowns, or settings. */
export async function buildPack(
  scopeId: string | null,
  name: string,
  password?: string,
  includeVariants = false,
): Promise<PackExport> {
  const tables = await loadTables();
  const sel = selectPackContent(
    tables.nodes,
    tables.questions,
    tables.blueprints,
    scopeId,
    tables.variants,
    includeVariants,
    tables.concepts,
  );
  const images = await imageFiles(new Set(sel.imageIds));
  const counts = {
    questions: sel.questions.length,
    concepts: sel.concepts.length,
    images: images.length,
    treeItems: sel.nodes.length,
    variants: sel.variants.length,
  };
  const container: Container = {
    manifest: manifest("pack", counts, name),
    data: {
      nodes: sel.nodes,
      questions: sel.questions,
      blueprints: sel.blueprints,
      variants: sel.variants,
      concepts: sel.concepts,
    },
    images,
  };
  return {
    bytes: await encodeFile(container, password || undefined),
    counts,
    blueprintsSkipped: sel.blueprintsSkipped,
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------------------------

function arr<T>(data: Record<string, unknown[]>, key: string): T[] {
  const v = data[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new BackupError("corrupt", `The file's "${key}" data is damaged.`);
  return v as T[];
}

const isStr = (v: unknown) => typeof v === "string";

/** Basic shape checks, so a hand-edited or damaged file cannot put broken records in the database. */
function validateTables(t: Tables): void {
  const bad = (what: string, i: number) => {
    throw new BackupError("corrupt", `The file has an invalid ${what} (number ${i + 1}).`);
  };
  t.nodes.forEach((n, i) => {
    if (
      !isStr(n.id) ||
      !["category", "subject", "topic"].includes(n.kind) ||
      !isStr(n.name) ||
      typeof n.updatedAt !== "number"
    )
      bad("tree item", i);
  });
  t.questions.forEach((q, i) => {
    if (
      !isStr(q.id) ||
      !isStr(q.topicId) ||
      !isStr(q.stem) ||
      !Array.isArray(q.choices) ||
      !isStr(q.correctChoiceId) ||
      !Array.isArray(q.tags) ||
      typeof q.updatedAt !== "number"
    )
      bad("question", i);
  });
  t.blueprints.forEach((b, i) => {
    if (
      !isStr(b.id) ||
      !isStr(b.categoryId) ||
      typeof b.totalItems !== "number" ||
      !Array.isArray(b.entries) ||
      typeof b.updatedAt !== "number"
    )
      bad("blueprint", i);
  });
  t.attempts.forEach((a, i) => {
    if (!isStr(a.id) || !isStr(a.scopeNodeId) || !Array.isArray(a.items) || typeof a.updatedAt !== "number")
      bad("quiz attempt", i);
  });
  t.variants.forEach((v, i) => {
    if (
      !isStr(v.id) ||
      !isStr(v.questionId) ||
      !["concept", "frame"].includes(v.kind) ||
      !["pending", "approved", "discarded"].includes(v.status) ||
      !isStr(v.stem) ||
      !Array.isArray(v.choices) ||
      typeof v.updatedAt !== "number"
    )
      bad("variant", i);
  });
  t.settings.forEach((r, i) => {
    if (!isStr(r.id) || typeof r.updatedAt !== "number") bad("setting", i);
  });
  t.concepts.forEach((c, i) => {
    if (
      !isStr(c.id) ||
      !isStr(c.topicId) ||
      !isStr(c.title) ||
      !isStr(c.body) ||
      !Array.isArray(c.tags) ||
      typeof c.updatedAt !== "number"
    )
      bad("concept", i);
  });
  t.drafts.forEach((d, i) => {
    if (
      !isStr(d.id) ||
      !isStr(d.conceptId) ||
      !isStr(d.stem) ||
      !Array.isArray(d.choices) ||
      !["pending", "accepted", "discarded"].includes(d.status) ||
      typeof d.updatedAt !== "number"
    )
      bad("draft", i);
  });
}

export function tablesFrom(c: Container): Tables {
  const t: Tables = {
    nodes: arr<TreeNode>(c.data, "nodes"),
    questions: arr<Question>(c.data, "questions"),
    blueprints: arr<Blueprint>(c.data, "blueprints"),
    attempts: arr(c.data, "attempts"),
    variants: arr<Variant>(c.data, "variants"),
    settings: arr<SettingRow>(c.data, "settings"),
    concepts: arr<Concept>(c.data, "concepts"),
    drafts: arr<DraftQuestion>(c.data, "drafts"),
  };
  validateTables(t);
  return t;
}

export interface BackupPreview {
  kind: "backup";
  manifest: Manifest;
  incoming: Tables;
  /** Same as incoming.drafts, kept here for the replace path. */
  drafts: DraftQuestion[];
  images: ImageFile[];
  plan: BackupMergePlan;
  newImages: ImageFile[];
}

export interface PackPreview {
  kind: "pack";
  manifest: Manifest;
  incoming: PackData;
  images: ImageFile[];
  local: PackData;
  /** Images in the pack that this browser does not have. */
  newImages: ImageFile[];
}

export type Preview = BackupPreview | PackPreview;

/** Looks at an opened file and works out what importing it would do. Changes nothing. */
export async function previewContainer(c: Container): Promise<Preview> {
  const tables = tablesFrom(c);
  const have = new Set((await db.images.toCollection().primaryKeys()) as string[]);
  const newImages = c.images.filter((i) => !have.has(i.id));
  if (c.manifest.kind === "backup") {
    const local = await loadTables();
    return {
      kind: "backup",
      manifest: c.manifest,
      incoming: tables,
      drafts: tables.drafts,
      images: c.images,
      plan: planBackupMerge(local, tables),
      newImages,
    };
  }
  const local = await loadTables();
  return {
    kind: "pack",
    manifest: c.manifest,
    incoming: {
      nodes: tables.nodes,
      questions: tables.questions,
      blueprints: tables.blueprints,
      variants: tables.variants,
      concepts: tables.concepts,
    },
    images: c.images,
    local: {
      nodes: local.nodes,
      questions: local.questions,
      blueprints: local.blueprints,
      variants: local.variants,
      concepts: local.concepts,
    },
    newImages,
  };
}

export function planPack(p: PackPreview, options: PackOptions): PackPlan {
  return planPackImport(p.local, p.incoming, options);
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

function toImageRow(i: ImageFile) {
  return {
    id: i.id,
    blob: new Blob([new Uint8Array(i.bytes)], { type: i.mime }),
    mime: i.mime,
    width: i.width,
    height: i.height,
    createdAt: i.createdAt,
  };
}

export async function applyBackup(p: BackupPreview, mode: "merge" | "replace"): Promise<void> {
  await db.transaction(
    "rw",
    [db.nodes, db.questions, db.blueprints, db.attempts, db.images, db.variants, db.settings, db.concepts, db.drafts],
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.nodes.clear(),
          db.questions.clear(),
          db.blueprints.clear(),
          db.attempts.clear(),
          db.images.clear(),
          db.variants.clear(),
          db.settings.clear(),
          db.concepts.clear(),
          db.drafts.clear(),
        ]);
        await db.concepts.bulkPut(p.incoming.concepts ?? []);
        await db.drafts.bulkPut(p.drafts);
        await db.nodes.bulkPut(p.incoming.nodes);
        await db.questions.bulkPut(p.incoming.questions);
        await db.blueprints.bulkPut(p.incoming.blueprints);
        await db.attempts.bulkPut(p.incoming.attempts);
        await db.variants.bulkPut(p.incoming.variants);
        await db.settings.bulkPut(p.incoming.settings);
        await db.images.bulkPut(p.images.map(toImageRow));
        return;
      }
      await db.nodes.bulkPut(p.plan.puts.nodes);
      await db.questions.bulkPut(p.plan.puts.questions);
      await db.blueprints.bulkPut(p.plan.puts.blueprints);
      await db.attempts.bulkPut(p.plan.puts.attempts);
      await db.variants.bulkPut(p.plan.puts.variants);
      await db.settings.bulkPut(p.plan.puts.settings);
      await db.concepts.bulkPut(p.plan.puts.concepts);
      await db.drafts.bulkPut(p.plan.puts.drafts);
      await db.images.bulkPut(p.newImages.map(toImageRow));
    },
  );
}

/** Applies a pack. It writes only tree items, questions, blueprints, and images, never attempts. */
export async function applyPack(p: PackPreview, plan: PackPlan): Promise<void> {
  await db.transaction("rw", [db.nodes, db.questions, db.blueprints, db.variants, db.concepts, db.images], async () => {
    await db.concepts.bulkPut(plan.puts.concepts);
    await db.nodes.bulkPut(plan.puts.nodes);
    await db.questions.bulkPut(plan.puts.questions);
    await db.blueprints.bulkPut(plan.puts.blueprints);
    await db.variants.bulkPut(plan.puts.variants);
    await db.images.bulkPut(p.newImages.map(toImageRow));
  });
}

/** Triggers a download of the bytes as a file. */
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const today = () => new Date().toISOString().slice(0, 10);