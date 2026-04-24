function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function ensureTable(db) {
  await db.exec(
    [
      "CREATE TABLE IF NOT EXISTS launch_contexts (",
      "  id TEXT PRIMARY KEY,",
      "  hash TEXT NOT NULL UNIQUE,",
      "  body TEXT NOT NULL",
      ")",
    ].join(" ")
  );
}

/**
 * Returns existing 5-char code if sampleBody was already stored (by hash),
 * otherwise inserts a new record and returns a fresh code.
 */
export async function upsertLaunchContext(db, bodyObj) {
  const bodyJson = JSON.stringify(bodyObj);
  const hash = await sha256(bodyJson);

  const existing = await db
    .prepare("SELECT id FROM launch_contexts WHERE hash = ?")
    .bind(hash)
    .first();

  if (existing) return existing.id;

  let code;
  for (let attempt = 0; attempt < 10; attempt++) {
    code = generateCode();
    const collision = await db
      .prepare("SELECT id FROM launch_contexts WHERE id = ?")
      .bind(code)
      .first();
    if (!collision) break;
  }

  await db
    .prepare("INSERT INTO launch_contexts (id, hash, body) VALUES (?, ?, ?)")
    .bind(code, hash, bodyJson)
    .run();

  return code;
}
