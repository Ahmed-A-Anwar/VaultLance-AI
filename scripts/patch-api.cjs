const fs = require('fs');
const f = 'c:/Users/omarw/Downloads/VaultLance-AI/src/lib/api.ts';
let src = fs.readFileSync(f, 'utf8');

// Normalize to \n for matching
src = src.replace(/\r\n/g, '\n');

// 1. Replace getVaultDetail
const oldGVD = `/* GET /v1/vaults/{id} */
export async function getVaultDetail(id: string): Promise<VaultDetail> {
  return call(() => {
    const v = find(id);
    const seed = seedFor(id);
    /* a vault that already passed its audit opens with the results in place */
    const settled = v.status === "audited" || v.status === "unlocked";
    return {
      vault: { ...v },
      files: seed.files.map((f) => ({ ...f })),
      checks: seed.checks.map((c) => ({ ...c, state: settled ? c.result : "queued", rows: c.rows.map((r) => ({ ...r })) })),
      messages: [],
      suggestions: [...seed.suggestions],
      questionsUsed: questionsUsed.get(id) ?? 0,
      questionLimit: QUESTION_LIMIT,
    };
  });
}`;

const newGVD = `/* GET /api/vaults/{id}/audit-detail — real backend fetch */
export async function getVaultDetail(id: string): Promise<VaultDetail> {
  try {
    const res = await fetch(\`\${API_BASE}/api/vaults/\${id}/audit-detail\`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const json = await res.json();
      const d = json.data;
      const v = d.vault;
      const frontendVault: Vault = {
        id: v.id,
        project: v.title,
        freelancer: "Freelancer",
        amountUSD: Number(v.amount) || 0,
        status: mapBackendStatusToFrontend(v.status),
        createdAt: new Date(v.createdAt || v.created_at || Date.now()).getTime(),
        paypalOrderId: v.id ? \`8XK\${v.id.slice(0, 8).toUpperCase()}\` : undefined,
      };
      return {
        vault: frontendVault,
        files: (d.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          kind: f.kind || "file",
          meta: f.meta || "",
        })),
        checks: (d.checks || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          detail: c.detail,
          source: c.source || "TEST LOG",
          result: c.result || "pass",
          state: c.state || "queued",
          rows: c.rows || [],
        })),
        messages: [],
        suggestions: d.suggestions || ["What was delivered?", "Are there any issues?", "Is the build ready to ship?"],
        questionsUsed: d.questionsUsed ?? (questionsUsed.get(id) ?? 0),
        questionLimit: d.questionLimit ?? QUESTION_LIMIT,
      };
    }
  } catch {
    /* backend unreachable — fall through to in-memory */
  }
  /* fallback to in-memory mock if backend fails */
  return call(() => {
    const v = find(id);
    const seed = seedFor(id);
    const settled = v.status === "audited" || v.status === "unlocked";
    return {
      vault: { ...v },
      files: seed.files.map((f) => ({ ...f })),
      checks: seed.checks.map((c) => ({ ...c, state: settled ? c.result : "queued", rows: c.rows.map((r) => ({ ...r })) })),
      messages: [],
      suggestions: [...seed.suggestions],
      questionsUsed: questionsUsed.get(id) ?? 0,
      questionLimit: QUESTION_LIMIT,
    };
  });
}`;

if (!src.includes(oldGVD)) {
  console.log('ERROR: getVaultDetail target not found');
  process.exit(1);
}
src = src.replace(oldGVD, newGVD);
console.log('1. getVaultDetail replaced');

// 2. Replace listFiles
const oldLF = `/* GET /v1/vaults/{id}/files */
export async function listFiles(id: string): Promise<VaultFile[]> {
  return call(() => {
    find(id);
    return seedFor(id).files.map((f) => ({ ...f }));
  });
}`;

const newLF = `/* GET /api/vaults/{id}/audit-detail (files subset) */
export async function listFiles(id: string): Promise<VaultFile[]> {
  try {
    const detail = await getVaultDetail(id);
    return detail.files;
  } catch {
    return call(() => {
      find(id);
      return seedFor(id).files.map((f) => ({ ...f }));
    });
  }
}`;

if (src.includes(oldLF)) {
  src = src.replace(oldLF, newLF);
  console.log('2. listFiles replaced');
} else {
  console.log('2. listFiles target not found — skipping');
}

// 3. Replace runChecks
const oldRC = `/* POST /v1/vaults/{id}/checks:run — resolves with every result, and calls back
   per check so the panel can move one card at a time. On the last result the
   vault is audited and the event bus hears about it. */
export async function runChecks(
  id: string,
  onProgress?: (checkId: string, state: CheckResult) => void
): Promise<VaultCheck[]> {
  const v = find(id);
  expectStatus(v, ["held"], "be audited");
  const seed = seedFor(id).checks;
  const timings = [618, 1000, 1618, 1000];
  const done: VaultCheck[] = [];

  for (let i = 0; i < seed.length; i++) {
    const def = seed[i];
    onProgress?.(def.id, "running");
    await wait(timings[i % timings.length]);
    if (Math.random() < FAIL_RATE) {
      onProgress?.(def.id, "queued");
      throw new ApiError("network", "A check could not reach the audit runner.");
    }
    onProgress?.(def.id, def.result);
    done.push({ ...def, state: def.result, rows: def.rows.map((r) => ({ ...r })) });
  }

  setStatus(id, "audited");
  checkedAt.set(id, Date.now());
  emit("AUDIT.COMPLETED", id, "Audit run finished, report ready", { paypalId: v.paypalOrderId });
  return done;
}`;

