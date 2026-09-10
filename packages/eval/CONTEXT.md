# Data Evaluation

Data Evaluation defines the shared evaluation language for data engineering, data analysis, and data science. Data-analysis evaluation is its first complete implementation, not the default form of every task.

## Language

**DataScope**:
A logical data-project namespace that identifies governed data assets and references the Environment and Context bindings allowed for that project. It is neither a physical database project nor a Cordis registration scope.
_Avoid_: Project, database project, K11 when referring to the general concept

**Benchmark Pack**:
An independently versioned collection of case manifests, reusable policies, requirements, provenance, and aggregation declarations that defines what is measured.
_Avoid_: Case directory, test data folder

**Case Manifest**:
The stable identity and shallow aggregate for one benchmark case, with explicit references to public material, private grading material, policies, and requirements.
_Avoid_: EvalCase, case YAML when referring to the canonical concept

**Public Task Material**:
The compiled task content that a Harness may expose to the evaluated agent. It excludes reference answers, hidden tests, grading secrets, and private scorer inputs.
_Avoid_: Full case, sanitized case

**Private Grading Material**:
The reference, oracle, hidden tests, and other restricted inputs available only through an authorized grader provider.
_Avoid_: Expected fields, answer payload

**Resolved Grading Plan**:
The immutable, content-identified grading mechanism and Benchmark policy produced before a run. A grader consumes this plan without resolving defaults or selecting a comparator during grading.
_Avoid_: Grader config, match mode
