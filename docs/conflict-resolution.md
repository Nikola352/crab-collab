# Conflict resolution

A notebook is not a single document. It is an **ordered list of cells**, each holding **its
own text buffer**, and those two kinds of state behave very differently under concurrent
editing. Crab Collab therefore uses a different strategy for each: Operational
Transformation for cell text, fractional indexing for cell order.

## Cell text — Operational Transformation

Text follows the model described in the Google Docs/Wave articles linked at the end.

Each client keeps three things per cell: the content it is currently showing, a **buffer**
of local edits not yet sent, and at most one **in-flight** operation awaiting
acknowledgement. Keystrokes are applied locally right away and composed into the buffer;
when nothing is in flight, the buffer is promoted to a single in-flight operation and sent
with the cell version it was based on.

The server holds the authoritative content plus a per-cell operation history. An incoming
operation is transformed against every operation committed since its base version, applied,
assigned the next cell version, and broadcast. Clients transform inbound operations against
their own in-flight and buffered operations before applying them (and transform the buffer
in turn), so every replica converges on the same text.

Versions are **per cell**, not per document: two people typing in different cells never
share a version space and never transform against each other.

## Cell order — fractional indexing

Cell ordering uses the approach Figma describes for ordered sequences. Every cell carries a
fractional index — an opaque, densely ordered string — and the notebook order is simply the
cells sorted by that index. Inserting between two neighbours means generating an index
strictly between theirs; moving a cell means assigning it a new one. No positional
transformation is required, and concurrent inserts at the same spot do not corrupt the list.

This is *CRDT-like* rather than a real CRDT: indices commute the way a CRDT's do, but the
server is still the single writer, and identical index collisions are resolved by allocating
the next free index rather than by a deterministic tie-break rule that all replicas could
compute independently.

Because ordering lives entirely in the indices, structural edits and text edits are
independent: reordering cells never invalidates an in-flight text operation.

## Cursors

A cursor is a position in a text buffer, so concurrent edits move it. When a client reports a
cursor position it tags it with the cell version it was measured against; the server replays
the operation history from that version forward, transforming the position as it goes.
Insertions exactly at the cursor are treated differently for the author of the edit than for
everyone else — the author's cursor moves with the text, other cursors stay put.

## Locking granularity

The split between the two kinds of state is also a split between locks. Cell contents live in
a `DashMap`, so a text edit locks only the cell it touches, while a single `RwLock` guards the
cell-order structure alone — editing text and reordering cells do not contend. Cursor
positions are sharded the same way: `FocusState` keeps a per-cell bucket, so an edit rebases
only the cursors inside the edited cell.

State access sits behind the `NotebookStateHolder` trait, so an alternative implementation
with different locking can be swapped in at startup for comparison.

## Execution

Executions are queued server-side per cell. A cell that is already pending or executing cannot
be queued again; kernel messages are correlated back to the originating cell by Jupyter parent
message id, and outputs are appended to the authoritative cell state before being broadcast,
so a client that joins mid-run still sees consistent output.

## Further reading

- Google Docs on OT — [part 1](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs_21.html), [part 2](https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs_22.html)
- Figma — [Realtime editing of ordered sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)
- Ellis & Gibbs, *Concurrency Control in Groupware Systems* (1989)
- Shapiro et al., *A comprehensive study of Convergent and Commutative Replicated Data Types* (2011)
