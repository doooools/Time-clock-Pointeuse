# Team management

A guide for the person who runs Opointeuse for a team: who can do what, how to add people, what each person sees,
how corrections are recorded, and what to tell your employees. If you use Opointeuse alone, you can skip all of it:
with a single account none of the team screens appears.

The same rights are enforced by the server whatever the client (web app, API, command line); the interface only hides
what the server would refuse. Technical reference: [api.md](api.md); command line: [users.md](users.md).

## Roles and rights

Three roles:

| Role | In the app | Who |
|---|---|---|
| **Superadmin** (`owner`) | everything | the person who installed it; the **first account** created is always one |
| **Admin** (`admin`) | manages and corrects the `user` accounts | a manager, an office manager |
| **User** (`user`) | own hours; extra rights are switched on one by one | an employee |

A `user` account has three rights. Owners and admins have all of them, implicitly.

| Right | Default | Effect |
|---|---|---|
| Edit own hours (`edit-own`) | **on** | add, edit and delete one's own punches and day marks. Off: the person punches with the badge or phone but cannot change anything afterwards. |
| Sees who is in (`view-presence`) | **off** | the presence board of the Team page |
| Views colleagues' hours (`view-team`) | **off** | consult the hours, history and stats of colleagues, **read only** |

What each role can do:

| | Superadmin | Admin | User |
|---|---|---|---|
| Appoint or remove superadmins and admins, manage their accounts | ✓ | | |
| Create, edit, disable, delete `user` accounts; passwords, webhook tokens, unlock, rights | ✓ | ✓ | |
| Correct the hours of another account | ✓ (all) | ✓ (`user` accounts only) | |
| Consult the hours of others | ✓ | ✓ | with `view-team` |
| See who is in | ✓ | ✓ | with `view-presence` |
| Edit own hours | ✓ | ✓ | with `edit-own` |

Guards:

- There is always at least **one active superadmin**: the last one cannot be demoted, disabled or deleted. A
  superadmin can step down once another active superadmin exists.
