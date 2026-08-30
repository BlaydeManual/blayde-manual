Photos land here as `{{EDITION_ID}}/images/<procedure_id>__by_<your-github-username>.jpg`
(no per-procedure subfolders needed -- the filename carries everything).
See [../../CONTRIBUTING.md](../../CONTRIBUTING.md) for the full guide, or
browse [../manifest.json](../manifest.json) for the list of `procedure_id`s
that still need a photo.

If this vehicle has more than one edition (an OEM manual and a Haynes
manual, say), each one lives in its own sibling folder next to this
one -- own `manifest.json`, own `images/`, own coordinate space, since a
bbox calibrated against one scan can't be reused against another. Make
sure you're contributing into the edition whose `manifest.json` you
actually checked against.
