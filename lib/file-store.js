import {
  readFile,
  mkdir,
  writeFile,
  rename,
  readdir,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { retentionDays } from "./repairs.js";
export function createFileStore(dataFile) {
  const directory = join(dirname(dataFile), "tracker");
  const mediaDirectory = join(dirname(dataFile), "photos");
  function photoFile(workspaceId, id) {
    if (!/^[a-f0-9-]{36}$/.test(workspaceId) || !/^[a-f0-9-]{36}$/.test(id))
      throw new Error("Invalid photo identifier");
    return join(mediaDirectory, workspaceId + "." + id + ".json");
  }
  let queue = Promise.resolve();
  let lastCleanup = 0;
  function transaction(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  return {
    transaction,
    async getPhoto(workspaceId, id) {
      try {
        return JSON.parse(await readFile(photoFile(workspaceId, id), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async setPhoto(workspaceId, id, image, expiresAt) {
      await mkdir(mediaDirectory, { recursive: true });
      await writeFile(
        photoFile(workspaceId, id),
        JSON.stringify({ ...image, expiresAt }),
        { encoding: "utf8", flag: "wx" },
      );
    },
    async deletePhoto(workspaceId, id) {
      await unlink(photoFile(workspaceId, id)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
    async cleanupExpired() {
      if (Date.now() - lastCleanup < 3600000) return;
      return transaction(async () => {
        let names;
        try {
          names = await readdir(directory);
        } catch (error) {
          if (error.code === "ENOENT") {
            lastCleanup = Date.now();
            return;
          }
          throw error;
        }
        for (const name of names) {
          if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
          const file = join(directory, name);
          const workspace = JSON.parse(await readFile(file, "utf8"));
          const expires =
            workspace.expiresAt ||
            new Date(
              new Date(workspace.createdAt).getTime() +
                retentionDays * 86400000,
            ).toISOString();
          if (new Date(expires).getTime() <= Date.now()) {
            for (const job of workspace.jobs || [])
              for (const photo of job.photos || [])
                await unlink(photoFile(workspace.id, photo.id)).catch(
                  (error) => {
                    if (error.code !== "ENOENT") throw error;
                  },
                );
            await unlink(file);
          }
        }
        const photos = await readdir(mediaDirectory).catch((error) => {
          if (error.code === "ENOENT") return [];
          throw error;
        });
        for (const name of photos) {
          if (!/^[a-f0-9-]{36}\.[a-f0-9-]{36}\.json$/.test(name)) continue;
          const file = join(mediaDirectory, name),
            image = JSON.parse(await readFile(file, "utf8"));
          if (Date.parse(image.expiresAt) <= Date.now())
            await unlink(file).catch((error) => {
              if (error.code !== "ENOENT") throw error;
            });
        }
        lastCleanup = Date.now();
      });
    },
    async getWorkspace(id) {
      if (!/^[a-f0-9-]{36}$/.test(id))
        throw new Error("Invalid workspace identifier");
      try {
        return JSON.parse(
          await readFile(join(directory, id + ".json"), "utf8"),
        );
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async setWorkspace(id, workspace) {
      if (!/^[a-f0-9-]{36}$/.test(id))
        throw new Error("Invalid workspace identifier");
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, id + "." + randomUUID() + ".tmp");
      await writeFile(temporary, JSON.stringify(workspace), "utf8");
      await rename(temporary, join(directory, id + ".json"));
    },
  };
}
