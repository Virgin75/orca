/** Which workspace file a Monaco model URI belongs to; only registered models get cross-file definitions. */
export type DefinitionModelOwner = {
  worktreeId: string
  filePath: string
}

const ownersByModelUri = new Map<string, DefinitionModelOwner>()

export function registerDefinitionModelOwner(
  modelUri: string,
  owner: DefinitionModelOwner
): () => void {
  ownersByModelUri.set(modelUri, owner)
  return () => {
    if (ownersByModelUri.get(modelUri) === owner) {
      ownersByModelUri.delete(modelUri)
    }
  }
}

export function getDefinitionModelOwner(modelUri: string): DefinitionModelOwner | null {
  return ownersByModelUri.get(modelUri) ?? null
}
