# Feature requests

Ideas that are real, deliberately not built yet, and open for the
community to weigh in on once this repo is actually public (see
LEGAL.md — nothing's been pushed anywhere yet, so "voting" today just
means this list; once there's a real repo, these move to GitHub issues
and reactions do the voting).

Each entry states what was decided instead and why, so a "why don't
you just build X" doesn't have to be re-litigated from scratch.

## Fully anonymous, offline-capable contribution (no GitHub identity, ever)

**What it would be:** contribute a photo without ever signing in to
anything — not even at final submit — including scanning a QR code
on your phone while the guide itself is open on a completely different
device, with no account linking the two.

**Why that's not what's built:** the two devices problem is a hard
storage-model wall, not a policy choice. A phone's browser and a
laptop's browser are separate storage contexts — IndexedDB/
localStorage never sync across devices. Batching more than one photo
together (scan a code on your phone in the garage, add another from
your desktop later, review them together, submit once) requires
*something* that isn't tied to one device to link those photos as
"the same person's batch" — and the only thing every device can share
without new infrastructure is a real identity. Landing on the page and
seeing what's needed stays fully anonymous either way; signing in is
deferred as late as the storage model allows, not asked for up front.

A real offline/anonymous path is possible in principle (e.g. a
downloadable companion app with its own sync story, or a
device-pairing flow), but that's meaningfully more infrastructure than
this project has today. Logged here rather than built speculatively —
if this matters to enough people, that's a real signal to prioritize
it.

## "Alternate views" tag on photo submissions

**What it would be:** a tag a contributor can apply to a submitted
photo to flag that it fundamentally changes the angle or viewpoint for
a specific need — not just a different take on the same standard
shot, but a genuinely different vantage point (e.g. the standard photo
shows a bolt from above, this one shows it from underneath because
that's the only way to actually see it on some frame configurations).
Filterable and selectable, so someone patching their own manual could
choose "give me the standard view" or "give me the alternate" per
procedure, not just get whatever `pickPhoto()`'s priority list or
random fallback happens to land on.

**Why not built yet:** raised directly as a feature request during an
end-to-end walkthrough test, not designed further. Real overlap with
existing mechanisms worth resolving before building: `pickPhoto()`
already handles "more than one candidate photo per procedure" via
contributor priority + random fallback, and the filename convention
already has an `__altN` suffix for alternate angles
(`parsePhotoFilename()` in `patcher.js`). A real "alternate views" tag
is a different axis than either of those — it's about *why* the shot
differs (a genuine need, not just a different photographer's take),
which matters for the picker UI (surfacing "this one's for a specific
situation" rather than treating every alternate as interchangeable).
Worth designing against the existing `__altN` convention rather than
inventing a parallel system.
