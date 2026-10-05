import { randomUUID } from "node:crypto";
export const photoRequestLimit = 1450000;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function validPng(bytes) {
  let offset = 8,
    sawData = false,
    sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      end = offset + 12 + length;
    if (end > bytes.length) return false;
    const kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (
      crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      return false;
    if (kind === "IDAT") sawData = true;
    if (kind === "IEND") {
      if (length !== 0 || end !== bytes.length) return false;
      sawEnd = true;
      break;
    }
    offset = end;
  }
  return sawData && sawEnd;
}
export function validateImage(data) {
  if (
    typeof data !== "string" ||
    data.length > 1400000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
    data.length % 4
  )
    throw new Error("Choose a PNG or JPEG image no larger than 1 MB.");
  const bytes = Buffer.from(data, "base64");
  if (
    !bytes.length ||
    bytes.length > 1048576 ||
    bytes.toString("base64") !== data
  )
    throw new Error("Choose a PNG or JPEG image no larger than 1 MB.");
  let width, height, type;
  if (
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.subarray(12, 16).toString() === "IHDR"
  ) {
    if (!validPng(bytes))
      throw new Error("This PNG is damaged. Choose a valid PNG or JPEG image.");
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    type = "image/png";
  } else if (
    bytes.length > 10 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  ) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      ) {
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        type = "image/jpeg";
        break;
      }
      offset += length;
    }
  }
  if (
    !type ||
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 12000000
  )
    throw new Error(
      "Use a valid PNG or JPEG, up to 12 megapixels and 8192 pixels per side.",
    );
  return { data, type, width, height };
}
export async function photoRoute(
  request,
  {
    workspaceFor,
    cookieId,
    storage,
    now,
    readInput,
    json,
    operationsWorkspace,
  },
) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/photos")) return null;
  const id = cookieId(request);
  if (!id) return json(401, { error: "Open your workshop first." });
  if (path === "/api/photos" && request.method === "POST") {
    const input = await readInput(request, photoRequestLimit);
    if (
      Object.keys(input).some(
        (key) =>
          !["revision", "jobId", "data", "caption", "customerVisible"].includes(
            key,
          ),
      ) ||
      typeof input.caption !== "string" ||
      !input.caption.trim() ||
      input.caption.length > 120 ||
      /[\u0000-\u001f]/.test(input.caption) ||
      typeof input.customerVisible !== "boolean"
    )
      return json(422, {
        error:
          "Add a short photo description and choose whether the customer may see it.",
      });
    let image;
    try {
      image = validateImage(input.data);
    } catch (error) {
      return json(422, { error: error.message });
    }
    return storage.transaction(async () => {
      const original = await workspaceFor(id);
      if (!original) return json(404, { error: "Workspace unavailable." });
      if (input.revision !== original.revision)
        return json(409, {
          error: "The workshop changed. Refresh before attaching this photo.",
        });
      const workspace = operationsWorkspace(original);
      const job = workspace.jobs.find((item) => item.id === input.jobId);
      if (
        !job ||
        ["cancelled", "collected"].includes(job.status) ||
        job.photos.length >= 6
      )
        return json(422, {
          error: "Attach up to six photos to an open repair.",
        });
      const photoId = randomUUID();
      await storage.setPhoto(id, photoId, image, workspace.expiresAt);
      job.photos.push({
        id: photoId,
        caption: input.caption.trim(),
        customerVisible: input.customerVisible,
        at: now().toISOString(),
      });
      job.updatedAt = now().toISOString();
      workspace.revision++;
      workspace.updatedAt = now().toISOString();
      try {
        await storage.setWorkspace(id, workspace);
      } catch (error) {
        await storage.deletePhoto(id, photoId);
        throw error;
      }
      return json(201, { workspace });
    });
  }
  const match = path.match(/^\/api\/photos\/([a-f0-9-]{36})$/);
  if (match && request.method === "GET") {
    const workspace = await workspaceFor(id);
    if (
      !workspace?.jobs.some((job) =>
        job.photos?.some((photo) => photo.id === match[1]),
      )
    )
      return json(404, { error: "Photo unavailable." });
    const image = await storage.getPhoto(id, match[1]);
    if (!image) return json(404, { error: "Photo unavailable." });
    return new Response(Buffer.from(image.data, "base64"), {
      headers: {
        "Content-Type": image.type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }
  return json(404, { error: "Photo action unavailable." });
}