- An admin cannot create, modify, disable or delete a superadmin, another admin, or their own account (that is the
  superadmin's job).
- Disabled accounts cannot sign in or punch; their history is kept, and they disappear from what a `user` sees.
- Changing someone's rights applies at their next request; no need to sign them out.

## Adding people

**From the web app** (superadmin or admin): open **Team**, then *Add a person*. Fill the username, display name, role
(only a superadmin can pick admin or superadmin) and rights. The app generates a password and shows it **once**,
together with the person's webhook URL: hand both over privately. Each person then sets their language, time zone and
holiday region in Settings and configures their phone or reader ([integrations](integrations/README.md)).

**From the command line**:

```bash
npm run user -- add chloe --name "Chloé Martin" --generate-password     # Docker/D1: see users.md
npm run user -- perm chloe --view-presence on
npm run user -- role bruno admin
```

On the Team page, each account has *manage*: change the name, role and rights; reset the password; regenerate the
webhook token (the old one stops working at once: update the phone or reader); unlock an account after too many wrong
passwords; disable or re-enable; delete (permanent, it removes all the punches; you must retype the username).

A shared wall reader can use one account's token, but then every punch belongs to that account; one account per person
with its own token is the intended setup ([integrations/shared-badge-reader.md](integrations/shared-badge-reader.md)).

## The Team page

The **Team** link appears in the navigation for anyone who may use it (superadmin and admin, and users with
`view-team` or `view-presence`; a superadmin who is alone sees it too, to add the first person).

- **Who is in**: for each active account, present or not, since when, and the last punch (only if it is from today or yesterday). "Today" is cut in each
  person's own time zone. Refreshes by itself every minute. Needs `view-presence` (or admin).
- **Members**: the list of accounts. With `view-team`, a member opens their hours: *Today*, *History* and *Stats* pages,
  with a banner "You are viewing X's hours". For a `user` this is **read only**, and it includes the hours of admins and superadmins (not only other users); a colleague without a display name appears as "Member #id", and the login name is shown only to managers; an owner or admin can correct
  (admins: `user` accounts only), and the banner says so.
- **Account actions**: described above, for those who may manage.
- A privacy note reminds everyone who sees what.

## Change log and notifications

Trust in a shared time clock depends on transparency, so corrections are never silent.

**The change log** (the *Log* page, also linked from Settings and from a member's banner) records, with date, author
and before/after values:

- every addition, edit, deletion and restoration of a **punch**, and every **day mark** set or cleared, whoever does it
  (a person on their own hours, an admin on someone else's);
- every **import** (how many punches inserted and skipped, over which period);
- every account administration action: creation, rights/role/name/settings change, password reset (the password itself
  is never stored), token regeneration, unlock, disable, deletion.

What is **not** logged: the punches made by the webhook (normal flow), and the settings a person changes on their own
account. Changes made from the command line appear with source "command line" and no author.

Who reads it: everyone sees the entries about **their own** hours; owners and admins see everything; a `user` with
`view-team` also sees the hour corrections (not the account administration) of their active colleagues.

**Notifications** make sure the person concerned finds out:

| Who changes | Who is notified |
|---|---|
| an admin or superadmin changes **someone else's** hours (or the command line does) | the person whose hours changed |
| a `user` changes **their own** hours | every active superadmin and admin |
| an admin changes their own hours | every active superadmin |
| a superadmin changes their own hours | nobody |
| an admin or superadmin resets someone's **password**, changes their **role** or **rights**, or regenerates their **webhook token** | that person (for the token: "update your phone or badge reader") |

A notification is a window that opens in the app with the list of changes, grouped by author, each with a link to the
day. It is **persistent**: it stays across sessions and devices and closes only with the *Got it* ("J'ai compris" in French) button
(not with Escape or a click outside), which acknowledges everything displayed. New ones are looked for on load, every
minute and when the tab regains focus. There is no approval workflow: a correction applies immediately and is
recorded. The log and the notifications are **never purged automatically**: they grow with use, so plan to archive or clean them yourself if the database gets large. When an author's account has been deleted the log says "deleted account"; command-line changes say "command line".

## Privacy

> This section is practical guidance, **not legal advice**. Rules on employee time recording and personal data depend
> on your country and your situation (in the EU, the GDPR and national labour law); check them, and with your data
> protection contact or a lawyer if in doubt.

Time records are personal data, and when they are kept by an employer they are tied to an employment relationship.
Some good practices that the application is built to support:

- **Inform the people concerned** before you start: what is recorded (punch times, corrections, who changed what),
  why, who can see it, how long it is kept, and who to ask for access or correction. The change log and the
  notifications are part of what you tell them: any correction by someone else is visible to the person.
- **Visibility is off by default**: a new `user` account sees only their own hours. Presence and colleagues' hours are
  separate rights; switch them on only where there is a reason (for example presence for a receptionist).
- **Limit access to those who need it**: few superadmins, admins only for the people they manage. An admin sees the
  hours and presence of the whole team and can correct the `user` accounts: choose them accordingly.
- **Keep the change log**: it is your evidence of who changed what, and the employee's guarantee against silent edits.
  Do not give anyone direct database access that would bypass it.
- **Keep the data where you decide**: you host the instance, so you choose the country, the backups and the retention.
  Delete the accounts (and their data) of people who have left once the legal retention period has passed
  (`disable` first to keep the history, `remove` to erase it).
- **Secure the instance**: HTTPS, a strong `SESSION_SECRET`, per-IP rate limiting on login, backups
  ([configuration.md](configuration.md#security-settings-and-limits), [deploy-node.md](deploy-node.md)).
- **The punch location is not recorded**: only the time and the account; the webhook does not store an IP address or a
  position.

## Trying it

`npm run user -- demo-team` creates four fake accounts (`alice` superadmin, `bruno` admin, `chloe` who sees presence,
`david` who cannot edit) with three months of data and one pending notification. See [users.md](users.md#demo-team-options).
