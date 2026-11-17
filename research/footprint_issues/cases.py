"""Separating examples, one per detected issue. Run: python cases.py  (writes cases/<id>/)."""
import os

from common import ID, L, OP, TAU, dump, to_ocel2_json, to_rust

HERE = os.path.dirname(os.path.abspath(__file__))

# Each case: id, issue (section title), log events, tree, the patterns to show ("probes"),
# and which events of the log to highlight (0-based).
CASES = [
    dict(
        id="01_seq_links_to_end",
        issue="Tree DF: a sequence links to the *end* of the next child and takes ends from starts",
        events=[["a", ["o1"]], ["b", ["o1"]], ["c", ["o1"]]],
        tree=OP("seq", L("a", "o"), OP("seq", L("b", "o"), L("c", "o"), hl=True)),
        probes=[("df", "o", "a", "b"), ("df", "o", "a", "c"), ("end", "o", "b"), ("end", "o", "c")],
        hl_events=[],
    ),
    dict(
        id="02_par_ends_from_starts",
        issue="Tree DF: ∧ and × report their *start* activities as end activities",
        events=[["a", ["o1"]], ["c", ["o1"]], ["b", ["o1"]], ["d", ["o1"]]],
        tree=OP("seq", OP("par", OP("seq", L("a", "o"), L("b", "o")), L("c", "o"), hl=True), L("d", "o")),
        probes=[("df", "o", "b", "d"), ("df", "o", "a", "d"), ("df", "o", "c", "d")],
        hl_events=[2, 3],
    ),
    dict(
        id="03_seq_skip_optional",
        issue="Tree DF: a sequence does not link across a skippable child (eq. 13)",
        events=[["a", ["o1"]], ["c", ["o1"]], ["a", ["o2"]], ["b", ["o2"]], ["c", ["o2"]]],
        tree=OP("seq", L("a", "o"), OP("xor", L("b", "o"), TAU(["o"]), hl=True), L("c", "o")),
        probes=[("df", "o", "a", "c"), ("df", "o", "a", "b"), ("df", "o", "b", "c")],
        hl_events=[0, 1],
    ),
    dict(
        id="04_par_skip_any",
        issue="Tree DF: ∧ is treated as skippable if *any* child is skippable (eq. 5 says all)",
        events=[["a", ["o1"]], ["e", ["o1"]]],
        tree=OP("seq", OP("par", L("a", "o"), TAU(["o"]), hl=True), L("e", "o")),
        probes=[("start", "o", "a"), ("start", "o", "e")],
        hl_events=[],
    ),
    dict(
        id="05_loop_body_self",
        issue="Tree DF: a loop always links the body's end to the body's start",
        events=[["a", ["o1"]], ["b", ["o1"]], ["a", ["o1"]]],
        tree=OP("loop", L("a", "o"), L("b", "o"), hl=True),
        probes=[("df", "o", "a", "a"), ("df", "o", "a", "b"), ("df", "o", "b", "a")],
        hl_events=[],
    ),
    dict(
        id="06_leaf_skip_rule_paper",
        issue="Paper: leaves unrelated to a type (and τ) are not skippable under the literal leaf rule",
        events=[["a", ["o1"]], ["b", ["i1"]], ["c", ["o1"]]],
        tree=OP("seq", L("a", "o"), L("b", "i", hl=True), L("c", "o")),
        probes=[("df", "o", "a", "c")],
        hl_events=[1],
        literal=True,
    ),
    dict(
        id="07_log_div_meaning",
        issue="Log `div`: Python uses DF2 divergence, rust4pm and the paper use 'object in >1 a-events'",
        events=[["a", ["o1", "i1"]], ["a", ["o1", "i1"]], ["b", ["o1", "i1"]]],
        tree=OP("seq", OP("loop", L("a", ["o", "i"], hl=True), TAU(["o", "i"])),
                L("b", ["o", "i"])),
        probes=[("div", "a", "o"), ("div", "a", "i")],
        hl_events=[0, 1],
    ),
    dict(
        id="08_tree_con_stricter",
        issue="Tree `con`: a leaf that allows convergence does not yield the pattern in the implementations",
        events=[["a", ["o1", "i1", "i2"]], ["b", ["o1"]]],
        tree=OP("seq", L("a", ["o", "i"], con=["i"], hl=True), L("b", ["o"])),
        probes=[("con", "a", "i")],
        hl_events=[0],
    ),
    dict(
        id="09_tree_def_stricter",
        issue="Tree `def`: a leaf that allows deficiency does not yield the pattern in the implementations",
        events=[["a", ["o1", "i1"]], ["a", ["o2"]], ["b", ["o1"]], ["b", ["o2"]]],
        tree=OP("seq", L("a", ["o", "i"], def_=["i"], hl=True), L("b", ["o"])),
        probes=[("def", "a", "i")],
        hl_events=[1],
    ),
    dict(
        id="10_pattern_double_count",
        issue="Pattern universe: activities in both log and tree are counted twice",
        events=[["a", ["o1"]], ["x", ["o1"]]],
        tree=L("a", ["o"], hl=True),
        probes=[("rel", "a", "o"), ("rel", "x", "o")],
        hl_events=[1],
        score_check=[1],
    ),
    dict(
        id="11_identity_objectwise_stricter",
        issue="Identity: object-wise check flags a violation that Def. 4 does not",
        events=[["a", ["o1", "i1"]], ["b", ["o1", "o2", "i2"]]],
        tree=ID("o", "i", OP("seq", L("a", ["o", "i"]), L("b", ["o", "i"], con=["o"])), hl=True),
        probes=[("ident", "o", "i", "a", "b")],
        hl_events=[0, 1],
    ),
    dict(
        id="12_identity_empty_set",
        issue="Identity: events without objects of the implying type are ignored by the implementations",
        events=[["a", ["o1", "i3"]], ["b", ["o1", "i3"]], ["a", ["i1"]], ["b", ["i2"]]],
        tree=ID("o", "i", OP("seq", L("a", ["o", "i"], def_=["o"]), L("b", ["o", "i"], def_=["o"])), hl=True),
        probes=[("ident", "o", "i", "a", "b")],
        hl_events=[2, 3],
    ),
    dict(
        id="13_identity_same_activity",
        issue="Identity universe: pairs with a = b are excluded by the implementations",
        events=[["a", ["o1", "i1"]], ["a", ["o1", "i2"]]],
        tree=ID("o", "i", OP("loop", L("a", ["o", "i"], div=["o"]), TAU(["o", "i"])), hl=True),
        probes=[("ident", "o", "i", "a", "a")],
        hl_events=[0, 1],
    ),
    dict(
        id="14_identity_vacuous",
        issue="Identity: a pattern that never applies in the log counts as violated (1) in the implementations",
        events=[["a", ["o1", "i1"]], ["a", ["o2", "i2"]]],
        tree=ID("o", "i", OP("xor", L("a", ["o", "i"]), L("b", ["o", "i"], hl=True))),
        probes=[("ident", "o", "i", "a", "b")],
        hl_events=[],
    ),
    dict(
        id="15_identity_sync_symmetry",
        issue="Identity: rust4pm reads Sync as both directions, Python only as left ⇒ right",
        events=[["a", ["o1", "i1"]], ["b", ["o2", "i1"]]],
        tree=ID("o", "i", OP("seq", L("a", ["o", "i"]), L("b", ["o", "i"])), kind="Sync", hl=True),
        probes=[("ident", "o", "i", "a", "b"), ("ident", "i", "o", "a", "b")],
        hl_events=[0, 1],
    ),
    dict(
        id="16_tree_opt_loop_redo",
        issue="Tree `opt`: an activity in a loop's redo part can occur zero times, but no pattern says so",
        events=[["a", ["o1"]], ["a", ["o2"]], ["b", ["o2"]], ["a", ["o2"]]],
        tree=OP("loop", L("a", "o"), L("b", "o", hl=True)),
        probes=[("opt", "a", "o"), ("opt", "b", "o"), ("div", "b", "o")],
        hl_events=[0],
    ),
]


def main():
    for c in CASES:
        d = os.path.join(HERE, "cases", c["id"])
        os.makedirs(d, exist_ok=True)
        dump(f"{d}/events.json", c["events"])
        dump(f"{d}/log.json", to_ocel2_json(c["events"]))
        dump(f"{d}/tree.json", c["tree"])
        dump(f"{d}/tree_rust.json", {"root": to_rust(c["tree"])})
        dump(f"{d}/meta.json", {k: v for k, v in c.items() if k not in ("events", "tree")})
    print(f"wrote {len(CASES)} cases")


if __name__ == "__main__":
    main()
