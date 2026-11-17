"""Builds REPORT.md from the case outputs. Run after run_all.sh."""
import os
from collections import defaultdict

from common import load, otype, to_mermaid
from evaluate import IMPLS, fmt_probe, load_case, probe

HERE = os.path.dirname(os.path.abspath(__file__))
PY_REPO = "Nik314/OCPT-Conformance-Checking @ 02ee336"
RUST = "BPM-Research-Group/rust4pm_BPM @ fcbfdb4"
PYF = "OCPT-Conformance-Checking/src"
RSF = "process_mining/src/conformance/object_centric"

# --------------------------------------------------------------------------- per-case text
TEXT = {
    "01_seq_links_to_end": dict(
        paper="Eq. 13: in a sequence, the **end** activities of child *i* are followed by the **start** activities of child *i+1*. "
              "Eq. 11: the ends of the sequence are the ends of the last non-skippable child and of the children after it.",
        code=f"`{PYF}/tree_abstraction.py:176` links `sub_end` to `sub_dfgs[i+1][2]`, which is the **end** set of the next child. "
             f"`:174` collects the sequence's ends with `end.update(sub_start)`. For a leaf, start = end, so flat sequences come out right. "
             "Nested sequences do not.",
        question="Confirm this is a bug, i.e. the intended tree footprint is a→b, b→c with end {c}, as eqs. 11 and 13 say.",
    ),
    "02_par_ends_from_starts": dict(
        paper="Eq. 2: the end activities of ∧ (and, analogously, of ×) are the union of the children's **end** activities.",
        code=f"`{PYF}/tree_abstraction.py:190` (×) and `:204` (∧) use `end.update(sub_start)`. So the composite's end set is its start set. "
             "Here the ∧ reports end {a, c} instead of {b, c}, and the sequence then links a→d instead of b→d.",
        question="Confirm the intended ends of ∧/× are the children's ends (eq. 2).",
    ),
    "03_seq_skip_optional": dict(
        paper="Eq. 13 also links child *i* to child *j > i+1* when every child strictly between them is skippable.",
        code=f"`{PYF}/tree_abstraction.py:175-177` only links adjacent children (`i` → `i+1`). The edge a→c over the skippable ×(b, τ) is never produced.",
        question="Confirm that edges across skippable children are intended (eq. 13).",
    ),
    "04_par_skip_any": dict(
        paper="Eq. 5: a ∧ node is skippable only if **all** children are skippable.",
        code=f"`{PYF}/tree_abstraction.py:205` uses `optional = optional or sub_optional`, starting from False. So ∧(a, τ) counts as skippable, "
             "and the following `e` becomes an extra start activity.",
        question="Confirm eq. 5 (all children) is intended.",
    ),
    "05_loop_body_self": dict(
        paper="Loop text in Sec. 3.3: the body's end activities lead to the body's start activities **only if a redo part can be skipped**.",
        code=f"`{PYF}/tree_abstraction.py:239` adds `end × start` of the whole loop unconditionally. So ↺(a, b) gets a→a although every repetition must pass through b. "
             "The multiplicity scores of this case differ for a separate reason; see Issue 16.",
        question="Confirm that a→a should only appear if a redo part is skippable.",
    ),
    "06_leaf_skip_rule_paper": dict(
        paper="Sec. 3.3, leaf rule: skip<sub>ot</sub>(leaf) = ot ∈ div<sub>a</sub>. Read **literally**, a leaf *unrelated* to ot (here b for type o) is "
              "**not** skippable for ot. Then eq. 13 never links a→c, although object o1's trace is ⟨a, c⟩. The reference implementation therefore "
              "treats unrelated leaves (and τ) as skippable by default (\"interpreted\"). The \"literal\" column shows what the text gives.",
        code=f"rust4pm projects the type first and produces a→c. The Python code projects the tree for o (`ocpn_conversion.py:17-22`), which turns b into τ. "
             "It then hits the adjacent-only linking of Issue 3 and also misses a→c.",
        question="Should the leaf rule read \"skip<sub>ot</sub>(leaf) = ot ∈ div<sub>a</sub> ∨ ot ∉ rel<sub>a</sub> ∨ a = τ\"? (Paper wording issue, plus Python bug #3.)",
    ),
    "07_log_div_meaning": dict(
        paper="Def. 3/8: rel<sub>a>1,ot</sub> holds if some object of type ot takes part in **more than one** a-event.",
        code=f"Python, log side (`{PYF}/interaction_properties.py:38-51`) computes **DF2 divergence**: a-events with the same ot-set but different full object sets. "
             f"The Python tree side (`tree_abstraction.py:140-141`) and rust4pm's log side (`{RSF}/object_centric_language_abstraction.rs:701`) use 'more than one a-event'. "
             "Here o1 and i1 repeat a together. Paper and rust4pm give div = 1 (matching the loop in the tree). Python gives 0, so precision drops on a perfectly fitting log.",
        question="Which meaning is intended for the `div` multiplicity pattern on the log side? (The tree side in all three is 'a>1'.)",
    ),
    "08_tree_con_stricter": dict(
        paper="Sec. 3.3: rel<sub>a,ot>1</sub> on the tree side \"evaluates to true if any corresponding leaf allows it\".",
        code=f"Both implementations add a recursive condition against the other related types: Python `check_convergence` (`{PYF}/tree_abstraction.py:57-91`) "
             f"and rust4pm `compute_conv` / `check_conv_subroutine_for_competitor`. Here leaf a allows i to converge, "
             "but the pattern is 0 on the tree side, so a fitting log loses multiplicity fitness.",
        question="Is the extra competitor check intended? If yes, the paper should describe it; if no, both implementations need changing.",
    ),
    "09_tree_def_stricter": dict(
        paper="Same rule as Issue 8, for rel<sub>a,ot<1</sub> (deficiency).",
        code=f"Python `check_deficient` (`{PYF}/tree_abstraction.py:96-129`) and rust4pm `compute_def` apply the competitor check. Leaf a allows i to be missing, but the pattern stays 0.",
        question="As Issue 8, for deficiency.",
    ),
    "10_pattern_double_count": dict(
        paper="Sec. 3.2: there are 5·|Σ|·|Ω| multiplicity patterns and |Σ|²·|Ω|² identity patterns, over the **set** of activities.",
        code=f"Both implementations iterate over `total_activities = list(log_rel) + list(tree_rel)` (Python `{PYF}/conformance.py:27`, "
             f"rust4pm `{RSF}/footprint_based_ocpt.rs:172-173`, with a comment noting the deviation). Activity a is in both log and tree, so its patterns count twice. "
             "Multiplicity fitness is 2/3 instead of 1/2.",
        question="Should the universe be the set Σ<sub>log</sub> ∪ Σ<sub>tree</sub> (paper), or is the weighting intended?",
    ),
    "11_identity_objectwise_stricter": dict(
        paper="Def. 4 (set-wise): ot implies ot′ across a, b if any two events with **equal ot-sets** have equal ot′-sets. "
              "Here the o-sets {o1} and {o1, o2} differ, so nothing is constrained and the implication o ⇒ i holds.",
        code=f"Python `check_relation_log` (`{PYF}/identity_relation.py:9-35`) and rust4pm `check_implication` (`object_centric_language_abstraction.rs:916`) check **per object**. "
             "Every o-object (check2), or every object (check1), must always occur with the same (o ∪ i)-set. o1 occurs with {o1,i1} and {o1,o2,i2}, so both report a violation. "
             "The per-object check implies Def. 4 (for non-empty ot-sets), but not the other way round.",
        question="Is the intended semantics the set-wise implication of Def. 4, or the stronger per-object synchronisation the code checks?",
    ),
    "12_identity_empty_set": dict(
        paper="Def. 4 compares all a/b events, including those with an **empty** ot-set. Events 3 and 4 have no o-object (o-set ∅ for both) but different i-sets, so o ⇒ i is violated.",
        code="Both implementations only group by objects. Events without an o-object never take part in check2, and check1 is satisfied because i1 and i2 each occur once.",
        question="Should events without objects of the implying type count (Def. 4 as written)? This interacts with deficiency: the tree allows o to be missing at a and b.",
    ),
    "13_identity_same_activity": dict(
        paper="Def. 9 ranges over all activity pairs a, b ∈ U<sub>act</sub> (|Σ|² of them), so (a, a) is included. "
              "The two a-events share o1 but have different i-objects, which violates o ⇒ i within a.",
        code=f"Both implementations skip `a == b` and `ot1 == ot2` (Python `{PYF}/conformance.py:51`, rust4pm `footprint_based_ocpt.rs:277/282`). "
             "Here the violation is invisible ('—' = not a pattern), and identity fitness stays 1.0.",
        question="Are same-activity pairs part of the identity footprint? If not, Sec. 3.2's count |Σ|²|Ω|² should be adjusted.",
    ),
    "14_identity_vacuous": dict(
        paper="Def. 9: the pattern is 1 if the implication is **violated** in the log. Activity b never occurs, so nothing is violated and the value is 0.",
        code=f"Both implementations push `not (ot1,ot2,a,b) in log_ident` (Python `{PYF}/conformance.py:50`, rust4pm `footprint_based_ocpt.rs:292`), "
             "but `log_ident` only contains pairs that were checked and satisfied. A pair that never applies in the log is therefore 1 (\"violated\") whenever the tree relates both activities to both types.\n\n"
             "**Side effect worth deciding together:** with the paper's literal reading, the tree side is 1 for every pair that is not under an identity node. The log side is 0 unless something is violated. "
             "Identity **precision** is then 0 whenever the tree has few identity nodes: the paper-reference column shows 0.0 for identity precision in most cases of this report. "
             "The implementations' convention avoids that, at the cost of fitness loss here.",
        question="Which value should an identity pattern have when it never applies in the log? And how should identity precision behave for trees without identity nodes?",
    ),
    "15_identity_sync_symmetry": dict(
        paper="The paper only has implications; a synchronisation node is two implications (o ⇒ i and i ⇒ o). The reference follows that.",
        code=f"rust4pm adds the reverse direction for `IdentityRelationKind::Sync` (`object_centric_language_abstraction.rs:990`). The Python repo encodes identity nodes as a directed tuple `(ot1, ot2)` "
             f"(`{PYF}/tree_abstraction.py:32-40`), so it only enforces o ⇒ i. The log violates i ⇒ o (i1 occurs with o1 and with o2). Only rust4pm and the paper flag it.",
        question="In the Python version, how are symmetric relations supposed to enter the conformance check (two nodes, or a kind)?",
    ),
    "16_tree_opt_loop_redo": dict(
        paper="Sec. 3.3: rel<sub>a<1,ot</sub> holds if a leaf allows it or there is a **choice** on the path. Loops are not mentioned. "
              "But a redo part (b) can occur zero times, so a<1 is reachable for b. Read literally, the paper misses this, and the reference reproduces the literal rule.",
        code=f"rust4pm initialises optionality from divergence (`object_centric_language_abstraction.rs:111`, `compute_opt`). Every activity under a loop (div via loop) becomes optional, "
             "including the **body** a, which always occurs at least once. Python (`tree_abstraction.py:142-143`) follows the paper.",
        question="Intended rule for a<1 under loops: redo parts only (semantically exact), body and redo (rust4pm), or neither (paper text, Python)?",
    ),
}

