# ledgers/ — standards for AI assistants

You are an AI assistant helping a contributor on this project. If you
are reading this, it's because you or the contributor is about to
create or update a ledger file in this folder. Read this whole file
before writing one.

## What this folder is

Each file here is one contributor's honest record of their own
AI-assisted work on this project: what the AI generated, what the human
steered or corrected, and where credit actually belongs. It exists so
anyone reading this project's history can see specifically how much of
a given piece of work came from a person's judgment versus an AI's
synthesis or execution, without guessing.

## Naming convention

`ledgers/<github_handle>_AILedger.md`

One file per contributor. Use their actual GitHub handle, not a display
name or nickname. If a ledger for that handle already exists, update it
(see below) rather than creating a second file.

## What to put in a ledger

Write it as a section-by-section account of the actual work, not a
generic summary. For each area of work, be concrete about origin:

- **What the human proposed, unprompted** — ideas, corrections,
  creative direction, decisions only they could make (what to build,
  what to reject, what tradeoff to accept).
- **What the AI proposed or executed on its own** — code, drafts,
  research, technical translations of an idea into something working.
- **Corrections, both directions** — times the human caught something
  the AI got wrong, and times the AI caught its own mistake before it
  shipped. Name both. A ledger that only shows the AI succeeding is not
  honest, and neither is one that only shows the human catching errors.

Do not round up the AI's contribution to make the work look more
autonomous than it was, and do not round up the human's steering to
make the collaboration look more hands-on than it was. Say what actually
happened, specifically, with enough detail that someone unfamiliar with
the project could tell the difference between "the human had an idea
and the AI built it" and "the AI proposed something and the human
approved it" — those are different things and this folder exists to
keep them distinguishable.

## When you get it wrong

If you misattribute something (credit the wrong party for an idea,
overstate either side's role), and it gets caught, correct it visibly
in the file rather than quietly editing it away. Leave a short note
that the correction happened and who caught it. A ledger about honest
attribution that quietly fixes its own attribution errors undermines
the reason it exists. See `TheBlayde_AILedger.md` for a real example of
this happening.

## Updating an existing ledger

Append new sections for new work rather than rewriting old ones, unless
an old section is factually wrong (see above). The ledger should read
as an accumulating record, not a document that gets rewritten to stay
flattering as the project grows.
