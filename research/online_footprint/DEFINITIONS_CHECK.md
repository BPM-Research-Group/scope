# Paper vs. code: footprint definitions

This compares the definitions in **[FP]** van Detten et al., *Footprint-Based Conformance Checking for Object-Centric Process Trees* (BPM 2026), against the repo the paper links to, `github.com/Nik314/OCPT-Conformance-Checking` (commit `02ee336`). Where it matters, it also notes what the Rust port in `rust4pm_BPM` (rev `fcbfdb4`) does. SCOPE uses that port.

Legend: ✅ matches · ⚠️ deviates on purpose or in a way that changes values · 🐞 bug, checked by running the repo's own code

## Summary

| # | Topic | Paper | Python repo | rust4pm | Verdict |
|---|---|---|---|---|---|
| 1 | Log directly-follows / start / end (Def. 2, 7) | per-type object traces | `pm4py.discover_dfg` per type with `case_id=oid` | same | ✅ |
| 2 | Tree directly-follows (eqs. 1–14) | recursive rules | per-type projection, then `dfg_recursion` | own implementation | 🐞 several bugs (below) |
| 3 | Multiplicity pattern set (Def. 8) | `rel, ot>1, ot<1, a>1, a<1` | `rel, div, def, con, opt` | `rel, div, def, con, opt` | ⚠️ renamed; `div` changes meaning (#4) |
| 4 | Log `div` | `a>1`: an object takes part in >1 `a`-events | **DF2 divergence**: same `ot`-set, different full object set | `a>1` per object (matches paper) | ⚠️ Python log ≠ paper, and ≠ Python tree side |
| 5 | Tree `div` / `opt` | leaf allows it, or a loop / choice on the path | `leaf.div ∨ (rel ∧ LOOP on path)` / `leaf.div ∨ (rel ∧ XOR on path)` | — | ✅ |
| 6 | Tree `con` / `def` | true if any leaf allows it | leaf allows it **and** a recursive check against the other types (`check_convergence` / `check_deficient`) | — | ⚠️ stricter than the paper |
| 7 | Pattern counts (§3.2) | 5\|Σ\|\|Ω\| and \|Σ\|²\|Ω\|² | `total_activities = list(log_rel) + list(tree_rel)` (concatenated) | same, with a comment saying so | ⚠️ activities in both log and tree count twice; identity pairs up to 4× |
| 8 | Identity check, log side (Def. 4) | **set-wise**: same `ot`-set ⇒ same `ot'`-set | **object-wise**: `check1 ∨ check2`. Every `ot1`-object (or every object) occurs with only one distinct `(ot1∪ot2)`-set | same | ⚠️ stricter (see #8 detail) |
| 9 | Identity pattern universe (Def. 9) | all `a,b`, `ot,ot'` | `a≠b`, `ot1≠ot2`, and both activities related to both types in log **or** tree | same | ⚠️ |
| 10 | Identity value when the pair never applies in the log | 0 (nothing violated) | **1** (`not in log_ident`) | **1** | ⚠️ the "relaxed" side of fitness is inflated |
| 11 | Tree identity patterns | explicit nodes + transitive closure per activity pair | same; directed `(ot1,ot2)` only | same; also adds the symmetric pair for symmetric kinds | ✅ (rust4pm adds symmetry) |
| 12 | Fitness / precision (Def. 10) | overlap / log count, overlap / model count, mean over categories | per-category lists; empty set ⇒ 1.0; **no** mean or std computed in `src/` | mean over 3 categories | ✅ formula, ⚠️ aggregation (#13) |
| 13 | Table 1, "Absolute Difference" | overall values, with differences explained by multiplicities and identity | `compare_values()` uses `get_fitness(...)[0]`, i.e. **control-flow category only**, on trees mined **without** identity relations (`df2_miner_apply(path)` uses `ident=False`) | — | ⚠️ see #13 |

## Details

### #2 Tree directly-follows extraction: confirmed bugs

I ran `dfg_recursion` from `src/tree_abstraction.py` unchanged on small trees. The script is `check_dfg.py`; it extracts the function with `ast` and uses stub operators.

| Tree | Repo result | Correct (paper eqs.) | Cause |
|---|---|---|---|
| `→(a, →(b,c))` | df `{a→c, b→c}`, end `{b}` | df `{a→b, b→c}`, end `{c}` | sequence links `end(Sᵢ)` to `sub_dfgs[i+1][2]` (the **end** of Sᵢ₊₁, should be the start); ends are collected with `end.update(sub_start)` |
| `→(‖(→(a,b),c), d)` | contains `a→d`, no `b→d` | `b→d, c→d` | same two lines; `‖` and `×` also use `end.update(sub_start)` |
| `→(a, ×(b,τ), c)` | no `a→c` | `a→c` (eq. 13, skip over an optional subtree) | only adjacent subtrees are linked |
| `‖(a, τ)` | skip = True | skip = False (eq. 5: **all** children skippable) | `optional = optional or sub_optional` (should be `and`, starting from True) |
| `⟲(a, b)` | contains `a→a` | no `a→a` (body end → body start only if a redo part is skippable) | `end × start` is added unconditionally |

The bugs live in `tree_abstraction.py:174`, `:176`, `:190`, `:204`, `:205` and `:239`. Leaves have start = end, so a leaf-only `→(a,b)` comes out right. That probably hid the bug on flat trees.

### #4 `div` means three different things

- **Paper (Def. 3/8):** `a>1` means some object takes part in more than one `a`-event.
- **Python log side (`interaction_properties.py`):** group the `a`-events by their `ot`-tuple, then count distinct full object sets. This is DF2 divergence, as in the DF2 miner and the streaming paper.
- **Python tree side:** `leaf.div ∨ loop on path`. This is the paper's `a>1`.
- **rust4pm log side:** `a>1` per object, matching the paper. So the Rust port **does not reproduce** the Python numbers here.

Effect: take an activity inside a loop, with no resource type. The object repeats `a` with the same co-objects. Python: log `div` = 0 and tree `div` = 1, so precision drops even though the log fits perfectly.

### #8 Identity: object-wise vs. set-wise

The repo marks `(ot1,ot2,a,b)` as satisfied if, over all `a`- and `b`-events restricted to `ot1∪ot2`, either
- `check1`: every object occurs with only one distinct object set, or
- `check2`: every `ot1`-object does.

How this relates to Def. 4:
- `check2` ⇒ Def. 4 when the `ot1`-sets are non-empty. If two events share the `ot1`-set `S ∋ o`, then `o` sees one combined set, so the `ot2`-sets are equal.
- Def. 4 ⇏ `check2`. Example: `o` appears in `{o, x}` and in `{o, p, y}`. The `ot1`-sets differ, so Def. 4 holds, but `check2` fails. The code checks *stable groups* (synchronization), which is stronger than an implication.
- Def. 4 also compares events with an **empty** `ot1`-set. The code skips them, because only objects are grouped.

### #13 Table 1 numbers

The committed `comparison.csv` reproduces the "Absolute Difference" column only roughly, and two rows look swapped:

| Log | paper (fit/prec) | `comparison.csv` |
|---|---|---|
| Container | 0.02 / 0.08 | 0.18 / 0.12 |
| P2P | 0.17 / 0.12 | 0.02 / 0.08 |
| LRMS O2C | 0.00 / 0.08 | 0.00 / 0.12 |
| Recruiting | 0.03 / 0.35 | 0.02 / 0.37 |

The other rows match within ±0.01. These are the **control-flow-only** values, on trees **without** identity nodes. But §4.2 explains the precision gaps through multiplicity and identity sensitivity. Either the CSV is stale, or the explanation does not fit how the numbers were produced. Worth asking.

### Smaller points

- **Def. 3:** "πact(o) = a" should be πact(e).
- **Def. 5:** "0 ∈ m_ot ⇒ ot ∈ con_a" should be MANY ∈ m_ot ⇒ con. The text has 0 twice.
- `interaction_properties.py:39`: `identifiers[ot] != set()` compares a tuple with a set, so it is always true. This is harmless, because line 46 drops the empty tuple.
- Not footprint, but in the same repo: `divergence_free_graph.py:32` builds `non_ends` from `local_start`.

## What this means for the online version

1. **Reference semantics.** Use the paper definitions, with fixes #2 and #4 applied, as the ground truth for exactness tests. Neither implementation is a safe oracle. Add a "Python-compatible" switch only if we need to reproduce Table 1.
2. **Identity (D1).** The paper's set-wise Def. 4 is the variant that merges with the DF2 divergence index. The code's object-wise check is stricter. This has to be decided with Jan Niklas van Detten.
3. **Unseen identity patterns (D2).** Confirmed in both implementations: they count as 1. Online this makes identity non-monotone. Prefer the paper (0).
4. **Counts (D3).** Use set-based universes (5|Σ||Ω|), not the concatenated list.