EXTRA_SECTIONS = """
## 17. Evaluation script: Table 1 "Absolute Difference" uses one category only

*No separating example. This is about how the published numbers were produced.*

- `main.py:46-47` (`compare_values`) uses `get_fitness(...)[0]` and `get_precision(...)[0]`. That is the **control-flow category only**, not the category average.
- The trees are mined with `df2_miner_apply(path)` with `ident=False`, so they contain no identity nodes.
- Sec. 4.2 explains the precision gaps mainly through multiplicity and identity sensitivity.
- The committed `comparison.csv` reproduces Table 1 only roughly:

| Log | Table 1 (fit / prec) | `comparison.csv` (fit / prec) |
|---|---|---|
| Container | 0.02 / 0.08 | **0.18 / 0.12** |
| P2P | 0.17 / 0.12 | **0.02 / 0.08** |
| LRMS O2C | 0.00 / 0.08 | 0.00 / **0.12** |
| LRMS P2P | 0.04 / 0.02 | 0.04 / 0.01 |
| LRMS HR | 0.05 / 0.12 | 0.06 / 0.12 |
| Recruiting | 0.03 / 0.35 | 0.02 / 0.37 |
| Orders, Hospital | match | match |

The Container and P2P rows look swapped.

**Question:** Were the Table 1 values computed from all three categories, and is `comparison.csv` the current version?

## 18. Typos in the definitions

*No run needed.*

- **Def. 3:** the object-side multiplicity set uses "π<sub>act</sub>(o) = a". It should be π<sub>act</sub>(e) = a.
- **Def. 5:** "0 ∈ m<sub>ot</sub> ⇒ ot ∈ con<sub>a</sub>, 0 ∈ m<sub>ot</sub> ⇒ ot ∈ def<sub>a</sub>". The first should be MANY ∈ m<sub>ot</sub> ⇒ ot ∈ con<sub>a</sub>. The reference implementation uses this fixed reading.

## 19. Harmless code oddity (no behavioural effect)

`{PYF}/interaction_properties.py:39` filters `identifiers[identifiers[ot] != set()]`. That compares tuples with a set, so it is always true and filters nothing. Line 46 removes the empty tuple afterwards, so the result is unaffected. We found no input on which this changes an output.

## 20. Outside the footprint: DF2 graph loses end activities (Python miner)

*Python only. rust4pm's footprint does not use this code. It affects the trees the repo mines for its evaluation.*

`{PYF}/divergence_free_graph.py:32` builds `non_ends` from `local_start` instead of `local_end`. Every related activity that is not a *start* activity is then removed from the ends.

Example (`extra/df2_non_ends/`): one object, o1: ⟨a, **b**⟩.

| | start | end |
|---|---|---|
| expected (DF2 definition) | {a} | **{b}** |
| Python `get_divergence_free_graph` | {a} | **{}** ⚠️ |

**Question:** Confirm this is a typo (`local_end`).
""".replace("{PYF}", PYF)


