import { getEntityLinkByInternalId } from "../../repositories/ecommerceRepository.js";

export async function isDarazLinked(tenantId, entityType, internalId) {
  const link = await getEntityLinkByInternalId(tenantId, entityType, internalId, "daraz");
  return Boolean(link);
}

export async function assertRequireDarazSyncOnSave(tenantId, entityType, internalId, syncToDaraz) {
  if (syncToDaraz) return;
  const linked = await isDarazLinked(tenantId, entityType, internalId);
  if (linked) {
    throw new Error("This record is linked to Daraz. Changes must be synced — local-only save is not allowed.");
  }
}
