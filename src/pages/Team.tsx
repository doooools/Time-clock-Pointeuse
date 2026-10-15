import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatClock } from "../../shared/time";
import { Checkbox, cx } from "../components/Widgets";
import { useT, type TKey } from "../i18n";
import {
  api,
  userLabel,
  type AdminUser,
  type Permissions,
  type PresenceEntry,
  type Role,
  type TeamMember,
  type UserPatch,
} from "../lib/api";
import { useMe } from "../lib/me";
import { useTz } from "../lib/store";
import { useToast } from "../lib/toast";

/** One line of the member list, whether it comes from `/api/team` or from the admin list. */
type Row = {
  id: number;
  username?: string;
  displayName: string | null;
  role: Role;
  disabled: boolean;
  locked: boolean;
  permissions?: Permissions;
};

const ROLE_LABEL: Record<Role, TKey> = { owner: "team.roleOwner", admin: "team.roleAdmin", user: "team.roleUser" };

/** Credentials shown once, right after an account is created or a secret is renewed. */
type Secret = { name: string; username?: string; password?: string; webhookToken?: string };

const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random password generated in the browser (no ambiguous characters). */
function generatePassword(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const webhookUrl = (token: string) => `${window.location.origin}/api/webhook/punch?token=${token}`;

function toRow(m: TeamMember | AdminUser): Row {
  const admin = m as Partial<AdminUser>;
  return {
    id: m.id,
    username: m.username,
    displayName: m.displayName,
    role: m.role,
    disabled: admin.disabled ?? m.disabled ?? false,
    locked: admin.locked ?? false,
    permissions: admin.permissions,
  };
}

function Err({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="text-[13px] text-red-text">
      {children}
    </div>
  );
}

function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="lbl">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "warn" | "role" }) {
  return (
    <span
      className={cx(
        "px-1.5 py-0.5 font-label text-[13px] uppercase",
        tone === "role" && "bg-yellow text-onpaper",
        tone === "warn" && "bg-red text-white",
        tone === "plain" && "shadow-[inset_0_0_0_1px_var(--color-paper-dim)] text-paper-muted",
      )}
    >
      {children}
    </span>
  );
}

/* ─────────────── Presence ─────────────── */

