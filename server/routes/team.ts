import { Hono, type Context } from "hono";
import { userDataPayload } from "../data";
import type { AppEnv, UserRow } from "../env";
import { fail, parseId } from "../http";
import { dataWriteRoutes, type SubjectResolver } from "../punches";
import { canEditData, canSeeUsername, canViewData, capabilities, getUserById, listUsers, memberName } from "../users";

/**
 * The account behind `:id`, if the signed-in user may read its data. An account they may not read answers
 * 404 like an unknown id (existence is not revealed).
 */
async function visibleMember(c: Context<AppEnv>): Promise<UserRow | Response> {
  const id = parseId(c.req.param("id"));
  const member = id === null ? null : await getUserById(c.env.DB, id);
  if (!member || !canViewData(c.get("user"), member)) return fail(c, 404, "notFound");
  return member;
}

/** Writes on `:id`'s data: readable account (else 404) and `editOthers` on it, or `editOwn` for oneself (else 403). */
const memberSubject: SubjectResolver = async (c) => {
  const member = await visibleMember(c);
  if (member instanceof Response) return member;
  const user = c.get("user");
  if (canEditData(user, member)) return member;
  return fail(c, 403, member.id === user.id ? "editOwnForbidden" : "forbidden");
};

/**
 * Team routes, mounted under `/api/team` after `requireSession` (and after the presence routes, whose
 * `/team/presence` must not be read as a member id).
 */
export const teamRoutes = new Hono<AppEnv>()
  // Members. Owners and admins see every account with its username and state; a `user` (with viewTeam or
  // viewPresence) sees the active accounts only, by name (`memberName`: never a colleague's username).
  .get("/", async (c) => {
    const user = c.get("user");
    const caps = capabilities(user);
    if (!caps.viewTeam && !caps.viewPresence && !caps.manageUsers) return fail(c, 403, "forbidden");
    const users = await listUsers(c.env.DB);
    const members =
      user.role === "user"
        ? users
            .filter((u) => u.disabled_at === null)
            .map((u) => ({ id: u.id, displayName: memberName(user, u, c.get("locale")), role: u.role }))
        : users.map((u) => ({
            id: u.id,
            username: u.username,
            displayName: u.display_name,
            role: u.role,
            disabled: u.disabled_at !== null,
          }));
    return c.json({ members });
  })

  // Same payload as `GET /api/data`, for a readable account, plus whether the signed-in user may change it.
  // A plain `user` reading a colleague gets `user` without the username (see `canSeeUsername`).
  .get("/:id/data", async (c) => {
    const member = await visibleMember(c);
    if (member instanceof Response) return member;
    const viewer = c.get("user");
    const canEdit = canEditData(viewer, member);
    const payload = await userDataPayload(c.env, member);
    const user = canSeeUsername(viewer, member.id)
      ? payload.user
      : { id: member.id, displayName: memberName(viewer, member, c.get("locale")), role: member.role };
    return c.json({ ...payload, user, canEdit });
  })

  // Punches and day marks of `:id` (server/punches.ts), logged with the signed-in user as the actor.
  .route("/:id", dataWriteRoutes(memberSubject));
