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
cd ~/Documents/Sites/assistance
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

## 🔐 One-time setup: Full Disk Access (only for scheduled **SMS** capture)

What works on the 8am/6pm schedule **right now, with no setup:**
- ✅ Email triage (hourly)
- ✅ Email → Tasks capture

What needs one extra step:
- ⚠️ **SMS → Tasks** capture. macOS protects the Messages database (`chat.db`), so a *background* job can't read it until you grant Full Disk Access. (Running `npm run sms-triage` yourself in Terminal always works — this is only for the automatic schedule.)

To enable scheduled SMS capture, grant access **once**:

1. **System Settings → Privacy & Security → Full Disk Access**
2. Click **＋**, press **⌘⇧G**, type `/bin/bash`, press Enter, **Add** it
3. Toggle **/bin/bash** on (enter your password if prompted)
4. If scheduled SMS still fails after that, also add `/usr/bin/sqlite3` the same way.

You can verify with: `tail ~/Library/Logs/assistance/task-capture.log` — the SMS step should stop saying `authorization denied`.

## 🛠 Maintenance / redeploy

If the triage prompt or schedule changes:

```bash
bash scripts/deploy-triage-launchd.sh      # redeploy email triage job
bash scripts/deploy-task-capture-launchd.sh # redeploy task-capture job
```
