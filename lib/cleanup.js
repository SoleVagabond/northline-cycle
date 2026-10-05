export async function cleanupExpired(
  store,
  { now = Date.now(), batchLimit = 100, timeLimit = 15000 } = {},
) {
  let checked = 0;
  let deleted = 0;
  const started = Date.now();
  const entries = [];
  const cursor = await store.get?.("maintenance/cleanup-cursor", {
    type: "json",
  });
  for await (const page of store.list({ prefix: "tracker/", paginate: true })) {
    entries.push(...page.blobs);
  }
  for await (const page of store.list({ prefix: "photos/", paginate: true }))
    entries.push(...page.blobs);
  for await (const page of store.list({ prefix: "links/", paginate: true }))
    entries.push(...page.blobs);
  for await (const page of store.list({ prefix: "auth/", paginate: true }))
    entries.push(...page.blobs);
  const pending = [
    ...new Map(entries.map((entry) => [entry.key, entry])).values(),
  ]
    .sort((a, b) => a.key.localeCompare(b.key))
    .filter((entry) => entry.key > (cursor?.lastKey || ""));
  let lastKey = "";
  let more = false;
  for (const entry of pending) {
    if (checked >= batchLimit || Date.now() - started > timeLimit) {
      more = true;
      break;
    }
    checked++;
    lastKey = entry.key;
    const metadata = await store.getMetadata(entry.key, {
      consistency: "strong",
    });
    const expires = metadata?.metadata?.expiresAt;
    if (typeof expires === "string" && new Date(expires).getTime() <= now) {
      await store.delete(entry.key);
      deleted++;
    }
  }
  await store.setJSON?.("maintenance/cleanup-cursor", {
    lastKey: more ? lastKey || cursor?.lastKey || "" : "",
  });
  return { checked, deleted, more };
}
