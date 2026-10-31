/* useSettings.ts — one read of GET /v1/me/settings for the page. The cards take
   their saved values from here and hand the new ones back through patch(), so a
   save does not refetch the whole account. */

import { useCallback, useEffect, useState } from "react";
import { ApiError, getSettings, type AccountSettings } from "../../../lib/api";

const asApiError = (e: unknown): ApiError =>
  e instanceof ApiError ? e : new ApiError("network", "Something went wrong. Try again.");

export function useSettings() {
  const [data, setData] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [pass, setPass] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    getSettings()
      .then((next) => {
        if (live) setData(next);
      })
      .catch((e) => {
        if (live) setError(asApiError(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [pass]);

  const reload = useCallback(() => setPass((n) => n + 1), []);

  const patch = useCallback((next: Partial<AccountSettings>) => {
    setData((prev) => (prev ? { ...prev, ...next } : prev));
  }, []);

  return { data, loading, error, reload, patch };
}