function Presence() {
  const t = useT();
  const tz = useTz();
  const [entries, setEntries] = useState<PresenceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries((await api.presence()).members);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const nobodyIn = entries !== null && !entries.some((m) => m.present);

  return (
    <Section title={t("team.presenceTitle")} aside={<span className="text-[13px] text-paper-dim">{t("team.presenceRefreshed")}</span>}>
      {error && <Err>{error}</Err>}
      {entries && (
        <>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((m) => (
              <li key={m.id} className={cx("flex items-center gap-3 border-2 px-3 py-2.5", m.present ? "border-yellow" : "border-line")}>
                <span
                  aria-hidden
                  className={cx("size-3 shrink-0 rounded-full", m.present ? "bg-yellow" : "bg-grey")}
                />
                <div className="min-w-0 flex-1">
                  <div className={cx("truncate font-label text-lg", !m.present && "text-paper-muted")}>{m.displayName}</div>
                  <div className="text-[13px] text-paper-muted">
                    {m.present && m.since !== null
                      ? t("team.presentSince", { time: formatClock(m.since, tz) })
                      : m.lastPunch !== null
                        ? `${t("team.absent")} · ${t("team.lastPunch", { time: formatClock(m.lastPunch, tz) })}`
                        : `${t("team.absent")} · ${t("team.noPunchToday")}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {nobodyIn && <p className="text-paper-soft">{t("team.presenceNobody")}</p>}
        </>
      )}
    </Section>
  );
}

/* ─────────────── Secrets shown once ─────────────── */

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] uppercase text-onpaper-muted">{label}</span>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all bg-white px-2 py-1.5 text-[14px] text-onpaper">{value}</code>
        <button
          type="button"
          className="btn-ink-outline px-3 text-[15px]"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(value)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => {});
          }}
        >
          {copied ? t("team.copied") : t("team.copy")}
        </button>
      </div>
    </div>
  );
}

function SecretCard({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const t = useT();
  return (
    <div className="paper-card flex flex-col gap-3 px-5 py-4" role="region" aria-label={t("team.secretTitle")}>
      <h3 className="font-display text-3xl leading-none">{t("team.secretTitle")}</h3>
      <p className="text-onpaper-muted">{t("team.secretWarning", { name: secret.name })}</p>
      {secret.username && <CopyField label={t("team.secretUsername")} value={secret.username} />}
      {secret.password && <CopyField label={t("team.secretPassword")} value={secret.password} />}
      {secret.webhookToken && <CopyField label={t("team.secretWebhook")} value={webhookUrl(secret.webhookToken)} />}
      <button type="button" className="btn-ink self-start px-4 py-2" onClick={onClose}>
        {t("team.dismissSecret")}
      </button>
    </div>
  );
}

/* ─────────────── Permissions + role fields (create and edit) ─────────────── */

function PermissionFields({ role, value, onChange }: { role: Role; value: Permissions; onChange: (p: Permissions) => void }) {
  const t = useT();
  if (role !== "user") return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="lbl mb-1">{t("team.permissions")}</legend>
      <Checkbox checked={value.editOwn} onChange={(v) => onChange({ ...value, editOwn: v })}>
        {t("team.permEditOwn")}
      </Checkbox>
      <Checkbox checked={value.viewPresence} onChange={(v) => onChange({ ...value, viewPresence: v })}>
        {t("team.permViewPresence")}
      </Checkbox>
      <Checkbox checked={value.viewTeam} onChange={(v) => onChange({ ...value, viewTeam: v })}>
        {t("team.permViewTeam")}
      </Checkbox>
    </fieldset>
  );
}

function RoleSelect({ id, value, onChange }: { id: string; value: Role; onChange: (r: Role) => void }) {
  const t = useT();
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as Role)}>
      {(["user", "admin", "owner"] as Role[]).map((r) => (
        <option key={r} value={r}>
          {t(ROLE_LABEL[r])}
        </option>
      ))}
    </select>
  );
}

const DEFAULT_PERMISSIONS: Permissions = { editOwn: true, viewPresence: false, viewTeam: false };

/* ─────────────── Create an account ─────────────── */

function CreateForm({ canPickRole, onDone, onCancel }: { canPickRole: boolean; onDone: (s: Secret) => void; onCancel: () => void }) {
  const t = useT();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    const password = generatePassword();
    setBusy(true);
    setError(null);
    try {
      const r = await api.createUser({
        username: username.trim(),
        password,
        displayName: displayName.trim() || null,
        role,
        ...(role === "user" ? { permissions } : {}),
      });
      const name = userLabel(r.user);
      toast(t("team.created", { name }));
      onDone({ name, username: r.user.username, password, webhookToken: r.webhookToken });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-2 border-paper px-5 py-4">
      <h3 className="font-display text-3xl leading-none">{t("team.createTitle")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-username" className="lbl">
            {t("team.username")}
          </label>
          <input
            id="new-username"
            className="field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoFocus
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-display" className="lbl">
            {t("team.displayName")}
          </label>
          <input id="new-display" className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
        </div>
      </div>
      {canPickRole && (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="new-role" className="lbl">
            {t("team.role")}
          </label>
          <RoleSelect id="new-role" value={role} onChange={setRole} />
          <span className="text-[13px] text-paper-dim">{t("team.roleHelpOwner")}</span>
        </div>
      )}
      <PermissionFields role={role} value={permissions} onChange={setPermissions} />
      {error && <Err>{error}</Err>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary px-4 py-2" disabled={busy || !username.trim()}>
          {t("team.create")}
        </button>
        <button type="button" className="btn-secondary px-4 py-2" onClick={onCancel}>
          {t("team.cancel")}
        </button>
      </div>
    </form>
  );
}

/* ─────────────── Edit / administer one member ─────────────── */

function MemberEditor({
  row,
  isMe,
  canPickRole,
  onChanged,
  onSecret,
}: {
  row: Row;
  isMe: boolean;
  canPickRole: boolean;
  onChanged: () => Promise<void>;
  onSecret: (s: Secret) => void;
}) {
  const t = useT();
  const toast = useToast();
  const name = userLabel(row);
  const [displayName, setDisplayName] = useState(row.displayName ?? "");
  const [role, setRole] = useState<Role>(row.role);
  const [permissions, setPermissions] = useState<Permissions>(row.permissions ?? DEFAULT_PERMISSIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");

  /** Runs an account action, refreshes the list and shows the server error as is when it fails. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const patchOf = (): UserPatch => {
    const patch: UserPatch = {};
    if (displayName.trim() !== (row.displayName ?? "")) patch.displayName = displayName.trim() || null;
    if (canPickRole && role !== row.role) patch.role = role;
    const before = row.permissions ?? DEFAULT_PERMISSIONS;
    if (role === "user" && JSON.stringify(permissions) !== JSON.stringify(before)) patch.permissions = permissions;
    return patch;
  };
  const patch = patchOf();
  const dirty = Object.keys(patch).length > 0;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    void run(async () => {
      await api.updateUser(row.id, patch);
      toast(t("team.saved"));
    });
  };

  const resetPassword = () =>
    run(async () => {
      const password = generatePassword();
      await api.updateUser(row.id, { password });
      toast(t("team.resetPasswordDone", { name }));
      onSecret({ name, username: row.username, password });
    });

  const regenerateToken = () =>
    run(async () => {
      const r = await api.regenerateUserToken(row.id);
      setConfirmToken(false);
      toast(t("team.regenTokenDone", { name }));
      onSecret({ name, webhookToken: r.webhookToken });
    });

  const toggleDisabled = () =>
    run(async () => {
      await api.updateUser(row.id, { disabled: !row.disabled });
      toast(t(row.disabled ? "team.enableDone" : "team.disableDone", { name }));
    });

  const unlock = () =>
    run(async () => {
      await api.updateUser(row.id, { unlock: true });
      toast(t("team.unlockDone", { name }));
    });

  const remove = () =>
    run(async () => {
      await api.deleteUser(row.id);
      toast(t("team.deleted", { name }));
    });

  const confirmWord = row.username ?? name;

  return (
    <div className="flex flex-col gap-4 border-t-2 border-line bg-shade px-4 py-4">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`dn-${row.id}`} className="lbl">
              {t("team.displayName")}
            </label>
            <input id={`dn-${row.id}`} className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
          </div>
          {canPickRole && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`role-${row.id}`} className="lbl">
                {t("team.role")}
              </label>
              <RoleSelect id={`role-${row.id}`} value={role} onChange={setRole} />
            </div>
          )}
        </div>
        <PermissionFields role={role} value={permissions} onChange={setPermissions} />
        <div>
          <button type="submit" className="btn-primary px-4 py-2" disabled={busy || !dirty}>
            {t("team.save")}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5 text-[15px]" disabled={busy} onClick={() => void resetPassword()}>
          {t("team.resetPassword")}
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5 text-[15px]" disabled={busy} onClick={() => setConfirmToken(true)}>
          {t("team.regenToken")}
        </button>
        {row.locked && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-[15px]" disabled={busy} onClick={() => void unlock()}>
            {t("team.unlock")}
          </button>
        )}
        {!isMe && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-[15px]" disabled={busy} onClick={() => void toggleDisabled()}>
            {row.disabled ? t("team.enable") : t("team.disable")}
          </button>
        )}
        {!isMe && (
          <button type="button" className="btn-danger px-3 py-1.5 text-[15px]" disabled={busy} onClick={() => setConfirmDelete(true)}>
            {t("team.delete")}
          </button>
        )}
      </div>

      {confirmToken && (
        <div className="flex flex-wrap items-center gap-2 text-paper-soft">
          <span>{t("team.regenTokenConfirm")}</span>
          <button type="button" className="btn-primary px-3 py-1.5 text-[15px]" disabled={busy} onClick={() => void regenerateToken()}>
            {t("team.regenToken")}
          </button>
          <button type="button" className="btn-secondary px-3 py-1.5 text-[15px]" onClick={() => setConfirmToken(false)}>
            {t("team.cancel")}
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="flex flex-col gap-2 border-2 border-red-text px-3 py-3">
          <label htmlFor={`del-${row.id}`} className="text-paper-soft">
            {t("team.deleteConfirmText", { username: confirmWord })}
          </label>
          <input id={`del-${row.id}`} className="field max-w-xs" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-danger px-3 py-1.5 text-[15px]"
              disabled={busy || typed.trim().toLowerCase() !== confirmWord.toLowerCase()}
              onClick={() => void remove()}
            >
              {t("team.deleteConfirm")}
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-[15px]"
              onClick={() => {
                setConfirmDelete(false);
                setTyped("");
              }}
            >
              {t("team.cancel")}
            </button>
          </div>
        </div>
      )}

      {error && <Err>{error}</Err>}
    </div>
  );
}

/* ─────────────── Page ─────────────── */

export default function Team() {
  const t = useT();
  const me = useMe();
  const caps = me.capabilities;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const list = caps.manageUsers ? (await api.adminUsers()).users : (await api.team()).members;
      setRows(list.map(toRow));
      setError(null);
    } catch (e) {
      setError(t("team.loadError", { message: errorText(e) }));
    }
  }, [caps.manageUsers, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** An admin only manages `user` accounts; a superadmin manages everyone. */
  const canManage = (r: Row) => caps.manageAdmins || (caps.manageUsers && r.role === "user");
  const activeCount = rows?.filter((r) => !r.disabled).length ?? 0;
  const alone = caps.manageUsers && rows !== null && activeCount <= 1 && rows.length <= 1;

  return (
    <div className="flex flex-col gap-8 pb-10">
      <h1 className="page-title self-start">{t("team.title")}</h1>

      {error && <Err>{error}</Err>}
      {secret && <SecretCard secret={secret} onClose={() => setSecret(null)} />}

      {caps.viewPresence && <Presence />}

      {alone && !creating && (
        <div className="flex flex-col items-start gap-3 border-2 border-dashed border-paper-dim px-5 py-6">
          <h2 className="font-display text-4xl leading-none text-yellow">{t("team.aloneTitle")}</h2>
          <p className="max-w-xl text-pretty text-paper-soft">{t("team.aloneText")}</p>
          <button type="button" className="btn-primary px-4 py-2" onClick={() => setCreating(true)}>
            {t("team.addPerson")}
          </button>
        </div>
      )}

      {creating && (
        <CreateForm
          canPickRole={caps.manageAdmins}
          onCancel={() => setCreating(false)}
          onDone={(s) => {
            setCreating(false);
            setSecret(s);
            void load();
          }}
        />
      )}

      <Section
        title={t("team.membersTitle")}
        aside={
          caps.manageUsers && !creating && !alone ? (
            <button type="button" className="btn-primary px-3 py-1.5 text-[15px]" onClick={() => setCreating(true)}>
              {t("team.addPerson")}
            </button>
          ) : undefined
        }
      >
        {rows === null && !error && <p className="text-paper-muted">{t("team.loading")}</p>}
        <ul className="flex flex-col gap-2">
          {rows?.map((r) => {
            const isMe = r.id === me.id;
            const manage = canManage(r);
            const isOpen = open === r.id;
            return (
              <li key={r.id} className={cx("border-2", r.disabled ? "border-line text-paper-muted" : "border-paper")}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-label text-xl">{userLabel(r)}</span>
                      {isMe && <Badge>{t("team.you")}</Badge>}
                      <Badge tone="role">{t(ROLE_LABEL[r.role])}</Badge>
                      {r.disabled && <Badge tone="warn">{t("team.statusDisabled")}</Badge>}
                      {r.locked && <Badge tone="warn">{t("team.statusLocked")}</Badge>}
                    </div>
                    {r.username && r.displayName && <div className="text-[13px] text-paper-muted">{r.username}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {caps.viewTeam && !isMe && !r.disabled && (
                      <Link to={`/team/${r.id}`} className="btn-secondary px-3 py-1.5 text-[15px]">
                        {t("team.viewHours")}
                      </Link>
                    )}
                    {manage && (
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5 text-[15px]"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : r.id)}
                      >
                        {isOpen ? t("team.close") : t("team.manage")}
                      </button>
                    )}
                  </div>
                </div>
                {manage && isOpen && (
                  <MemberEditor
                    key={`${r.id}-${r.role}-${r.displayName}`}
                    row={r}
                    isMe={isMe}
                    canPickRole={caps.manageAdmins}
                    onChanged={load}
                    onSecret={setSecret}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <aside className="flex max-w-3xl flex-col gap-1.5 border-l-4 border-paper-dim pl-4 text-[14px] text-paper-muted">
        <div className="lbl">{t("team.privacyTitle")}</div>
        <p>{t("team.privacyAdmins")}</p>
        <p>{t("team.privacyUsers")}</p>
        <p>{t("team.privacyJournal")}</p>
      </aside>
    </div>
  );
}
