"""Reference implementation of the footprint as written in the BPM 2026 paper.

This is a direct reading of Defs. 2-10 and Sec. 3.3 (eqs. 1-14 and the loop text).
Where the text is ambiguous or literally unworkable, the choice is marked INTERPRETATION
and can be switched to the literal reading with --literal-leaf-skip.

Usage: python reference.py <case_dir> [--literal-leaf-skip]
Writes <case_dir>/out_paper.json (or out_paper_literal.json).
"""
import itertools
import sys
from collections import defaultdict

from common import dump, load, otype

MULT = ["rel", "div", "def", "con", "opt"]  # paper: rel, a>1, ot<1, ot>1, a<1


# ======================================================================= log side
def log_abstraction(events):
    types = sorted({otype(o) for _, os in events for o in os})
    acts = sorted({a for a, _ in events})
    objs = sorted({o for _, os in events for o in os})
    trace = defaultdict(list)
    for a, os in events:
        for o in os:
            trace[o].append(a)
    df, start, end = defaultdict(set), defaultdict(set), defaultdict(set)
    for o, t in trace.items():
        ot = otype(o)
        start[ot].add(t[0])
        end[ot].add(t[-1])
        df[ot] |= set(zip(t, t[1:]))
    mult = {k: defaultdict(set) for k in MULT}
    for a in acts:
        evs = [set(os) for b, os in events if b == a]
        for ot in types:
            per_event = [len([o for o in os if otype(o) == ot]) for os in evs]          # m_ot
            per_object = [t.count(a) for o, t in trace.items() if otype(o) == ot]      # m_a
            if not any(per_event):          # Def. 8: related iff non-zero multiplicity
                continue
            mult["rel"][a].add(ot)
            if any(n > 1 for n in per_event):
                mult["con"][a].add(ot)      # rel_{a,ot>1}
            if any(n == 0 for n in per_event):
                mult["def"][a].add(ot)      # rel_{a,ot<1}
            if any(n > 1 for n in per_object):
                mult["div"][a].add(ot)      # rel_{a>1,ot}
            if any(n == 0 for n in per_object):
                mult["opt"][a].add(ot)      # rel_{a<1,ot}
    # Def. 4 / 9: implication ot -> ot' across a,b violated?
    proj = [(a, {t: frozenset(o for o in os if otype(o) == t) for t in types}) for a, os in events]
    violated = set()
    for a, b in itertools.product(acts, acts):
        sub = [p for x, p in proj if x in (a, b)]
        for ot, ot2 in itertools.product(types, types):
            seen = {}
            for p in sub:
                if seen.setdefault(p[ot], p[ot2]) != p[ot2]:
                    violated.add((ot, ot2, a, b))
                    break
    return {
        "acts": acts, "types": types,
        "df": {k: sorted(map(list, v)) for k, v in df.items()},
        "start": {k: sorted(v) for k, v in start.items()},
        "end": {k: sorted(v) for k, v in end.items()},
        **{k: {a: sorted(v) for a, v in m.items()} for k, m in mult.items()},
        "ident_violated": sorted(map(list, violated)),
    }


# ======================================================================= tree side
def leaves(n):
    if "op" in n:
        for c in n["children"]:
            yield from leaves(c)
    elif n["act"]:
        yield n


def is_res(n, ot):
    """res(S): every (non-tau) leaf of S related to ot allows divergence for ot.
    INTERPRETATION: the paper says 'all leaf nodes'; unrelated leaves are ignored here."""
    return all(ot in l["div"] for l in leaves(n) if ot in l["rel"])


