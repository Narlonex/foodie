import "server-only";
import { randomBytes } from "node:crypto";
import { query, queryOne } from "../db";
import { listEntriesForRange, totalsForEntries } from "./diary";

export interface CoachClientSummary {
  clientId: string;
  email: string;
  since: string;
  loggedDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
}

export interface ClientCoach {
  coachId: string;
  email: string;
  since: string;
}

export interface CoachInvite {
  id: string;
  code: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function dateOnly(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function code(): string {
  return randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
}

export async function getClientCoach(
  clientId: string,
): Promise<ClientCoach | null> {
  const row = await queryOne<{
    coach_id: string;
    email: string;
    created_at: string | Date;
  }>(
    `SELECT c.coach_id, u.email, c.created_at
       FROM coach_clients c
       JOIN users u ON u.id = c.coach_id
      WHERE c.client_id = $1 AND c.status = 'active'
      ORDER BY c.created_at DESC
      LIMIT 1`,
    [clientId],
  );
  return row
    ? { coachId: row.coach_id, email: row.email, since: iso(row.created_at) }
    : null;
}

export async function listCoachClients(
  coachId: string,
): Promise<CoachClientSummary[]> {
  const rows = await query<{
    client_id: string;
    email: string;
    created_at: string | Date;
  }>(
    `SELECT c.client_id, u.email, c.created_at
       FROM coach_clients c
       JOIN users u ON u.id = c.client_id
      WHERE c.coach_id = $1 AND c.status = 'active'
      ORDER BY lower(u.email)`,
    [coachId],
  );

  const from = daysAgo(6);
  const to = daysAgo(0);
  return Promise.all(
    rows.map(async (row) => {
      const [entries, weight] = await Promise.all([
        listEntriesForRange(row.client_id, from, to),
        queryOne<{ date: string | Date; weight_kg: string | number }>(
          `SELECT date, weight_kg
             FROM weight_logs
            WHERE user_id = $1
            ORDER BY date DESC
            LIMIT 1`,
          [row.client_id],
        ),
      ]);

      const byDay = new Map<string, typeof entries>();
      for (const entry of entries) {
        const day = byDay.get(entry.date);
        if (day) day.push(entry);
        else byDay.set(entry.date, [entry]);
      }
      const daily = [...byDay.values()].map((day) => totalsForEntries(day));
      const kcal = daily
        .map((totals) => totals.nutrients.kcal.value)
        .filter((value): value is number => value !== null);
      const protein = daily
        .map((totals) => totals.nutrients.protein.value)
        .filter((value): value is number => value !== null);

      return {
        clientId: row.client_id,
        email: row.email,
        since: iso(row.created_at),
        loggedDays: byDay.size,
        avgKcal:
          kcal.length > 0
            ? kcal.reduce((sum, value) => sum + value, 0) / kcal.length
            : null,
        avgProtein:
          protein.length > 0
            ? protein.reduce((sum, value) => sum + value, 0) / protein.length
            : null,
        latestWeightKg: weight ? Number(weight.weight_kg) : null,
        latestWeightDate: weight ? dateOnly(weight.date) : null,
      };
    }),
  );
}

export async function listCoachInvites(
  coachId: string,
): Promise<CoachInvite[]> {
  const rows = await query<{
    id: string;
    code: string;
    expires_at: string | Date;
    used_at: string | Date | null;
    created_at: string | Date;
  }>(
    `SELECT id, code, expires_at, used_at, created_at
       FROM coach_invites
      WHERE coach_id = $1
      ORDER BY created_at DESC
      LIMIT 10`,
    [coachId],
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    expiresAt: iso(row.expires_at),
    usedAt: row.used_at ? iso(row.used_at) : null,
    createdAt: iso(row.created_at),
  }));
}

export async function createCoachInvite(coachId: string): Promise<CoachInvite> {
  let value = code();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const clash = await queryOne<{ id: string }>(
      `SELECT id FROM coach_invites WHERE code = $1`,
      [value],
    );
    if (!clash) break;
    value = code();
  }
  const row = await queryOne<{
    id: string;
    code: string;
    expires_at: string | Date;
    created_at: string | Date;
  }>(
    `INSERT INTO coach_invites (code, coach_id, expires_at)
     VALUES ($1, $2, now() + interval '14 days')
     RETURNING id, code, expires_at, created_at`,
    [value, coachId],
  );
  if (!row) throw new Error("coach.createFailed");
  return {
    id: row.id,
    code: row.code,
    expiresAt: iso(row.expires_at),
    usedAt: null,
    createdAt: iso(row.created_at),
  };
}

export async function acceptCoachInvite(
  clientId: string,
  rawCode: string,
): Promise<{ coachEmail: string }> {
  const value = rawCode.trim().toUpperCase();
  if (value.length < 6) throw new Error("coach.invalidCode");

  const invite = await queryOne<{ id: string; coach_id: string }>(
    `SELECT id, coach_id
       FROM coach_invites
      WHERE upper(code) = $1 AND used_at IS NULL AND expires_at > now()`,
    [value],
  );
  if (!invite) throw new Error("coach.invalidCode");
  if (invite.coach_id === clientId) throw new Error("coach.selfInvite");

  const coach = await queryOne<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [invite.coach_id],
  );
  if (!coach) throw new Error("coach.invalidCode");

  await query(
    `INSERT INTO coach_clients (coach_id, client_id, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (coach_id, client_id)
     DO UPDATE SET status = 'active', created_at = now()`,
    [invite.coach_id, clientId],
  );
  await query(
    `UPDATE coach_invites
        SET used_by = $1, used_at = now()
      WHERE id = $2 AND used_at IS NULL`,
    [clientId, invite.id],
  );
  return { coachEmail: coach.email };
}

export async function revokeCoachClient(
  coachId: string,
  clientId: string,
): Promise<void> {
  await query(
    `UPDATE coach_clients
        SET status = 'revoked'
      WHERE coach_id = $1 AND client_id = $2 AND status = 'active'`,
    [coachId, clientId],
  );
}

export async function leaveCoach(
  clientId: string,
  coachId: string,
): Promise<void> {
  await query(
    `UPDATE coach_clients
        SET status = 'revoked'
      WHERE coach_id = $1 AND client_id = $2 AND status = 'active'`,
    [coachId, clientId],
  );
}
