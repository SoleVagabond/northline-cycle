// A fresh adapter per request keeps the read ETag with that request's update.
export function createBlobStore(store, { localEmulator = false } = {}) {
  const versions = new Map();
  return {
    async getPhoto(workspaceId, id) {
      return store.get(`photos/${workspaceId}/${id}`, {
        type: "json",
        consistency: "strong",
      });
    },
    async setPhoto(workspaceId, id, image, expiresAt) {
      const result = await store.setJSON(`photos/${workspaceId}/${id}`, image, {
        metadata: { expiresAt },
        onlyIfNew: true,
      });
      if (!result.modified)
        throw Object.assign(
          new Error(
            "The photo could not be saved. Refresh before trying again.",
          ),
          { status: 409 },
        );
    },
    async deletePhoto(workspaceId, id) {
      await store.delete(`photos/${workspaceId}/${id}`);
    },
    async getWorkspace(id) {
      const key = `tracker/${id}`;
      let record = await store.getWithMetadata(key, {
        type: "json",
        consistency: "strong",
      });
      if (!record) return null;
      // SDK 11.1.3's local server omits GET ETags but includes them in list().
      // Bracket a fresh read with matching versions; never pair old data with a new version.
      if (!record.etag && localEmulator) {
        const version = async () =>
          (await store.list({ prefix: key })).blobs.find(
            (blob) => blob.key === key,
          )?.etag;
        const before = await version();
        record = await store.getWithMetadata(key, {
          type: "json",
          consistency: "strong",
        });
        const after = await version();
        if (!before || before !== after || !record)
          throw Object.assign(
            new Error(
              "This repair changed in another view. The latest progress has been loaded.",
            ),
            { status: 409 },
          );
        record.etag = after;
      }
      if (!record.etag) throw new Error("Storage version is unavailable.");
      versions.set(id, record.etag);
      return record.data;
    },
    async setWorkspace(id, workspace) {
      const etag = versions.get(id);
      const result = await store.setJSON(`tracker/${id}`, workspace, {
        metadata: { expiresAt: workspace.expiresAt },
        ...(etag ? { onlyIfMatch: etag } : { onlyIfNew: true }),
      });
      if (!result.modified)
        throw Object.assign(new Error("This repair changed in another view."), {
          status: 409,
        });
      if (result.etag) versions.set(id, result.etag);
    },
    // Cloud storage performs the atomic version check at the write itself.
    async transaction(run) {
      return run();
    },
  };
}
