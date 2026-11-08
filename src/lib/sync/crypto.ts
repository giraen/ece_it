/**
 * The sync code and the encryption behind it.
 *
 * A sync code is 20 random bytes written as 32 letters and digits in groups of four. Every device that knows it can
 * read and write the same synced data. From it each device works out two things, the same way every time:
 * - the space: a name for the shared data on the server. It is a one-way hash, so the server never learns the code.
 * - the key: the AES-256 key that every item is encrypted with before it leaves the device.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base 32: no I, L, O, or U to misread

/** A new random sync code, such as "7KQ2-…". */
export function newSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return formatCode(out);
}

/** Groups of four, so the code is easy to read out and type. */
export function formatCode(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join("-");
}

/**
 * Cleans up a typed or pasted code: ignores spaces, dashes and case, and reads O as 0 and I or L as 1.
 * Returns null when it is not a whole code.
 */
export function parseCode(text: string): string | null {
  const clean = text
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (clean.length !== 32 || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  return formatCode(clean);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The name of the shared data on the server. */
export async function spaceOf(code: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode("ece-sync-space:" + code)));
}

/** The key every synced item is encrypted with. */
export async function keyOf(code: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("ece-sync"), info: enc.encode("items") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts bytes: a fresh 12-byte iv, then the AES-GCM ciphertext. */
export async function seal(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(bytes)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function open(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(bytes.subarray(0, 12)) },
    key,
    new Uint8Array(bytes.subarray(12)),
  );
  return new Uint8Array(plain);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** An item as text the server can store: encrypted JSON, in base 64. */
export async function sealJson(key: CryptoKey, value: unknown): Promise<string> {
  return toBase64(await seal(key, enc.encode(JSON.stringify(value))));
}

export async function openJson<T>(key: CryptoKey, text: string): Promise<T> {
  return JSON.parse(dec.decode(await open(key, fromBase64(text)))) as T;
}
