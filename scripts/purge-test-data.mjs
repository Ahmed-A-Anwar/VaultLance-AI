#!/usr/bin/env node
/**
 * purge-test-data.mjs — clean e2e/test accounts out of a live database.
 *
 * Dry run is the default: it prints what it would delete and touches nothing.
 * Deletion needs `--apply`. `--apply` also refuses any account that participates
 * in someone else's vault (those foreign keys are ON DELETE RESTRICT and hold
 * real review history) and reports it as `blocked` instead; `--suspend-blocked`
 * sets those to SUSPENDED and revokes their sessions instead of deleting.
 *
 * Usage:
 *   node --env-file=backend/.env scripts/purge-test-data.mjs
 *   node --env-file=backend/.env scripts/purge-test-data.mjs --apply
 *   node --env-file=backend/.env scripts/purge-test-data.mjs --apply --suspend-blocked
 *   node --env-file=backend/.env scripts/purge-test-data.mjs --email=someone@example.com --apply
 *
 * Never prints a secret, a token or a full email address. Reads DATABASE_URL,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET from the
 * environment; with no DATABASE_URL it exits before connecting anywhere.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

/* ── arguments ─────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const APPLY = has("apply");
const BACKUP_ONLY = has("backup-only");
const SUSPEND_BLOCKED = has("suspend-blocked");
/* --all targets every non-playground account that is not in the keep list,
   instead of only the addresses that match a test pattern. */
const ALL_TARGETS = has("all");
const explicitEmails = argv
  .filter((arg) => arg.startsWith("--email="))
  .map((arg) => arg.slice("--email=".length).trim().toLowerCase())
  .filter(Boolean);
/* --keep is repeatable and wins over everything, including --all. */
const keepEmails = argv
  .filter((arg) => arg.startsWith("--keep="))
  .map((arg) => arg.slice("--keep=".length).trim().toLowerCase())
  .filter(Boolean);

/* ── the address patterns this repo's scripts and suites create ────────── */
const PATTERNS = [
  { label: "e2e-run", re: /^e2e-\d+/i },
  { label: "example.com", re: /@example\.com$/i },
  { label: "example.test", re: /@example\.test$/i },
  { label: "vault.test", re: /@vault\.test$/i },
];

/* ── masking: enough to recognise a row, never enough to reuse it ──────── */
const maskEmail = (email) => {
  const [name, domain = ""] = String(email || "").split("@");
  const head = name.slice(0, 1) || "?";
  return `${head}${"*".repeat(Math.max(1, Math.min(6, name.length - 1)))}@${domain}`;
};
const shortId = (id) => `${String(id).slice(0, 8)}…`;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  fail(
    "DATABASE_URL is not set. Put it in backend/.env and run this with `node --env-file=backend/.env ...`"
  );
}

/* production sets this explicitly (fly.toml, render.yaml); the code fallback is
   "vault-files", so an unset variable in a local run must not be trusted blindly */
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "vault-deliverables";
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectInsecureLocalhost: false },
      })
    : null;

