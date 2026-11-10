import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VAULT_LIST_CACHE_TTL_MS,
  getVaultListCache,
  invalidateVaultListCache,
  setVaultListCache,
  vaultListCacheGeneration,
} from "../src/vaults/vault-list.cache.js";

const emptyList = [];

beforeEach(() => {
  invalidateVaultListCache();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  invalidateVaultListCache();
});

describe("vault-list cache", () => {
  it("serves a fresh entry for the same user", () => {
    setVaultListCache("user-a", emptyList, vaultListCacheGeneration());

    expect(getVaultListCache("user-a")).toBe(emptyList);
    expect(getVaultListCache("user-b")).toBeNull();
  });

  it("expires entries after the short TTL", () => {
    setVaultListCache("user-a", emptyList, vaultListCacheGeneration());
    vi.advanceTimersByTime(VAULT_LIST_CACHE_TTL_MS + 1);

    expect(getVaultListCache("user-a")).toBeNull();
  });

  it("clears every user's entry on invalidation", () => {
    setVaultListCache("user-a", emptyList, vaultListCacheGeneration());
    setVaultListCache("user-b", emptyList, vaultListCacheGeneration());

    invalidateVaultListCache();

    expect(getVaultListCache("user-a")).toBeNull();
    expect(getVaultListCache("user-b")).toBeNull();
  });

  it("does not cache a read that began before a write", () => {
    const readGeneration = vaultListCacheGeneration();
    invalidateVaultListCache();

    setVaultListCache("user-a", emptyList, readGeneration);

    expect(getVaultListCache("user-a")).toBeNull();
  });
});