def dfr(n, ot, literal_leaf_skip):
    """Returns (df, start, end, sigma, skip) for object type ot (Sec. 3.3)."""
    if "op" not in n:
        a = n["act"]
        if a and ot in n["rel"]:
            return ({(a, a)} if ot in n["div"] else set()), {a}, {a}, {a}, ot in n["div"]
        # Paper: skip_ot(leaf) = ot in div_a. A tau leaf or a leaf unrelated to ot would then
        # be non-skippable for ot. INTERPRETATION (default): such leaves are skippable.
        skip = (ot in n["div"]) if literal_leaf_skip else True
        return set(), set(), set(), set(), skip
    kids = [dfr(c, ot, literal_leaf_skip) for c in n["children"]]
    op = n["op"]
    if op == "id":
        return kids[0]
    D = set().union(*(k[0] for k in kids))
    S = set().union(*(k[3] for k in kids))
    res = [is_res(c, ot) for c in n["children"]]
    idx = range(len(kids))
    if op == "par":                                                     # eqs. 1-6
        st = set().union(*(k[1] for k in kids))
        en = set().union(*(k[2] for k in kids))
        for i, j in itertools.permutations(idx, 2):
            D |= set(itertools.product(kids[i][3], kids[j][3]))
        return D, st, en, S, all(k[4] for k in kids)
    if op == "xor":                                                     # eqs. 7-9
        st = set().union(*(k[1] for k in kids))
        en = set().union(*(k[2] for k in kids))
        for i, j in itertools.permutations(idx, 2):
            if res[i] and res[j]:
                D |= set(itertools.product(kids[i][3], kids[j][3]))
        return D, st, en, S, any(k[4] for k in kids)
    if op == "seq":                                                     # eqs. 10-14
        st = set().union(*(kids[i][1] for i in idx if all(kids[j][4] for j in range(i))), set())
        en = set().union(*(kids[i][2] for i in idx if all(kids[j][4] for j in range(i + 1, len(kids)))), set())
        for i, j in itertools.combinations(idx, 2):
            if all(kids[l][4] for l in range(i + 1, j)):
                D |= set(itertools.product(kids[i][2], kids[j][1]))
            if all(res[l] for l in range(i, j + 1)):
                D |= set(itertools.product(kids[i][3], kids[j][3]))
        return D, st, en, S, all(k[4] for k in kids)
    if op == "loop":                                                    # loop text, Sec. 3.3
        body, redo = kids[0], kids[1:]
        st, en = set(body[1]), set(body[2])
        if body[4]:
            for r in redo:
                st |= r[1]
                en |= r[2]
        for r in redo:
            D |= set(itertools.product(body[2], r[1])) | set(itertools.product(r[2], body[1]))
        if any(r[4] for r in redo):
            D |= set(itertools.product(body[2], body[1]))
        if body[4]:
            for r1, r2 in itertools.product(redo, redo):
                D |= set(itertools.product(r1[2], r2[1]))
        for i, j in itertools.permutations(idx, 2):
            if res[i] and res[j]:
                D |= set(itertools.product(kids[i][3], kids[j][3]))
        # INTERPRETATION: the paper does not state skip for loops; a loop is skippable iff its body is.
        return D, st, en, S, body[4]
    raise ValueError(op)


def tree_abstraction(tree, literal_leaf_skip=False):
    types = sorted({t for l in leaves(tree) for t in l["rel"]})
    acts = sorted({l["act"] for l in leaves(tree)})
    out = {"acts": acts, "types": types, "df": {}, "start": {}, "end": {}}
    for ot in types:
        D, st, en, _, _ = dfr(tree, ot, literal_leaf_skip)
        out["df"][ot], out["start"][ot], out["end"][ot] = sorted(map(list, D)), sorted(st), sorted(en)
    mult = {k: defaultdict(set) for k in MULT}

    def walk(n, path):
        if "op" in n:
            for c in n["children"]:
                walk(c, path + [n["op"]])
            return
        if not n["act"]:
            return
        a = n["act"]
        for ot in n["rel"]:
            mult["rel"][a].add(ot)
            if ot in n["con"]:
                mult["con"][a].add(ot)
            if ot in n["def"]:
                mult["def"][a].add(ot)
            if ot in n["div"] or "loop" in path:
                mult["div"][a].add(ot)   # rel_{a>1,ot}: leaf allows it or a loop on the path
            if ot in n["div"] or "xor" in path:
                mult["opt"][a].add(ot)   # rel_{a<1,ot}: leaf allows it or a choice on the path

    walk(tree, [])
    out.update({k: {a: sorted(v) for a, v in m.items()} for k, m in mult.items()})
    # identity: explicit relations + transitive closure per activity pair
    explicit = defaultdict(set)

    def collect(n):
        if "op" in n:
            if n["op"] == "id":
                under = {l["act"] for l in leaves(n)}
                for a, b in itertools.product(under, under):
                    explicit[(a, b)].add((n["left"], n["right"]))
                    if n["kind"] == "Sync":       # Sync = implication in both directions
                        explicit[(a, b)].add((n["right"], n["left"]))
            for c in n["children"]:
                collect(c)

    collect(tree)
    enforced = set()
    for (a, b), edges in explicit.items():
        closure = set(edges)
        while True:
            new = {(x, z) for x, y in closure for y2, z in closure if y == y2 and x != z} - closure
            if not new:
                break
            closure |= new
        enforced |= {(x, y, a, b) for x, y in closure}
    out["ident_enforced_explicit"] = sorted(map(list, enforced))
    return out


