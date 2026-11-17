"""Runs the paper's Python implementation (Nik314/OCPT-Conformance-Checking) on one case.

Usage: python run_python.py <repo_dir> <shim_dir> <case_dir>
<shim_dir> holds a pure-Python fast_hash.py (same logic as fast_hash.pyx).
Writes <case_dir>/out_python.json.
"""
import json
import sys
import traceback

repo, shim, case = sys.argv[1:4]
sys.path[:0] = [shim, repo, __file__.rsplit("/", 1)[0]]

import pm4py  # noqa: E402
from pm4py.objects.process_tree.obj import Operator  # noqa: E402
from src.conformance import get_fitness, get_patterns, get_precision  # noqa: E402
from src.log_abstraction import get_log_abstraction  # noqa: E402
from src.oc_process_trees import LeafNode, OperatorNode  # noqa: E402
from src.tree_abstraction import get_tree_abstraction  # noqa: E402

from common import dump, load  # noqa: E402

OPS = {"seq": Operator.SEQUENCE, "xor": Operator.XOR, "par": Operator.PARALLEL, "loop": Operator.LOOP}


def build(n):
    if "op" in n:
        if n["op"] == "id":
            # The repo encodes identity nodes as OperatorNode((ot1, ot2), [child]); it has no
            # notion of relation kinds, so Sync and ImpOrdered map to the same directed tuple.
            return OperatorNode((n["left"], n["right"]), [build(n["children"][0])])
        return OperatorNode(OPS[n["op"]], [build(c) for c in n["children"]])
    return LeafNode(activity=n["act"] or "", related=set(n["rel"]), divergent=set(n["div"]),
                    convergent=set(n["con"]), deficient=set(n["def"]))


def norm(abs_):
    dfgs, rel, div, con, defi, opt, ident = abs_
    s = lambda d: {k: sorted(v) for k, v in d.items()}  # noqa: E731
    return {
        "df": {ot: sorted([list(k) for k, v in d[0].items() if v]) for ot, d in dfgs.items()},
        "start": {ot: sorted(k for k, v in d[1].items() if v) for ot, d in dfgs.items()},
        "end": {ot: sorted(k for k, v in d[2].items() if v) for ot, d in dfgs.items()},
        "rel": s(rel), "div": s(div), "def": s(defi), "con": s(con), "opt": s(opt),
        "ident": sorted(map(list, ident)),
    }


try:
    relations = pm4py.read_ocel2_json(f"{case}/log.json").relations
    log_abs, _ = get_log_abstraction(relations)
    tree_abs, _ = get_tree_abstraction(build(load(f"{case}/tree.json")))
    pl, pt = get_patterns(log_abs, tree_abs)
    out = {
        "log": norm(log_abs), "tree": norm(tree_abs),
        "conformance": {
            "fitness": get_fitness(log_abs, tree_abs),
            "precision": get_precision(log_abs, tree_abs),
            "counts": {cat: {"patterns": len(l), "log_ones": sum(map(bool, l)), "tree_ones": sum(map(bool, t)),
                             "both": sum(1 for x, y in zip(l, t) if x and y)}
                       for cat, l, t in zip(["control", "multiplicity", "identity"], pl, pt)},
        },
    }
    f, p = out["conformance"]["fitness"], out["conformance"]["precision"]
    out["conformance"]["overall"] = [sum(f) / 3, sum(p) / 3]
except Exception:
    out = {"error": traceback.format_exc()}
dump(f"{case}/out_python.json", json.loads(json.dumps(out, default=list)))
