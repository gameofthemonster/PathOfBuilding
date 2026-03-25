# UX Writing

## The Button Label Problem

**Never use "OK", "Submit", or "Yes/No".** Use specific verb + object patterns:

| Bad | Good | Why |
|-----|------|-----|
| OK | Save changes | Says what will happen |
| Submit | Create session | Outcome-focused |
| Yes | Delete blueprint | Confirms the action |
| Cancel | Keep editing | Clarifies what "cancel" means |
| Click here | View MR | Describes the destination |

**For destructive actions**, name the destruction:
- "Delete" not "Remove" (delete is permanent, remove implies recoverable)
- "Delete 3 sessions" not "Delete selected" (show the count)

## Error Messages: The Formula

Every error message should answer: (1) What happened? (2) Why? (3) How to fix it?

Example: "Email address isn't valid. Please include an @ symbol." not "Invalid input".

### Error Message Templates

| Situation | Template |
|-----------|----------|
| **Format error** | "[Field] needs to be [format]. Example: [example]" |
| **Missing required** | "Please enter [what's missing]" |
| **Permission denied** | "You don't have access to [thing]. [What to do instead]" |
| **Network error** | "Couldn't connect to [thing]. Check your connection and try again." |
| **Server error** | "Something went wrong on our end. Try again in a moment." |

### Don't Blame the User

Reframe errors: "Please enter a date in YYYY-MM-DD format" not "You entered an invalid date".

## Empty States Are Opportunities

Empty states are onboarding moments:
1. Acknowledge briefly
2. Explain the value of filling it
3. Provide a clear action

```
"No sessions yet.
Create your first blueprint session to start automating workflows."
[Create Session]
```

Not just: "No items found."

## Voice vs Tone

**Voice** is consistent brand personality. **Tone** adapts to the moment.

| Moment | Tone |
|--------|------|
| Success | Confirmatory, brief: "Session created. Starting now." |
| Error | Empathetic, helpful: "That didn't work. Here's what to try..." |
| Loading | Reassuring: "Running blueprint..." |
| Destructive confirm | Serious, clear: "Delete this blueprint? This can't be undone." |

**Never use humor for errors.** Users are already frustrated. Be helpful, not cute.

## Writing for Accessibility

- **Link text** must have standalone meaning: "View session details" not "Click here"
- **Alt text** describes information, not the image: "Blueprint execution flow for coding-agent" not "Diagram"
- Use `alt=""` for purely decorative images
- **Icon buttons** need `aria-label`: `<button aria-label="Delete session"><TrashIcon /></button>`

## Consistency: The Terminology Problem

Endless-specific terms — use consistently:

| Use | Don't Use |
|-----|----------|
| Blueprint | workflow, template, flow |
| Session | run, execution, instance |
| Agent | bot, AI, assistant |
| Step | stage, phase |
| Approve | confirm, accept |

Build muscle memory with consistent terms. Variety creates confusion.

## Avoid Redundant Copy

If the heading explains it, the intro is redundant. If the button is clear, don't explain it again. Say it once, say it well.

## Loading States

Be specific: "Running blueprint: coding-agent..." not "Loading...".

For long waits, set expectations: "This usually takes 30–60 seconds".

## Confirmation Dialogs: Use Sparingly

Most confirmation dialogs are design failures — consider undo instead. When you must confirm (via `ConfirmDialog`):
- Name the action
- Explain consequences
- Use specific button labels ("Delete blueprint" / "Keep blueprint", not "Yes" / "No")

---

**Avoid**: Jargon without explanation. Blaming users. Vague errors. Varying terminology for variety. Humor for errors. "Click here" as link text.