const newRC = `/* POST /api/vaults/{id}/checks/run — runs audit checks on backend, with
   visual progress animation on the frontend per check card. */
export async function runChecks(
  id: string,
  onProgress?: (checkId: string, state: CheckResult) => void
): Promise<VaultCheck[]> {
  try {
    const res = await fetch(\`\${API_BASE}/api/vaults/\${id}/checks/run\`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      const json = await res.json();
      const serverChecks: VaultCheck[] = (json.data?.checks || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        detail: c.detail,
        source: c.source || "TEST LOG",
        result: c.result || "pass",
        state: c.state || c.result || "pass",
        rows: c.rows || [],
      }));
      /* Animate progress locally even though server already computed results */
      const timings = [618, 800, 1000, 618];
      for (let i = 0; i < serverChecks.length; i++) {
        const chk = serverChecks[i];
        onProgress?.(chk.id, "running");
        await wait(timings[i % timings.length]);
        onProgress?.(chk.id, chk.result);
      }
      checkedAt.set(id, Date.now());
      emit("AUDIT.COMPLETED", id, "Audit run finished, report ready", {});
      return serverChecks;
    }
  } catch {
    /* backend unreachable — fall through to mock */
  }
  /* fallback to mock */
  const v = find(id);
  expectStatus(v, ["held"], "be audited");
  const seed = seedFor(id).checks;
  const timings = [618, 1000, 1618, 1000];
  const done: VaultCheck[] = [];
  for (let i = 0; i < seed.length; i++) {
    const def = seed[i];
    onProgress?.(def.id, "running");
    await wait(timings[i % timings.length]);
    if (Math.random() < FAIL_RATE) {
      onProgress?.(def.id, "queued");
      throw new ApiError("network", "A check could not reach the audit runner.");
    }
    onProgress?.(def.id, def.result);
    done.push({ ...def, state: def.result, rows: def.rows.map((r) => ({ ...r })) });
  }
  setStatus(id, "audited");
  checkedAt.set(id, Date.now());
  emit("AUDIT.COMPLETED", id, "Audit run finished, report ready", { paypalId: v.paypalOrderId });
  return done;
}`;

if (src.includes(oldRC)) {
  src = src.replace(oldRC, newRC);
  console.log('3. runChecks replaced');
} else {
  console.log('3. runChecks target not found — skipping');
}

// 4. Replace askAI
const oldAI = `/* POST /v1/vaults/{id}/chat — server-sent answer. The demo matches keywords
   instead of calling a model, and always reports itself as a cached answer. */
export async function askAI(
  id: string,
  question: string,
  onToken: (chunk: string) => void
): Promise<{ text: string; sources: SourceChip[]; cached: boolean }> {
  const v = find(id);
  await wait(latency());
  if (Math.random() < FAIL_RATE) throw new ApiError("network", "The audit agent did not answer.");

  const answer = answerFor(v, question);
  /* 40 characters a second, the way a model trickles tokens */
  for (const char of answer.text) {
    onToken(char);
    await wait(25);
  }
  questionsUsed.set(id, (questionsUsed.get(id) ?? 0) + 1);
  return { text: answer.text, sources: answer.sources, cached: true };
}`;

const newAI = `/* POST /api/vaults/{id}/chat — calls the real backend AI endpoint.
   Falls back to in-memory answerFor() if backend is unreachable. */
export async function askAI(
  id: string,
  question: string,
  onToken: (chunk: string) => void
): Promise<{ text: string; sources: SourceChip[]; cached: boolean }> {
  try {
    const res = await fetch(\`\${API_BASE}/api/vaults/\${id}/chat\`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ question }),
    });
    if (res.ok) {
      const json = await res.json();
      const d = json.data;
      const text: string = d.text || "";
      /* trickle tokens locally for the streaming effect */
      for (const char of text) {
        onToken(char);
        await wait(18);
      }
      questionsUsed.set(id, (questionsUsed.get(id) ?? 0) + 1);
      return {
        text,
        sources: (d.sources || []) as SourceChip[],
        cached: d.cached ?? false,
      };
    }
  } catch {
    /* backend unreachable — fall through to mock */
  }
  /* fallback to mock */
  const v = find(id);
  await wait(latency());
  if (Math.random() < FAIL_RATE) throw new ApiError("network", "The audit agent did not answer.");
  const answer = answerFor(v, question);
  for (const char of answer.text) {
    onToken(char);
    await wait(25);
  }
  questionsUsed.set(id, (questionsUsed.get(id) ?? 0) + 1);
  return { text: answer.text, sources: answer.sources, cached: true };
}`;

if (src.includes(oldAI)) {
  src = src.replace(oldAI, newAI);
  console.log('4. askAI replaced');
} else {
  console.log('4. askAI target not found — skipping');
}

// Convert back to CRLF and save
src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(f, src);
console.log('Saved!');
