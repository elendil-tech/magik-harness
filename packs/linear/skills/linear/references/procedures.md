# Linear procedures

The how-to behind the [policy](../SKILL.md). Every GraphQL snippet here was run against a live Free-plan workspace. Send them to `https://api.linear.app/graphql` with the header `Authorization: <personal API key>` (the raw key, no `Bearer`), and take the key from the environment, never from a file in the repository.

Contents: [Census](#census) · [Relieve the cap](#relieve-the-cap) · [Fold one team into another](#fold-one-team-into-another) · [Auto-archive](#auto-archive) · [When something fails](#when-something-fails)

## Census

`scripts/linear_usage.py` counts active issues per team, the open and closed split, the creation rate over a window, and the days left at that rate. It sends queries only; the key comes from `LINEAR_API_KEY`. It exits `0`, `1` (warn), `2` (act) or `3` (could not run), so a scheduled job can alert on the code.

```sh
python3 scripts/linear_usage.py --json     # with LINEAR_API_KEY injected by your secrets manager
```

The creation rate is a lower bound: an issue that was created and then deleted leaves no trace to count.

## Relieve the cap

Use when the census says *act*, or before a bulk creation that would cross the cap. Order matters: the cheap, reversible steps come first.

1. **Size the relief first, then pick the candidates by rule, not by eye.** The slots you need are roughly the creation rate times the days until the first auto-archive wave, minus the headroom. Closed issues (completed or canceled) that nobody has touched in a fixed number of days are the safe set. Say the rule and the count out loud, and list a sample. Count what the rule really frees before asking for approval: in a young, fast-growing workspace a staleness rule frees very little (one real run: 4 slots out of 228, because most of the backlog was under two weeks old). The cheapest reversible lever comes first: archive the closed issues by hand instead of waiting for auto-archive (`mutation($id: String!) { issueArchive(id: $id) { success } }`; undo with `issueUnarchive`). When the safe set is smaller than the need, the lever is the creation rate, not deletion: stop creating the issues, or move the unstructured backlog (no project, no assignee) into a document and recreate them when the work starts. Do not judge staleness by the last-updated date after any bulk move or edit; it resets for every touched issue.
2. **Get approval** for the exact set, as the [guardrails](../SKILL.md#guardrails) require.
3. **Back up.** Write every candidate (id, key, title, state, created, closed and updated dates, description) to a durable file outside the repository. A deleted issue cannot be restored from the API.
4. **Scan for references.** Search the repositories and the knowledge base for each key. A key in a commit message is harmless; a key in a doc that the reader is told to follow is not. Note them for step 7.
5. **Delete to the trash**, never permanently, so there are 30 days to undo it in the app:

   ```graphql
   mutation($id: String!) { issueDelete(id: $id, permanentlyDelete: false) { success } }
   ```

6. **Verify.** Re-run the census and check that the count dropped by exactly the number deleted.
7. **Repair the references** you noted in step 4, or annotate them.

If the closed set is too small to matter, the backlog is the real cost: cancel what will never be done, or move it into a document, and keep the issue for when the work starts.

## Fold one team into another

Use to retire a second team (the Free plan allows two) without losing issues. The destination keeps the workspace's labels, projects and initiatives, so ventures are expressed with initiatives and projects instead of teams.

1. **Snapshot** both teams: every issue with its state type, project, label names and priority. You will compare against this at the end.
2. **Add the destination team to every project** that holds issues you will move, otherwise the moved issues lose their project:

   ```graphql
   mutation($id: String!, $ids: [String!]) { projectUpdate(id: $id, input: { teamIds: $ids }) { success } }
   ```

   `ids` must contain the projects' current teams as well as the destination team.
3. **Test-move one issue** and read it back (key, state, project, labels):

   ```graphql
   mutation($id: String!, $t: String!) { issueUpdate(id: $id, input: { teamId: $t }) { success issue { identifier } } }
   ```

4. **Bulk-move** the rest, oldest first, one request each with a short pause. Save the old-key to new-key map to a durable file as you go.
5. **Verify against the snapshot.** State type, project and priority should match for every issue. Compare label names too: **team-scoped labels are dropped by the move**. For each missing label, create it in the destination team with the same name, color and description, and re-apply it:

   ```graphql
   mutation($i: IssueLabelCreateInput!) { issueLabelCreate(input: $i) { success issueLabel { id name } } }
   mutation($id: String!, $l: String!) { issueAddLabel(id: $id, labelId: $l) { success } }
   ```

   Prefer workspace-level labels from the start, so there is nothing to repair.
6. **Check that the old keys resolve** (they redirect to the new keys), then repair the references that name them, using the map from step 4.
7. **Look for what the census cannot see before you touch the team.** Query its issues with `includeArchived: true` and count the archived and the trashed ones: they are not active, so the census calls the team empty, yet deleting the team deletes them too. Export them (key, title, state, dates, description) to a durable file first. If they matter, retire the team instead of deleting it.
8. **Retire the team**, which keeps its history: in the app (Settings, Teams), or `mutation($id: String!, $t: DateTime!) { teamUpdate(id: $id, input: { retiredAt: $t }) { success } }`. Deleting a team is a separate act: leave it to the owner, and only with the archived and trashed counts in front of them.

## Auto-archive

Linear's automatic archiving (archiving by hand also works; see [Relieve the cap](#relieve-the-cap)). Set it per team; the minimum is one month and the unit is months.

```graphql
mutation($id: String!, $v: Float!) { teamUpdate(id: $id, input: { autoArchivePeriod: $v }) { success team { autoArchivePeriod } } }
```

Values below 1 are rejected. A shorter window only matters once closed issues are older than it, so the effect shows up a month after the change.

## When something fails

| Symptom | Cause and fix |
| --- | --- |
| `Query too complex` | Above 10,000. Fetch issues without nesting (no `labels`, `project` inside a project listing), page by 100, and fetch relations in a second query. |
| HTTP 429 or 5xx | Back off and retry a few times; keep bulk writes sequential. |
| An issue lost its label after a move | Team-scoped label. See [fold one team into another](#fold-one-team-into-another), step 5. |
| An issue lost its project after a move | The project does not belong to the destination team. Add the team to the project (step 2) and set the project again. |
| New issues are refused | Over the cap. Run the census, then [relieve the cap](#relieve-the-cap). |
| `orca linear` or the MCP server has no delete | By design. Use the API with the approved operation. |
