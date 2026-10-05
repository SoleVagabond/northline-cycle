import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
const digest = (value) => createHash("sha256").update(value).digest();
const json = (status, data, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export function createOperatorAccess(
  key,
  { now = () => Date.now(), secure = false, storage } = {},
) {
  if (typeof key !== "string" || key.length < 16 || key.length > 256)
    throw new Error(
      "NORTHLINE_OPERATOR_KEY must contain between 16 and 256 characters.",
    );
  const expected = digest(key);
  const sessions = new Map();
  const failures = new Map();
  const sessionName = (token) =>
    "session/" + digest(token || "").toString("hex");
  const failureName = (address) => "failure/" + digest(address).toString("hex");
  const cookie = (token, age) =>
    `northline_operator=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  function tokenFor(request) {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("northline_operator="))
      ?.slice(19);
    return /^[a-f0-9]{64}$/.test(token || "") ? token : undefined;
  }
  const handle = async (request, address = "local") => {
    const url = new URL(request.url);
    const token = tokenFor(request);
    for (const [value, expiry] of sessions)
      if (expiry <= now()) sessions.delete(value);
    for (const [value, record] of failures)
      if (record.until <= now()) failures.delete(value);
    const savedSession =
      storage && token
        ? await storage.getAccessRecord(sessionName(token))
        : null;
    const authenticated =
      !!token &&
      (storage
        ? savedSession?.expires > now() &&
          savedSession.keyHash === expected.toString("hex")
        : (sessions.get(token) || 0) > now());
    if (url.pathname === "/api/access" && request.method === "GET")
      return json(200, { mode: "private", authenticated });
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin && origin !== url.origin)
      return json(403, { error: "Sign in from this workshop's own page." });
    if (url.pathname === "/api/session/login" && request.method === "POST") {
      const previous = storage
        ? await storage.getAccessRecord(failureName(address))
        : failures.get(address);
      const record = (previous?.until > now() ? previous : null) || {
        count: 0,
        until: now() + 600000,
      };
      if (record.count >= 8)
        return json(
          429,
          { error: "Too many sign-in attempts. Try again in ten minutes." },
          { "Retry-After": "600" },
        );
      let input;
      try {
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 1024)
          return json(413, { error: "The sign-in request is too long." });
        input = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        return json(400, { error: "The sign-in request could not be read." });
      }
      const supplied =
        typeof input?.key === "string" && input.key.length <= 256
          ? input.key
          : "";
      if (!timingSafeEqual(expected, digest(supplied))) {
        record.count++;
        if (storage)
          await storage.setAccessRecord(failureName(address), {
            ...record,
            expiresAt: new Date(record.until).toISOString(),
          });
        else failures.set(address, record);
        return json(401, { error: "That workshop key was not accepted." });
      }
      if (storage) await storage.deleteAccessRecord(failureName(address));
      else failures.delete(address);
      if (sessions.size >= 1000)
        return json(503, {
          error: "The workshop has reached its session limit. Retry later.",
        });
      const created = randomBytes(32).toString("hex");
      const expires = now() + 8 * 3600000;
      if (storage)
        await storage.setAccessRecord(sessionName(created), {
          expires,
          keyHash: expected.toString("hex"),
          expiresAt: new Date(expires).toISOString(),
        });
      else sessions.set(created, expires);
      return json(
        200,
        { authenticated: true },
        { "Set-Cookie": cookie(created, 28800) },
      );
    }
    if (url.pathname === "/api/session/logout" && request.method === "POST") {
      if (storage && token)
        await storage.deleteAccessRecord(sessionName(token));
      else sessions.delete(token);
      return json(
        200,
        { authenticated: false },
        { "Set-Cookie": cookie("", 0) },
      );
    }
    return authenticated
      ? null
      : json(401, { error: "Sign in to open this private workshop." });
  };
  return (request, address = "local") =>
    storage?.transaction
      ? storage.transaction(() => handle(request, address))
      : handle(request, address);
}
