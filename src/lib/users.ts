import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { withLock, atomicWriteJson, safeReadJson } from "@/lib/storage/atomic-store";
import { log } from "@/lib/logger";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

export interface User {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: "admin" | "viewer";
  totpSecret: string | null;
  totpEnabled: boolean;
  /** Pending enrollment secret — only promoted to totpSecret after verify (H2). */
  pendingTotpSecret?: string | null;
  /** Last-used TOTP counter value, to prevent replay within the ±1 window (M3). */
  lastTotpCounter?: number | null;
  createdAt: number;
  lastLogin: number | null;
}

interface Session {
  token: string;
  userId: string;
  username: string;
  role: string;
  createdAt: number;
  expiresAt: number;
  pending2fa: boolean;
}

interface UsersFile {
  users: User[];
}

interface SessionsFile {
  sessions: Session[];
}

export async function loadUsers(): Promise<UsersFile> {
  return safeReadJson<UsersFile>(USERS_FILE, { users: [] });
}

export async function saveUsers(data: UsersFile): Promise<void> {
  await atomicWriteJson(USERS_FILE, data);
}

async function loadSessions(): Promise<SessionsFile> {
  return safeReadJson<SessionsFile>(SESSIONS_FILE, { sessions: [] });
}

// L1: salt was dead code — bcrypt embeds the salt in the hash itself.
export function hashPassword(password: string): { hash: string } {
  const hash = bcrypt.hashSync(password, 12);
  return { hash };
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function findUser(username: string): Promise<User | undefined> {
  const { users } = await loadUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export async function createUser(
  username: string,
  password: string,
  role: "admin" | "viewer" = "viewer"
): Promise<User> {
  return withLock(USERS_FILE, async () => {
    const data = await safeReadJson<UsersFile>(USERS_FILE, { users: [] });

    if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Gebruiker bestaat al");
    }

    const { hash } = hashPassword(password);
    const user: User = {
      id: crypto.randomUUID(),
      username,
      email: null,
      passwordHash: hash,
      role,
      totpSecret: null,
      totpEnabled: false,
      createdAt: Date.now(),
      lastLogin: null,
    };

    data.users.push(user);
    await atomicWriteJson(USERS_FILE, data);
    return user;
  });
}

export async function updateUser(id: string, updates: Partial<Omit<User, "id">>): Promise<User | null> {
  return withLock(USERS_FILE, async () => {
    const data = await safeReadJson<UsersFile>(USERS_FILE, { users: [] });
    const idx = data.users.findIndex((u) => u.id === id);
    const existing = idx === -1 ? undefined : data.users[idx];
    if (!existing) return null;

    const merged: User = { ...existing, ...updates };
    data.users[idx] = merged;
    await atomicWriteJson(USERS_FILE, data);
    return merged;
  });
}

export async function deleteUser(id: string): Promise<boolean> {
  const deleted = await withLock(USERS_FILE, async () => {
    const data = await safeReadJson<UsersFile>(USERS_FILE, { users: [] });
    const before = data.users.length;
    data.users = data.users.filter((u) => u.id !== id);
    if (data.users.length === before) return false;
    await atomicWriteJson(USERS_FILE, data);
    return true;
  });

  if (!deleted) return false;

  await withLock(SESSIONS_FILE, async () => {
    const sessions = await safeReadJson<SessionsFile>(SESSIONS_FILE, { sessions: [] });
    sessions.sessions = sessions.sessions.filter((s) => s.userId !== id);
    await atomicWriteJson(SESSIONS_FILE, sessions);
  });

  return true;
}

export async function createSession(
  userId: string,
  username: string,
  role: string,
  pending2fa = false
): Promise<string> {
  return withLock(SESSIONS_FILE, async () => {
    const sessions = await safeReadJson<SessionsFile>(SESSIONS_FILE, { sessions: [] });
    const now = Date.now();

    sessions.sessions = sessions.sessions.filter((s) => s.expiresAt > now);

    const token = crypto.randomBytes(48).toString("hex");
    // M4: pending-2FA sessions expire in 10 min — full sessions last 30 days.
    const ttlMs = pending2fa ? 10 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    sessions.sessions.push({
      token,
      userId,
      username,
      role,
      createdAt: now,
      expiresAt: now + ttlMs,
      pending2fa,
    });

    await atomicWriteJson(SESSIONS_FILE, sessions);
    return token;
  });
}

export async function validateSession(token: string): Promise<Session | null> {
  if (!token) return null;
  const { sessions } = await loadSessions();
  const session = sessions.find((s) => s.token === token && s.expiresAt > Date.now());
  if (!session) return null;
  if (session.pending2fa) return null;
  return session;
}

export async function getSession(token: string): Promise<Session | null> {
  if (!token) return null;
  const { sessions } = await loadSessions();
  return sessions.find((s) => s.token === token && s.expiresAt > Date.now()) || null;
}

/** L2: renamed from upgradSession. Promotes a pending-2FA session to a full session. */
export async function upgradeSession(token: string): Promise<boolean> {
  return withLock(SESSIONS_FILE, async () => {
    const sessions = await safeReadJson<SessionsFile>(SESSIONS_FILE, { sessions: [] });
    const idx = sessions.sessions.findIndex((s) => s.token === token);
    const sess = idx === -1 ? undefined : sessions.sessions[idx];
    if (!sess) return false;
    sess.pending2fa = false;
    // Now it's a real session — extend expiry to the full 30 days.
    sess.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await atomicWriteJson(SESSIONS_FILE, sessions);
    return true;
  });
}
/** @deprecated use upgradeSession. Kept for one release to avoid import breakage. */
export const upgradSession = upgradeSession;

export async function deleteSession(token: string): Promise<void> {
  await withLock(SESSIONS_FILE, async () => {
    const sessions = await safeReadJson<SessionsFile>(SESSIONS_FILE, { sessions: [] });
    sessions.sessions = sessions.sessions.filter((s) => s.token !== token);
    await atomicWriteJson(SESSIONS_FILE, sessions);
  });
}

export async function ensureDefaultAdmin(): Promise<void> {
  const { users } = await loadUsers();
  if (users.length > 0) return;

  const defaultPassword = process.env.APP_PASSWORD;
  if (!defaultPassword || defaultPassword.length < 8) {
    log.fatal(
      { scope: "auth" },
      "geen admin aangemaakt. Stel APP_PASSWORD in (min 8 chars) voordat je de app de eerste keer start.",
    );
    return;
  }
  await createUser("admin", defaultPassword, "admin");
  log.info({ scope: "auth", username: "admin" }, "default admin aangemaakt via APP_PASSWORD");
}
