# Daily Tasks Template Setup

This guide explains how to set up the Daily Tasks Template for real Apple Notes checklists.

## Why a Template?

Apple Notes checklists (interactive checkboxes) cannot be created programmatically via plain text or AppleScript. The checklist format is proprietary and only created within the Notes app UI.

**Our solution:**
1. You create a template note with real checklists (one-time setup)
2. The system duplicates this template for each day (preserves checklist formatting)
3. The system updates marked sections with task content
4. Checklists remain interactive and functional

## Setup Instructions

### Step 1: Create the Folder

1. Open Apple Notes
2. Create a folder called **"Second Brain"** (if not already exists)

### Step 2: Create the Template Note

1. In the **Second Brain** folder, create a new note
2. Title it: **Daily Tasks Template**
3. Add the following structure:

---

**Copy this content into your note:**

```
📋 Daily Tasks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 MUST DO
──────────────────────────────
☐ [Template item - delete this]
<!-- MUST_DO_START -->
<!-- MUST_DO_END -->

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 FOLLOW-UPS
──────────────────────────────
☐ [Template item - delete this]
<!-- FOLLOW_UPS_START -->
<!-- FOLLOW_UPS_END -->

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏳ WAITING ON
──────────────────────────────
☐ [Template item - delete this]
<!-- WAITING_ON_START -->
<!-- WAITING_ON_END -->

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 NICE TO DO
──────────────────────────────
☐ [Template item - delete this]
<!-- NICE_TO_DO_START -->
<!-- NICE_TO_DO_END -->

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3: Convert to Real Checklists

1. For each section (MUST DO, FOLLOW-UPS, etc.):
   - Select the template item text "☐ [Template item - delete this]"
   - Click the **Checklist** button in the Notes toolbar (or press Cmd+Shift+L)
   - This converts it to a real interactive checkbox
   - Delete the "[Template item - delete this]" text (keep the checkbox)

2. **Keep the HTML comment markers!** These are invisible but essential:
   - `<!-- MUST_DO_START -->` and `<!-- MUST_DO_END -->`
   - `<!-- FOLLOW_UPS_START -->` and `<!-- FOLLOW_UPS_END -->`
   - etc.

### Step 4: Test the Template

1. The checkboxes should be interactive (click to toggle)
2. The comment markers should be invisible in Notes

## How It Works

When you run `npm run briefing` or the system creates daily tasks:

1. **Duplicates** the template → Creates "Daily Tasks - Jan 23, 2026"
2. **Preserves** all checklist formatting from the template
3. **Updates** content between the markers (your actual tasks for the day)
4. **Leaves** the interactive checkboxes intact above the markers

## Important Notes

- **Never delete the markers** - they're needed to find where to insert content
- **The template checkbox is a placeholder** - it shows where you can manually add more items
- **New items from the system appear as plain text** - you can convert them to checklists using Cmd+Shift+L
- **Running the command twice** is safe - it updates existing sections, doesn't duplicate

## Verification Test

After setup, run:
```bash
npm run briefing
```

Then in Notes:
1. Open the new "Daily Tasks - [date]" note
2. Click on a checkbox - it should toggle
3. If checkboxes work, your template is correctly set up!

## Troubleshooting

**"Template not found" error:**
- Make sure the note is titled exactly "Daily Tasks Template"
- Make sure it's in the "Second Brain" folder
- Make sure you're using iCloud account in Notes

**Checkboxes are just text (- [ ] or ☐):**
- The template wasn't set up with real checklists
- Re-create the template and use the Checklist button (Cmd+Shift+L)

**Markers not working:**
- Make sure the markers are exactly as shown (no extra spaces)
- The markers should be on their own lines
