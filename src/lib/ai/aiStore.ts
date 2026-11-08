import { useLiveQuery } from "dexie-react-hooks";
import { db, type ProviderConfig, type Variant } from "./db";
import { now } from "./ids";
import { DEFAULT_PROVIDERS } from "./providers";

const KEY = "ai.providers";

function clean(v: unknown): ProviderConfig[] {
  if (!Array.isArray(v)) return DEFAULT_PROVIDERS;
  const list = v
    .filter((p): p is ProviderConfig => !!p && typeof p === "object" && typeof (p as ProviderConfig).id === "string")
    .map((p) => ({
      id: p.id,
      name: String(p.name ?? ""),
      type: p.type === "webllm" ? ("webllm" as const) : ("openai" as const),
      baseUrl: String(p.baseUrl ?? ""),
      model: String(p.model ?? ""),
      enabled: Boolean(p.enabled),
      computationOnly: Boolean(p.computationOnly),
    }));
  return list.length ? list : DEFAULT_PROVIDERS;
}

/** The saved provider list, or the defaults if none was saved yet. The list holds no secrets. */
export async function loadProviders(): Promise<ProviderConfig[]> {
  const row = await db.settings.get(KEY);
  return row && !row.deletedAt ? clean(row.value) : DEFAULT_PROVIDERS;
}

export async function saveProviders(list: ProviderConfig[]): Promise<void> {
  await db.settings.put({ id: KEY, value: list, updatedAt: now() });
}

export function useProviders(): ProviderConfig[] | undefined {
  return useLiveQuery(() => loadProviders(), []);
}

/** The AI-written versions of one question, newest changes included, deleted ones left out. */
export function useVariantsFor(questionId: string): Variant[] | undefined {
  return useLiveQuery(
    () =>
      db.variants
        .where("questionId")
        .equals(questionId)
        .filter((v) => !v.deletedAt)
        .toArray(),
    [questionId],
  );
}

export async function saveVariants(list: Variant[]): Promise<void> {
  if (list.length) await db.variants.bulkPut(list);
}

export async function updateVariant(id: string, patch: Partial<Variant>): Promise<void> {
  await db.variants.update(id, { ...patch, updatedAt: now() });
}