/* Supabase requires TLS; a local socket does not. */
const isLocal = /(^|@)(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(connectionString);
const pool = new Pool({
  connectionString,
  max: 2,
  connectionTimeoutMillis: 15000,
  statement_timeout: 60000,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const q = (client, text, params) => client.query(text, params);

/* FK-less tables created at boot by money/schema.ts and audit/schema.ts. */
const BOOT_TABLES = [
  "vault_manifests",
  "vault_captures",
  "vault_payouts",
  "vault_invites",
  "paypal_events",
  "audit_messages",
];

async function tableExists(client, name) {
  const { rows } = await q(client, "select to_regclass($1) is not null as present", [
    `public.${name}`,
  ]);
  return Boolean(rows[0]?.present);
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: idRows } = await q(
      client,
      `select current_database() as db,
              current_user as usr,
              (select count(*) from users)::int as users,
              (select count(*) from users where is_playground)::int as playground_users,
              (select count(*) from vaults)::int as vaults,
              (select count(*) from vaults where is_playground)::int as playground_vaults`
    );
    const id = idRows[0];

    console.log("─".repeat(72));
    console.log(`target database : ${id.db} as ${id.usr}`);
    console.log(`rows             : ${id.users} users (${id.playground_users} playground), ${id.vaults} vaults (${id.playground_vaults} playground)`);
    console.log(`storage bucket   : ${bucket}${supabase ? "" : "  (no storage client: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)"}`);
    console.log(`mode             : ${APPLY ? "APPLY (deletes)" : "dry run (no writes)"}`);
    console.log("─".repeat(72));

    const { rows: accounts } = await q(
      client,
      `select u.id, u.email, u.is_playground, u.account_status, u.created_at,
              (select count(*) from vaults v where v.freelancer_id = u.id)::int as owned_vaults,
              (select count(*) from vault_members m
                 join vaults v on v.id = m.vault_id
                where m.user_id = u.id and v.freelancer_id <> u.id)::int as member_of_others,
              (select count(*) from approvals a
                 join vaults v on v.id = a.vault_id
                where a.requested_by = u.id and v.freelancer_id <> u.id)::int as approvals_requested_elsewhere,
              (select count(*) from approvals a
                 join vaults v on v.id = a.vault_id
                where a.reviewed_by = u.id and v.freelancer_id <> u.id)::int as approvals_reviewed_elsewhere,
              (select count(*) from agreements a
                 join vaults v on v.id = a.vault_id
                where a.created_by = u.id and v.freelancer_id <> u.id)::int as agreements_authored_elsewhere,
              (select count(*) from vault_members m
                 join vaults v on v.id = m.vault_id
                where m.invited_by = u.id and v.freelancer_id <> u.id)::int as invites_into_others
         from users u
        where not u.is_playground
        order by u.created_at`
    );

    const classified = accounts.map((row) => {
      const mail = String(row.email || "").toLowerCase();
      const match = PATTERNS.find((pattern) => pattern.re.test(mail));
      const crossLinks =
        row.member_of_others +
        row.approvals_requested_elsewhere +
        row.approvals_reviewed_elsewhere +
        row.agreements_authored_elsewhere +
        row.invites_into_others;
      const kept = keepEmails.includes(mail);
      return {
        ...row,
        mail,
        pattern: match?.label || null,
        crossLinks,
        keep: kept,
        explicit: !kept && (explicitEmails.includes(mail) || (ALL_TARGETS && !row.is_playground)),
      };
    });

    console.log("\nnon-playground accounts:");
    console.log(
      ["account", "status", "vaults", "cross-links", "flag"].map((h) => h.padEnd(14)).join(" ")
    );
    for (const row of classified) {
      const bucketLabel = row.keep
        ? "KEEP"
        : row.explicit
          ? "targeted"
          : row.pattern
            ? `match:${row.pattern}`
            : "keep";
      console.log(
        [
          maskEmail(row.email).padEnd(30),
          String(row.account_status || "").padEnd(14),
          String(row.owned_vaults).padEnd(14),
          String(row.crossLinks).padEnd(14),
          bucketLabel,
        ].join(" ")
      );
    }

    const doomed = classified.filter(
      (row) => !row.keep && (row.explicit || row.pattern) && row.crossLinks === 0
    );
    const blocked = classified.filter(
      (row) => !row.keep && (row.explicit || row.pattern) && row.crossLinks > 0
    );

    for (const email of keepEmails) {
      if (!classified.some((row) => row.mail === email)) {
        console.log(`note: --keep=${email} does not match any non-playground account`);
      }
    }

    if (!doomed.length && !blocked.length) {
      console.log("\nNothing matched a test-account pattern. Pass --email=<address> to target one explicitly.");
      return;
    }

    const userIds = doomed.map((row) => row.id);

    const { rows: vaultRows } = userIds.length
      ? await q(client, "select id from vaults where freelancer_id = any($1::uuid[])", [userIds])
      : { rows: [] };
    const vaultIds = vaultRows.map((row) => row.id);

    /* Per-table impact, computed the same way the delete will. */
    const counts = {};
    if (vaultIds.length) {
      const vaultScoped = [
        "approvals",
        "verification_runs",
        "paypal_transactions",
        "milestones",
        "agreements",
        "vault_files",
        "ledger_events",
        "vault_members",
        "vaults",
      ];
      for (const table of vaultScoped) {
        const { rows } = await q(
          client,
          `select count(*)::int as n from ${table} where ${table === "vaults" ? "id" : "vault_id"} = any($1::uuid[])`,
          [vaultIds]
        );
        counts[table] = rows[0].n;
      }
      for (const table of BOOT_TABLES) {
        if (!(await tableExists(client, table))) continue;
        const { rows } = await q(
          client,
          `select count(*)::int as n from ${table} where vault_id = any($1::text[])`,
          [vaultIds]
        );
        counts[table] = rows[0].n;
      }
    }

    let storagePaths = [];
    if (vaultIds.length) {
      const { rows } = await q(
        client,
        "select storage_path from vault_files where vault_id = any($1::uuid[]) and storage_path is not null",
        [vaultIds]
      );
      storagePaths = rows.map((row) => row.storage_path);
    }

    console.log("\nplan:");
    console.log(`  delete accounts      : ${doomed.length}`);
    for (const row of doomed) {
      console.log(`      ${maskEmail(row.email)}  (${row.owned_vaults} vault(s) ${shortId(row.id)})`);
    }
    if (blocked.length) {
      console.log(`  blocked (kept)       : ${blocked.length}`);
      for (const row of blocked) {
        console.log(
          `      ${maskEmail(row.email)}  cross-links=${row.crossLinks}` +
            (SUSPEND_BLOCKED ? "  -> will be SUSPENDED" : "  -> use --suspend-blocked")
        );
      }
    }
    console.log(`  vaults               : ${vaultIds.length}`);
    for (const [table, n] of Object.entries(counts)) {
      console.log(`      ${String(table).padEnd(20)} ${n}`);
    }
    console.log(`  storage objects      : ${storagePaths.length} from bucket ${bucket}`);

    if (!APPLY && !BACKUP_ONLY) {
      console.log("\ndry run complete. Re-run with --apply to delete the accounts above.");
      return;
    }

    /* ── snapshot: every row this run can remove, before it is gone ──────── */
    const snapshot = { takenAt: new Date().toISOString(), database: id.db, bucket, users: [], tables: {} };
    snapshot.users = doomed.map((row) => ({
      id: row.id,
      email: row.email,
      status: row.account_status,
      ownedVaults: row.owned_vaults,
      createdAt: row.created_at,
    }));
    snapshot.blocked = blocked.map((row) => ({ id: row.id, email: row.email, crossLinks: row.crossLinks }));

    if (vaultIds.length) {
      const uuidTables = [
        "vaults",
        "vault_members",
        "vault_files",
        "ledger_events",
        "milestones",
        "agreements",
        "approvals",
        "paypal_transactions",
        "verification_runs",
      ];
      for (const table of uuidTables) {
        const { rows } = await q(
          client,
          `select * from ${table} where ${table === "vaults" ? "id" : "vault_id"} = any($1::uuid[])`,
          [vaultIds]
        );
        snapshot.tables[table] = rows;
      }
      for (const table of BOOT_TABLES) {
        if (!(await tableExists(client, table))) continue;
        const { rows } = await q(client, `select * from ${table} where vault_id = any($1::text[])`, [
          vaultIds,
        ]);
        snapshot.tables[table] = rows;
      }
    }
    if (userIds.length) {
      const { rows: sessions } = await q(
        client,
        "select * from auth_sessions where user_id = any($1::text[])",
        [userIds.map(String)]
      );
      snapshot.tables.auth_sessions = sessions;
    }
    snapshot.storagePaths = storagePaths;

    const backupDir = path.resolve(".tmp");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(
      backupDir,
      `purge-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(backupFile, JSON.stringify(snapshot, null, 2));
    const backupKb = Math.round(fs.statSync(backupFile).size / 1024);
    console.log(`\nsnapshot written: ${backupFile} (${backupKb} kB)`);

    if (BACKUP_ONLY) {
      console.log("backup-only complete; nothing deleted.");
      return;
    }

    /* ── apply ───────────────────────────────────────────────────────────── */

    /* 1. bytes first: once the rows go, the object keys are unrecoverable */
    let removedObjects = 0;
    if (supabase && storagePaths.length) {
      /* A wrong bucket removes nothing and strands the rows' bytes for good:
         probe the doomed keys, and refuse if they live in the other bucket. */
      const probes = storagePaths.slice(0, 10);
      const hitsIn = async (name) => {
        let hits = 0;
        for (const probe of probes) {
          const { data } = await supabase.storage.from(name).list("", { search: probe, limit: 1 });
          if (data?.some((entry) => entry.name === probe)) hits += 1;
        }
        return hits;
      };

      if (!(await hitsIn(bucket))) {
        const other = bucket === "vault-deliverables" ? "vault-files" : "vault-deliverables";
        if (await hitsIn(other)) {
          fail(
            `the doomed files live in bucket "${other}", not "${bucket}". ` +
              `Set SUPABASE_STORAGE_BUCKET=${other}; nothing was deleted.`
          );
        }
        /* metadata-only rows: the bytes were never uploaded or are already gone */
        console.log(`\nwarning: none of ${probes.length} probed keys exist in "${bucket}"; those rows are metadata-only.`);
      }

      for (let i = 0; i < storagePaths.length; i += 100) {
        const chunk = storagePaths.slice(i, i + 100);
        const { data: removed, error } = await supabase.storage.from(bucket).remove(chunk);
        if (error) {
          fail(`storage removal failed for ${chunk.length} object(s): ${error.message}`);
        }
        /* remove() answers with the keys it actually deleted; the rest were
           metadata-only rows, so counting the request would overstate it */
        removedObjects += Array.isArray(removed) ? removed.length : 0;
      }
    }

    /* 2. rows, children first, in one transaction */
    await q(client, "begin");
    try {
      if (vaultIds.length) {
        const uuidOrder = [
          ["approvals", "vault_id"],
          ["verification_runs", "vault_id"],
          ["paypal_transactions", "vault_id"],
          ["milestones", "vault_id"],
          ["agreements", "vault_id"],
          ["vault_files", "vault_id"],
          ["ledger_events", "vault_id"],
          ["vault_members", "vault_id"],
        ];
        for (const [table, column] of uuidOrder) {
          await q(client, `delete from ${table} where ${column} = any($1::uuid[])`, [vaultIds]);
        }
        for (const table of BOOT_TABLES) {
          if (!(await tableExists(client, table))) continue;
          await q(client, `delete from ${table} where vault_id = any($1::text[])`, [vaultIds]);
        }
        await q(client, "delete from vaults where id = any($1::uuid[])", [vaultIds]);
      }

      if (userIds.length) {
        await q(client, "delete from auth_sessions where user_id = any($1::text[])", [
          userIds.map(String),
        ]);
        await q(client, "delete from users where id = any($1::uuid[])", [userIds]);
      }

      if (SUSPEND_BLOCKED && blocked.length) {
        const blockedIds = blocked.map((row) => row.id);
        await q(client, "update users set account_status = 'SUSPENDED' where id = any($1::uuid[])", [
          blockedIds,
        ]);
        await q(client, "update auth_sessions set revoked = true where user_id = any($1::text[])", [
          blockedIds.map(String),
        ]);
      }

      await q(client, "commit");
    } catch (err) {
      await q(client, "rollback");
      fail(`transaction rolled back, nothing deleted: ${err.message}`);
    }

    /* 3. credentials last: public.users.id references auth.users ON DELETE RESTRICT */
    let deletedAuth = 0;
    let absentAuth = 0;
    const authFailures = [];
    if (supabase) {
      for (const userId of userIds) {
        const { error } = await supabase.auth.admin.deleteUser(userId);
        if (!error) deletedAuth += 1;
        else if (/user not found/i.test(error.message || "")) absentAuth += 1;
        else authFailures.push(error.message);
      }
    }

    const { rows: after } = await q(
      client,
      `select (select count(*) from users where id = any($1::uuid[]))::int as profiles_left,
              (select count(*) from vaults where id = any($2::uuid[]))::int as vaults_left`,
      [userIds, vaultIds]
    );

    console.log("\napplied:");
    console.log(`  profiles removed     : ${userIds.length - after[0].profiles_left}`);
    console.log(`  vaults removed       : ${vaultIds.length - after[0].vaults_left}`);
    console.log(`  storage objects      : ${removedObjects}`);
    console.log(
      `  auth users deleted   : ${deletedAuth}/${userIds.length}` +
        (absentAuth ? ` (${absentAuth} had no auth row)` : "") +
        (supabase ? "" : " (no admin client configured)")
    );
    if (SUSPEND_BLOCKED && blocked.length) console.log(`  accounts suspended   : ${blocked.length}`);
    if (authFailures.length) {
      console.log(`  auth failures        : ${authFailures.length}`);
      for (const message of authFailures.slice(0, 5)) console.log(`      ${message}`);
    }
    if (after[0].profiles_left || after[0].vaults_left) {
      console.log(`  note: ${after[0].profiles_left} profile(s) and ${after[0].vaults_left} vault(s) remain — see the failures above`);
    }
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

main().catch((err) => {
  fail(err?.message || String(err));
});
