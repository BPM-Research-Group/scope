import ast, sys, enum
src = open(sys.argv[1]).read()
fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "dfg_recursion")
class Operator(enum.Enum):
    SEQUENCE=1; XOR=2; PARALLEL=3; LOOP=4
class PT:
    def __init__(s, operator=None, children=(), label=None): s.operator, s.children, s.label = operator, list(children), label
ns = {"Operator": Operator}
exec(compile(ast.Module([fn], []), "dfg", "exec"), ns)
d = ns["dfg_recursion"]
L = lambda x: PT(label=x)
def show(name, t):
    dfg, st, en, opt, _ = d(t)
    print(f"{name:32s} df={sorted(dfg)} start={sorted(st)} end={sorted(en)} skip={opt}")
show("seq(a, seq(b,c))", PT(Operator.SEQUENCE, [L("a"), PT(Operator.SEQUENCE, [L("b"), L("c")])]))
show("seq(par(seq(a,b),c), d)", PT(Operator.SEQUENCE, [PT(Operator.PARALLEL, [PT(Operator.SEQUENCE,[L("a"),L("b")]), L("c")]), L("d")]))
show("seq(a, xor(b,tau), c)", PT(Operator.SEQUENCE, [L("a"), PT(Operator.XOR,[L("b"), PT()]), L("c")]))
show("par(a, tau)", PT(Operator.PARALLEL, [L("a"), PT()]))
show("seq(a, par(b,tau), c)", PT(Operator.SEQUENCE, [L("a"), PT(Operator.PARALLEL,[L("b"), PT()]), L("c")]))
show("loop(a, b)", PT(Operator.LOOP, [L("a"), L("b")]))
show("seq(a,b) [ends?]", PT(Operator.SEQUENCE, [L("a"), L("b")]))