# ======================================================================= conformance
def conformance(log, tree):
    acts = sorted(set(log["acts"]) | set(tree["acts"]))
    types = sorted(set(log["types"]) | set(tree["types"]))

    def has(abs_, key, *k):
        if key in ("df",):
            return [k[1], k[2]] in abs_["df"].get(k[0], [])
        if key in ("start", "end"):
            return k[1] in abs_[key].get(k[0], [])
        return k[1] in abs_[key].get(k[0], [])

    pats = {"control": [], "multiplicity": [], "identity": []}
    for a, b, ot in itertools.product(acts, acts, types):
        pats["control"].append((("df", ot, a, b), has(log, "df", ot, a, b), has(tree, "df", ot, a, b)))
    for key in ("start", "end"):
        for a, ot in itertools.product(acts, types):
            pats["control"].append(((key, ot, a), has(log, key, ot, a), has(tree, key, ot, a)))
    for a, ot in itertools.product(acts, types):
        for key in MULT:
            pats["multiplicity"].append(((key, a, ot), has(log, key, a, ot), has(tree, key, a, ot)))
    viol = {tuple(x) for x in log["ident_violated"]}
    expl = {tuple(x) for x in tree["ident_enforced_explicit"]}
    trel = defaultdict(set, {a: set(v) for a, v in tree["rel"].items()})
    for a, b, ot, ot2 in itertools.product(acts, acts, types, types):
        # tree pattern is 0 iff every log of L(S) satisfies the implication: explicitly
        # enforced, trivial (ot == ot'), or ot' unrelated to a and b in the tree.
        trivially = ot == ot2 or ot2 not in (trel[a] | trel[b])
        tree_one = not ((ot, ot2, a, b) in expl or trivially)
        pats["identity"].append((("ident", ot, ot2, a, b), (ot, ot2, a, b) in viol, tree_one))
    fit, prec, counts, ones = [], [], {}, {}
    for cat, ps in pats.items():
        L = sum(1 for _, l, _ in ps if l)
        M = sum(1 for _, _, m in ps if m)
        B = sum(1 for _, l, m in ps if l and m)
        fit.append(B / L if L else 1.0)
        prec.append(B / M if M else 1.0)
        counts[cat] = {"patterns": len(ps), "log_ones": L, "tree_ones": M, "both": B}
        ones[cat] = {"log": sorted(list(map(str, p)) for p, l, _ in ps if l),
                     "tree": sorted(list(map(str, p)) for p, _, m in ps if m)}
    return {"fitness": fit, "precision": prec,
            "overall": [sum(fit) / 3, sum(prec) / 3], "counts": counts, "ident_ones": ones["identity"]}


def main():
    d = sys.argv[1]
    literal = "--literal-leaf-skip" in sys.argv
    events, tree = load(f"{d}/events.json"), load(f"{d}/tree.json")
    log, tr = log_abstraction(events), tree_abstraction(tree, literal)
    out = {"log": log, "tree": tr, "conformance": conformance(log, tr),
           "mode": "literal leaf skip" if literal else "interpreted"}
    dump(f"{d}/out_paper{'_literal' if literal else ''}.json", out)


if __name__ == "__main__":
    main()
