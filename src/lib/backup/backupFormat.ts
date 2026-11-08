import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

/**
 * File layout
 *   magic "ECEBK1" (6) | kind (1) | then, depending on kind:
 *   kind 1 (full backup, encrypted) and kind 3 (pack, encrypted):
 *       iterations (4, big endian) | salt (16) | iv (12) | AES-256-GCM ciphertext
 *       The whole header up to the iv is authenticated, so the kind cannot be changed without detection.
 *   kind 2 (pack, no password): the zip bytes directly.
 * The zip holds manifest.json, data.json, images.json, and one file per image under images/.
 */

export const MAGIC = "ECEBK1";
export const KDF_ITERATIONS = 600_000;
const MAX_ITERATIONS = 5_000_000;

export type FileKind = "backup" | "pack";

const KIND_BACKUP_ENC = 1;
const KIND_PACK_PLAIN = 2;
const KIND_PACK_ENC = 3;

export type BackupErrorCode = "not_ours" | "password_needed" | "wrong_password" | "corrupt" | "insecure" | "bad_input";

export class BackupError extends Error {
  code: BackupErrorCode;
  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ImageFile {
  id: string;
  mime: string;
  width: number;
  height: number;
  createdAt: number;
  bytes: Uint8Array;
}

export interface Manifest {
  app: "ece-review";
  format: 1;
  kind: FileKind;
  createdAt: number;
  name?: string;
  counts: Record<string, number>;
}

export interface Container {
  manifest: Manifest;
  data: Record<string, unknown[]>;
  images: ImageFile[];
}

/** A copy backed by a plain ArrayBuffer, which the Web Crypto typings require. */
function buf(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(u8);
}

export function buildZip(c: Container): Uint8Array {
  const files: Zippable = {
    "manifest.json": strToU8(JSON.stringify(c.manifest)),
    "data.json": strToU8(JSON.stringify(c.data)),
    "images.json": strToU8(
      JSON.stringify(
        c.images.map(({ id, mime, width, height, createdAt }) => ({ id, mime, width, height, createdAt })),
      ),
    ),
  };
  for (const img of c.images) files[`images/${img.id}`] = [img.bytes, { level: 0 }];
  return zipSync(files);
}

export function readZip(bytes: Uint8Array): Container {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupError("corrupt", "The file is damaged or is not a backup made by this app.");
  }
  try {
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as Manifest;
    const data = JSON.parse(strFromU8(files["data.json"])) as Record<string, unknown[]>;
    const meta = JSON.parse(strFromU8(files["images.json"])) as Omit<ImageFile, "bytes">[];
    if (manifest.app !== "ece-review" || manifest.format !== 1) {
      throw new Error("wrong manifest");
    }
    const images = meta.map((m) => {
      const bytes = files[`images/${m.id}`];
      if (!bytes) throw new Error("missing image " + m.id);
      return { ...m, bytes };
    });
    return { manifest, data, images };
  } catch {
    throw new BackupError("corrupt", "The file is damaged or is not a backup made by this app.");
  }
}

function subtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new BackupError(
      "insecure",
      "Encryption is not available here. Open the app at localhost or over https and try again.",
    );
  }
  return crypto.subtle;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const s = subtle();
  const base = await s.importKey("raw", buf(strToU8(password)), "PBKDF2", false, ["deriveKey"]);
  return s.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const HEADER_LEN = 6 + 1 + 4 + 16 + 12;

/**
 * Turns a container into file bytes. A full backup always needs a password.
 * A pack is encrypted only when a password is given.
 */
export async function encodeFile(c: Container, password?: string, iterations = KDF_ITERATIONS): Promise<Uint8Array> {
  const zip = buildZip(c);
  const magic = strToU8(MAGIC);

  if (!password) {
    if (c.manifest.kind === "backup") throw new BackupError("bad_input", "A full backup needs a password.");
    const out = new Uint8Array(7 + zip.length);
    out.set(magic, 0);
    out[6] = KIND_PACK_PLAIN;
    out.set(zip, 7);
    return out;
  }

  const header = new Uint8Array(HEADER_LEN);
  header.set(magic, 0);
  header[6] = c.manifest.kind === "backup" ? KIND_BACKUP_ENC : KIND_PACK_ENC;
  new DataView(header.buffer).setUint32(7, iterations, false);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  header.set(salt, 11);
  header.set(iv, 27);

  const key = await deriveKey(password, salt, iterations);
  const cipher = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(header) }, key, buf(zip)),
  );
  const out = new Uint8Array(HEADER_LEN + cipher.length);
  out.set(header, 0);
  out.set(cipher, HEADER_LEN);
  return out;
}

export interface Peek {
  kind: FileKind;
  encrypted: boolean;
}

/** Reads only the first bytes, so the app can tell what a file is before asking for a password. */
export function peekFile(bytes: Uint8Array): Peek {
  if (bytes.length < 7 || strFromU8(bytes.subarray(0, 6)) !== MAGIC) {
    throw new BackupError("not_ours", "This is not a file made by this app.");
  }
  switch (bytes[6]) {
    case KIND_BACKUP_ENC:
      return { kind: "backup", encrypted: true };
    case KIND_PACK_PLAIN:
      return { kind: "pack", encrypted: false };
    case KIND_PACK_ENC:
      return { kind: "pack", encrypted: true };
    default:
      throw new BackupError("not_ours", "This file comes from a newer version of the app.");
  }
}

/** Opens a file. Throws `password_needed` or `wrong_password` when the password is missing or wrong. */
export async function decodeFile(bytes: Uint8Array, password?: string): Promise<Container> {
  const peek = peekFile(bytes);
  let zip: Uint8Array;

  if (!peek.encrypted) {
    zip = bytes.subarray(7);
  } else {
    if (!password) throw new BackupError("password_needed", "This file needs a password.");
    if (bytes.length < HEADER_LEN + 16) throw new BackupError("corrupt", "The file is damaged.");
    const header = bytes.slice(0, HEADER_LEN);
    const iterations = new DataView(header.buffer).getUint32(7, false);
    if (iterations < 1 || iterations > MAX_ITERATIONS) throw new BackupError("corrupt", "The file is damaged.");
    const salt = header.slice(11, 27);
    const iv = header.slice(27, 39);
    const key = await deriveKey(password, salt, iterations);
    try {
      zip = new Uint8Array(
        await subtle().decrypt(
          { name: "AES-GCM", iv: buf(iv), additionalData: buf(header) },
          key,
          buf(bytes.subarray(HEADER_LEN)),
        ),
      );
    } catch {
      throw new BackupError("wrong_password", "Wrong password, or the file has been changed or damaged.");
    }
  }

  const container = readZip(zip);
  if (container.manifest.kind !== peek.kind) {
    throw new BackupError("corrupt", "The file's type does not match its contents.");
  }
  return container;
}