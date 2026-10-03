// Both page modules share the initial session request so their first writes cannot race.
let starting;
export function ensureWorkspace() {
  if (!starting)
    starting = fetch("/api/tracker", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The sample workspace is unavailable.");
      return data;
    });
  return starting;
}
