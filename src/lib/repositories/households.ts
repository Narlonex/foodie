import "server-only";
import { randomBytes } from "node:crypto";
import { query, queryOne, withTransaction } from "../db";

export interface HouseholdMember {
  userId: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
}

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  members: HouseholdMember[];
}

interface HouseholdRow {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string | Date;
  role: "owner" | "member";
}

interface MemberRow {
  user_id: string;
  email: string;
  role: "owner" | "member";
  joined_at: string | Date;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function inviteCode(): string {
  return randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
}

export async function getHousehold(userId: string): Promise<Household | null> {
  const row = await queryOne<HouseholdRow>(
    `SELECT h.id, h.name, h.owner_id, h.invite_code, h.created_at, m.role
       FROM household_members m
       JOIN households h ON h.id = m.household_id
      WHERE m.user_id = $1`,
    [userId],
  );
  if (!row) return null;
  const members = await query<MemberRow>(
    `SELECT m.user_id, u.email, m.role, m.joined_at
       FROM household_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.household_id = $1
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, lower(u.email)`,
    [row.id],
  );
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: iso(row.created_at),
    members: members.map((member) => ({
      userId: member.user_id,
      email: member.email,
      role: member.role,
      joinedAt: iso(member.joined_at),
    })),
  };
}

/** The current user plus everyone in the same household. */
export async function getVisibleUserIds(userId: string): Promise<string[]> {
  const membership = await queryOne<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1`,
    [userId],
  );
  if (!membership) return [userId];
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM household_members WHERE household_id = $1`,
    [membership.household_id],
  );
  return rows.length > 0 ? rows.map((row) => row.user_id) : [userId];
}

export async function createHousehold(
  userId: string,
  name: string,
): Promise<Household> {
  const existing = await queryOne<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1`,
    [userId],
  );
  if (existing) throw new Error("household.alreadyMember");

  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("household.nameRequired");

  let code = inviteCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const clash = await queryOne<{ id: string }>(
      `SELECT id FROM households WHERE invite_code = $1`,
      [code],
    );
    if (!clash) break;
    code = inviteCode();
  }

  const created = await withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO households (name, owner_id, invite_code)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [trimmed, userId, code],
    );
    const household = result.rows[0];
    if (!household) throw new Error("household.createFailed");
    await client.query(
      `INSERT INTO household_members (household_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [household.id, userId],
    );
    return household.id;
  });

  const household = await getHousehold(userId);
  if (!household || household.id !== created) {
    throw new Error("household.createFailed");
  }
  return household;
}

export async function joinHousehold(
  userId: string,
  rawCode: string,
): Promise<Household> {
  const existing = await queryOne<{ household_id: string }>(
    `SELECT household_id FROM household_members WHERE user_id = $1`,
    [userId],
  );
  if (existing) throw new Error("household.alreadyMember");

  const code = rawCode.trim().toUpperCase();
  if (code.length < 6) throw new Error("household.invalidCode");
  const household = await queryOne<{ id: string }>(
    `SELECT id FROM households WHERE upper(invite_code) = $1`,
    [code],
  );
  if (!household) throw new Error("household.invalidCode");

  try {
    await query(
      `INSERT INTO household_members (household_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [household.id, userId],
    );
  } catch {
    throw new Error("household.alreadyMember");
  }

  const joined = await getHousehold(userId);
  if (!joined) throw new Error("household.joinFailed");
  return joined;
}

export async function leaveHousehold(userId: string): Promise<void> {
  const row = await queryOne<{
    household_id: string;
    owner_id: string;
    role: "owner" | "member";
  }>(
    `SELECT m.household_id, h.owner_id, m.role
       FROM household_members m
       JOIN households h ON h.id = m.household_id
      WHERE m.user_id = $1`,
    [userId],
  );
  if (!row) throw new Error("household.notMember");

  if (row.role === "owner") {
    const count = await queryOne<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM household_members
        WHERE household_id = $1`,
      [row.household_id],
    );
    if (Number(count?.count ?? 0) > 1) {
      throw new Error("household.ownerHasMembers");
    }
    await query(`DELETE FROM households WHERE id = $1 AND owner_id = $2`, [
      row.household_id,
      userId,
    ]);
    return;
  }

  await query(
    `DELETE FROM household_members
      WHERE household_id = $1 AND user_id = $2`,
    [row.household_id, userId],
  );
}
