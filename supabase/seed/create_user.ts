/**
 * Developer-only account management for the AUTH project (skaps-inventory).
 * Public sign-up is disabled and the app can only invite staff, so this
 * script (service role) is the only way to create an admin or change a role.
 *
 * Create an account (confirmed immediately, no email is sent):
 *   pnpm tsx supabase/seed/create_user.ts create <email> <first> <last> --role staff|admin
 *     [--password <pw>]          use this password instead of a generated one
 *     [--env-prefix TEST_STAFF]  write <PREFIX>_EMAIL / <PREFIX>_PASSWORD to
 *                                .env.local instead of printing the password
 *
 * Change an existing account's role:
 *   pnpm tsx supabase/seed/create_user.ts set-role <email> staff|admin
 *
 * Delete an account (e.g. the test staff user):
 *   pnpm tsx supabase/seed/create_user.ts delete <email>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import * as dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ENV_PATH = path.join(process.cwd(), ".env.local");
dotenv.config({ path: ENV_PATH });

type Role = "admin" | "staff";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseRole(value: string | undefined): Role {
  if (value === "admin" || value === "staff") return value;
  return fail(`Role must be "admin" or "staff" (got ${JSON.stringify(value)}).`);
}

function takeFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) fail(`${name} needs a value.`);
  args.splice(i, 2);
  return value;
}

function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

/** Sets KEY=value lines in .env.local, replacing existing ones. */
function writeEnv(values: Record<string, string>) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, text);
}

async function findUserId(supabase: SupabaseClient, email: string): Promise<string> {
  const target = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Failed to list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) fail(`No account found for ${email}.`);
  }
}

async function setRole(supabase: SupabaseClient, userId: string, role: Role) {
  const { error } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });
  if (error) fail(`Failed to set role: ${error.message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const args = process.argv.slice(2);
  const command = args.shift();

  if (command === "create") {
    const role = parseRole(takeFlag(args, "--role"));
    const envPrefix = takeFlag(args, "--env-prefix");
    const password = takeFlag(args, "--password") ?? generatePassword();
    const [email, firstName, lastName] = args;
    if (!email || !firstName || !lastName) {
      fail("usage: create <email> <first> <last> --role staff|admin [--password pw] [--env-prefix NAME]");
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (error || !data.user) fail(`Failed to create user: ${error?.message ?? "unknown error"}`);

    // The auth trigger inserts a staff row; this sets the requested role.
    await setRole(supabase, data.user.id, role);

    console.log(`Created ${role} account ${email} (id: ${data.user.id}).`);
    if (envPrefix) {
      writeEnv({ [`${envPrefix}_EMAIL`]: email, [`${envPrefix}_PASSWORD`]: password });
      console.log(`Saved ${envPrefix}_EMAIL / ${envPrefix}_PASSWORD to .env.local.`);
    } else {
      console.log(`Password: ${password}`);
    }
    return;
  }

  if (command === "set-role") {
    const [email, roleArg] = args;
    if (!email) fail("usage: set-role <email> staff|admin");
    const role = parseRole(roleArg);
    const userId = await findUserId(supabase, email);
    await setRole(supabase, userId, role);
    console.log(`${email} is now ${role}.`);
    return;
  }

  if (command === "delete") {
    const [email] = args;
    if (!email) fail("usage: delete <email>");
    const userId = await findUserId(supabase, email);
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) fail(`Failed to delete user: ${error.message}`);
    console.log(`Deleted ${email}.`);
    return;
  }

  fail("usage: create_user.ts create|set-role|delete ... (see the header comment)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