# --------------------------------------------------------------------------- rendering helpers
def log_table(events, hl):
    rows = ["| # | activity | objects |", "|---|---|---|"]
    for i, (a, os) in enumerate(events):
        cells = [f"e{i + 1}", a, ", ".join(os)]
        if i in hl:
            cells = [f"**{x}** 🟨" if j == 0 else f"**{x}**" for j, x in enumerate(cells)]
        rows.append("| " + " | ".join(cells) + " |")
    traces = defaultdict(list)
    for a, os in events:
        for o in os:
            traces[o].append(a)
    tr = "; ".join(f"{o}: ⟨{', '.join(t)}⟩" for o, t in sorted(traces.items()))
    return "\n".join(rows) + f"\n\nObject traces: {tr}"


def probe_table(c, cid):
    lit = "paper_literal" in c and c["meta"].get("literal")
    impls = IMPLS + (["paper_literal"] if lit else [])
    head = {"python": "Python", "rust4pm": "rust4pm", "paper": "Paper (reference)", "paper_literal": "Paper (literal leaf rule)"}
    rows = ["| pattern | " + " | ".join(f"{head[i]} log | {head[i]} tree" for i in impls) + " |",
            "|---|" + "---|---|" * len(impls)]
    differs = {i: False for i in impls}
    for p in c["meta"]["probes"]:
        p = tuple(p)
        ref = {s: probe(c, "paper", s, p) for s in ("log", "tree")}
        cells = []
        for i in impls:
            for s in ("log", "tree"):
                v = probe(c, i, s, p)
                if i != "paper" and v != ref[s]:
                    differs[i] = True
                    cells.append(f"**{v}** ⚠️")
                else:
                    cells.append(str(v))
        rows.append(f"| {fmt_probe(p)} | " + " | ".join(cells) + " |")
    for k in c["meta"].get("score_check", []):   # issues that only show in the scores
        for i in ("python", "rust4pm"):
            for key in ("fitness", "precision"):
                if abs(c[i]["conformance"][key][k] - c["paper"]["conformance"][key][k]) > 1e-9:
                    differs[i] = True
    return "\n".join(rows), differs


