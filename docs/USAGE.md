# How to work this system

Your personal assistant has three moving parts — **email triage**, **task capture** (email + SMS → Google Tasks), and the **GTD board** where you actually work. This is the operator's manual.

## 🔄 What runs automatically (you do nothing)

| Job | Schedule | What it does |
|-----|----------|--------------|
| **Email triage** (`com.assistance.gmail-triage`) | hourly, 7am–9pm | Sorts new mail: newsletters/receipts/shipping/finance/notifications get labeled + archived out of the inbox; real action items stay. Keeps your inbox clean on its own. |
| **Task capture** (`com.assistance.task-capture`) | 8am & 6pm | Runs `tasks` + `sms-triage`: pulls genuine action items from recent email **and** texts into your Google Tasks 📥 Inbox. |

Both are macOS `launchd` jobs. Logs:
- `~/Library/Logs/assistance/gmail-triage.log`
- `~/Library/Logs/assistance/task-capture.log`

## ⌨️ Commands you can run yourself

From the project folder:

```bash
cd ~/Code/assistance
```

| Command | What it does |
|---|---|
| `npm run tasks` | Scan recent email → add action items to Google Tasks (📥 Inbox) |
| `npm run sms-triage` | Scan recent texts → add action items to Tasks. Days back: `npm run sms-triage -- 14` |
| `npm run sms-triage -- 7 --dry` | **Preview** SMS action items without adding them |
| `npm run tasks:list` | Print the GTD board in the terminal |
| `npm run process` | One-off email classify/archive pass |
| `npm run briefing` | Generate the daily briefing note |

`tasks` and `sms-triage` are **safe to re-run** — they dedupe, so no duplicate tasks.

## ✅ How to work the GTD board

Tasks live in **Google Tasks**. Open it in:
- **Gmail** → ☑️ icon, right sidebar
- **Google Calendar** → Tasks side panel
- **Phone** → Google Tasks app (or Tasks in Apple Calendar)

The five lists are a left-to-right flow:

```
📥 Inbox  →  🔥 Today  →  ⏭ Next  →  ⏳ Waiting On  →  💭 Someday
```

**Daily habit (5 min):** open 📥 **Inbox** and, for each item, either check it off or drag it to:
- **🔥 Today** — doing it today
- **⏭ Next** — soon, not today
- **⏳ Waiting On** — you replied/delegated; waiting on someone else
- **💭 Someday** — maybe later

Then work from **🔥 Today**. That's the whole system: the tools fill **Inbox**, you sort **Inbox**, you work **Today**.

## 🔧 If something breaks

Everything runs on one Google login. If commands fail with `invalid_grant` or "re-authenticate" (Google expires the token every few months):

```bash
gws auth login
```

Sign in as jermainewatkins@gmail.com — that single login powers email, tasks, calendar, and SMS capture.

## 🔐 One-time setup: Full Disk Access (already done)

Everything on the 8am/6pm schedule works:
- ✅ Email triage (hourly)
- ✅ Email → Tasks capture
- ✅ **SMS → Tasks** capture (full read, names, spam-filtered)

macOS protects the Messages database (`chat.db`) and Contacts, and the `npm→node→sqlite3`
chain can't open them even with permission. The scheduled runner works around this: `/bin/bash`
(which has Full Disk Access) snapshots both DBs to a temp copy with a **direct** `sqlite3 VACUUM
INTO`, then the triage reads the copies — no TCC barrier.

**This requires `/bin/bash` in Full Disk Access** (already granted). If you ever reinstall or it
breaks: System Settings → Privacy & Security → Full Disk Access → **＋** → ⌘⇧G → `/bin/bash` → Add → toggle on.

Verify any run with: `tail -40 ~/Library/Logs/assistance/task-capture.log`

## 🛠 Maintenance / redeploy

If the triage prompt or schedule changes:

```bash
bash scripts/deploy-triage-launchd.sh      # redeploy email triage job
bash scripts/deploy-task-capture-launchd.sh # redeploy task-capture job
```
