# End-to-end smoke test prompt

A single agent prompt that exercises **every tool** in the plugin — Gmail (send, list, read, label), Calendar (create, list, read), Docs (create, edit, read), Sheets (create, append, read, metadata), Slides (create, read), Drive (list, metadata). Paste it into a fresh agent conversation after running the OAuth setup.

## When to use

- After installing the plugin for the first time — confirms every API works end-to-end against your OAuth token.
- After bumping the OAuth scopes — verifies all scopes were granted.
- After bumping the agent's model — confirms the new model can both call AND summarize multi-step tool sequences.
- When troubleshooting a specific tool — narrows down which step fails.

## How to use

1. Open a **fresh** agent chat (don't append to an existing conversation — older agent context can bias tool selection).
2. Replace `<YOUR_EMAIL>` with an email address you control (mail goes there in step 1).
3. Paste the whole prompt at once.
4. Watch the agent execute. Verify each step either by reading the agent's response or by checking the artifact in Google (Doc/Sheet/Slides URLs are returned).
5. Run the cleanup prompt below to remove the test artifacts.

## The prompt

```text
Run a complete smoke test of your Google Workspace tools. Do every step IN ORDER, call the actual tool (don't narrate), and report each result with the specific id/URL/value the tool returned.

GMAIL
1. Send an email to <YOUR_EMAIL> with subject "Workspace smoke test <timestamp>" and a one-line body. Report the message id.
2. Check the Gmail inbox for messages from the last day. Report how many came back.
3. Read the full content of the most recent message in the inbox. Report the From, Subject, and the first line of the body.
4. Star that message (add STARRED label). Report the final list of labels.

CALENDAR
5. Create a calendar event titled "Workspace smoke test event" starting 2 hours from now and ending 30 minutes after that. Report the event id and the htmlLink.
6. List upcoming events on the primary calendar from the last hour onward. Report how many events came back and the summary of each.
7. Read the full details of the event you just created. Report its description and start time.

DOCS
8. Create a new Google Doc titled "Workspace smoke test doc". Report the documentId and URL.
9. Edit that doc by appending the text "Line one. Line two. Line three." to it.
10. Read the doc back and quote the appended text.

SHEETS
11. Create a new Google Sheet titled "Workspace smoke test sheet". Report the spreadsheetId and URL.
12. Append two rows to Sheet1!A1 — first row ["Name","Price","Status"], second row ["Test","42","OK"].
13. Read Sheet1!A1:C2 back. Report the 2D array you got.
14. Get the spreadsheet metadata. Report the list of sheet/tab names.

SLIDES
15. Create a new Google Slides presentation titled "Workspace smoke test slides". Report the presentationId and URL.
16. Read the structure of the presentation. Report how many slides it has.

DRIVE
17. List Google Drive files matching the query: name contains 'Workspace smoke test'. Report the names and ids that came back.
18. Get metadata for the Google Doc you created in step 8. Report its mimeType and modifiedTime.

When done, summarize: did EVERY step actually call its tool and return real data? List any step where you narrated instead of executing — those are bugs to report.
```

## Interpreting the result

| Agent behavior | What it means |
|---|---|
| Every step reports a real id/URL | Plugin works end-to-end. Your install is healthy. |
| Some "read" steps narrate ("I'll check that now") without calling a tool | The agent's model isn't matching the user verb to the tool description. Try a fresh chat. If it persists across fresh chats, the model is too weak for reliable tool selection (Qwen 14B is around the borderline) — bump to a stronger model. |
| Tools all executed but the agent only summarizes one step | Tool execution is fine; the model is bad at summarizing long multi-step runs. The artifacts are still created — verify in Google Drive. Bigger models (32B+, frontier models) summarize cleanly. |
| Specific API errors (`invalid_grant`, `Insufficient Permission`, `accessNotConfigured`) | OAuth token expired (re-run setup), scope wasn't granted (re-auth), or that specific Google API isn't enabled in your GCP project (enable it). |

## Cleanup prompt

After verifying, paste this to delete the test artifacts:

```text
Clean up the smoke-test artifacts you just created. Do every step IN ORDER, call the actual tool, and report what got cleaned up.

1. Use drive_files_list with query: name contains 'Workspace smoke test'. Report the ids you got.
2. For EACH file id from step 1, call drive_file_trash with that fileId. Report a count of how many were trashed.
3. Trash the smoke-test email by calling gmail_message_trash with the id from step 1 of the smoke test (the message you sent).
4. Delete the calendar event by calling calendar_event_delete with the eventId from step 5 of the smoke test.

Summarize: count of files trashed, count of emails trashed, count of events deleted.
```