def score_table(c):
    rows = ["| | control fit / prec | multiplicity fit / prec | identity fit / prec |", "|---|---|---|---|"]
    names = {"python": "Python", "rust4pm": "rust4pm", "paper": "Paper (reference)"}
    for i in IMPLS:
        cf = c[i]["conformance"]
        rows.append(f"| {names[i]} | " + " | ".join(f"{cf['fitness'][k]:.3f} / {cf['precision'][k]:.3f}" for k in range(3)) + " |")
    return "\n".join(rows)


def verdict(d):
    agree = "✅ agrees with paper"
    return {i: ("⚠️ differs from paper" if d.get(i) else agree) for i in ("python", "rust4pm")}


# --------------------------------------------------------------------------- main
def main():
    cases = [load_case(os.path.join(HERE, "cases", cid)) | {"id": cid} for cid in sorted(os.listdir(os.path.join(HERE, "cases")))]
    sections, summary = [], []
    for n, c in enumerate(cases, 1):
        cid, t = c["id"], TEXT[c["id"]]
        table, d = probe_table(c, cid)
        v = verdict(d)
        lit_note = ""
        if "paper_literal" in d:
            lit_note = " · literal paper rule " + ("⚠️ differs from interpreted reference" if d["paper_literal"] else "agrees")
        summary.append(f"| [{n}](#{n}-{slug(c['meta']['issue'])}) | {c['meta']['issue']} | {v['python']} | {v['rust4pm']} |")
        sections.append(f"""## {n}. {c['meta']['issue']}

**Result:** Python {v['python']} · rust4pm {v['rust4pm']}{lit_note}

**Paper.** {t['paper']}

**Implementations.** {t['code']}

**Separating example** (`cases/{cid}/`). Highlighted nodes and events are where the behaviour diverges.

```mermaid
{to_mermaid(c['tree'])}
```

{log_table(c['events'], c['meta']['hl_events'])}

**Pattern values** (1 = pattern holds, i.e. behaviour present/allowed; for identity: implication violated / not enforced; — = not part of that implementation's pattern universe; ⚠️ = differs from the paper reference):

{table}

**Category scores:**

{score_table(c)}

> **Question:** {t['question']}
""")
    n = len(cases)
    summary += [
        f"| [{n + 1}](#{n + 1}-evaluation-script-table-1-absolute-difference-uses-one-category-only) | Table 1 computed from the control-flow category only | — (evaluation script) | — |",
        f"| [{n + 2}](#{n + 2}-typos-in-the-definitions) | Typos in Def. 3 and Def. 5 | — | — |",
        f"| [{n + 3}](#{n + 3}-harmless-code-oddity-no-behavioural-effect) | Harmless filter in `interaction_properties.py` | no effect | — |",
        f"| [{n + 4}](#{n + 4}-outside-the-footprint-df2-graph-loses-end-activities-python-miner) | DF2 graph loses end activities (miner) | ⚠️ bug | — |",
    ]
    report = f"""# Footprint conformance (BPM 2026): paper vs. implementations

This report compares three versions of the footprint-based conformance check for object-centric process trees:

| Version | Source |
|---|---|
| **Python**: the implementation linked in the paper | `{PY_REPO}` |
| **rust4pm**: the Rust port | `{RUST}`, `{RSF}/` |
| **Paper (reference)**: a direct implementation of Defs. 2–10 and Sec. 3.3, written for this report | `reference.py` |

For each detected difference there is a small separating example: an OCPT and an OCEL on which the versions disagree. All three versions run on the same input files. The report lists the pattern values that differ, the resulting category scores, and a question about the intended behaviour.

**How to read the tables**
- A pattern value of 1 means the behaviour is present (log) or allowed (tree).
- For identity patterns, 1 means the implication is violated (log) or not enforced (tree).
- ⚠️ marks a value that differs from the paper reference.
- **Category scores can also differ because of other issues in this report.** The usual causes are double counting (Issue 10), loops marking activities as optional in rust4pm (Issue 16), the loop self-edge in Python (Issue 5), and identity precision being 0 under the paper's literal reading (Issue 14). Each section's verdict is based only on the highlighted patterns.

## Summary

| # | Issue | Python | rust4pm |
|---|---|---|---|
{chr(10).join(summary)}

{chr(10).join(sections)}
{EXTRA_SECTIONS.replace('## 17.', f'## {n + 1}.').replace('## 18.', f'## {n + 2}.').replace('## 19.', f'## {n + 3}.').replace('## 20.', f'## {n + 4}.')}

## Appendix A: interpretations in the paper reference

Where the paper text is ambiguous or literally unworkable, `reference.py` makes these choices. Each one is easy to switch.

1. **Leaf skip** (see Issue 6): a leaf that is τ or unrelated to ot is skippable for ot. Use `--literal-leaf-skip` for the literal rule.
2. **res(S)** (eqs. 8, 14): ot is resource-like in S if every leaf of S *related to ot* has ot ∈ div. The text says "all leaf nodes".
3. **Loop skip**: not stated in the paper. A loop is skippable iff its body is.
4. **Def. 5**: MANY ∈ m<sub>ot</sub> ⇒ con (typo fix, Issue {n + 2}).
5. **Tree identity value**: 0 if (ot, ot′, a, b) is in the transitive closure of the identity nodes covering a and b, or if it holds in every log trivially (ot = ot′, or ot′ unrelated to a and b in the tree). Otherwise 1.
6. **Empty category**: fitness or precision is 1.0 if the denominator is 0, as in both implementations.
7. **Pattern universe**: Σ = Σ<sub>log</sub> ∪ Σ<sub>tree</sub>, Ω = Ω<sub>log</sub> ∪ Ω<sub>tree</sub>, as sets.

## Appendix B: reproducing

```bash
./run_all.sh <path to OCPT-Conformance-Checking checkout> ./shim
```

- `cases.py` defines all examples and writes `cases/<id>/`:
  - inputs: `events.json`, `log.json` (OCEL 2.0 JSON), `tree.json` (neutral format), `tree_rust.json` (serde OCPT)
  - outputs: `out_python.json`, `out_rust4pm.json`, `out_paper.json`, `out_paper_literal.json`
- The Python repo runs with pm4py 2.7.15 and pandas 2.2.3. Its Cython module `fast_hash` is replaced by a pure-Python file with identical logic, because the committed binary is a Windows `.pyd`.
- rust4pm runs through `rust_harness/`, which calls `OCLanguageAbstraction::create_from_ocel`, `create_from_oc_process_tree` and `compute_footprint_conformance_abstractions`.
- The Python repo has no notion of identity-relation kinds. Both `Sync` and `ImpOrdered` nodes become the directed tuple `(left, right)` there (see Issue 15).
"""
    with open(os.path.join(HERE, "REPORT.md"), "w") as f:
        f.write(report)
    print("wrote REPORT.md")


def slug(s):
    import re
    s = s.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    return s.strip().replace(" ", "-")


if __name__ == "__main__":
    main()
