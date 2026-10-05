// Both page modules share the initial session request so their first writes cannot race.
let starting;
export const apiPath = (path) =>
  path.startsWith("/api/") &&
  !path.startsWith("/api/customer/") &&
  !path.startsWith("/api/public/")
    ? path.replace(
        "/api/",
        location.pathname.startsWith("/demo") ? "/api/demo/" : "/api/staff/",
      )
    : path;
export async function apiData(response, fallback) {
  let data;
  try {
    data = await response.json();
  } catch {
    if (response.ok)
      throw new Error(
        "The service returned an incomplete response. Refresh before trying again.",
      );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status === 429
          ? "Too many requests. Wait one minute, then refresh and try again."
          : data?.error || fallback,
      ),
      { status: response.status },
    );
  return data;
}
export function ensureWorkspace() {
  if (!starting)
    starting = fetch(apiPath("/api/tracker"), {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    })
      .then((response) =>
        apiData(
          response,
          "The saved workspace is unavailable. Try again shortly.",
        ),
      )
      .catch((error) => {
        starting = undefined;
        throw error;
      });
  return starting;
}
