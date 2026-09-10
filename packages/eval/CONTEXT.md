# Data Evaluation

Data Evaluation defines the shared evaluation language for data engineering, data analysis, and data science. Data-analysis evaluation is its first complete implementation, not the default form of every task.

## Language

**DataScope**: A logical data-project namespace that identifies governed data assets and references the Environment and Context bindings allowed for that project. It is neither a physical database project nor a Cordis registration scope. _Avoid_: Project, database project, K11 when referring to the general concept

**Benchmark Pack**: An independently versioned collection of case manifests, reusable policies, requirements, provenance, and aggregation declarations that defines what is measured. _Avoid_: Case directory, test data folder

**Case Manifest**: The stable identity and shallow aggregate for one benchmark case, with explicit references to public material, private grading material, policies, and requirements. _Avoid_: EvalCase, case YAML when referring to the canonical concept

**Public Task Material**: The compiled task content that a Harness may expose to the evaluated agent. It excludes reference answers, hidden tests, grading secrets, and private scorer inputs. _Avoid_: Full case, sanitized case

**Private Grading Material**: The reference, oracle, hidden tests, and other restricted inputs available only through an authorized grader provider. _Avoid_: Expected fields, answer payload

**Resolved Grading Plan**: The immutable, content-identified grading mechanism and Benchmark policy produced before a run. A grader consumes this plan without resolving defaults or selecting a comparator during grading. _Avoid_: Grader config, match mode

**Evidence Envelope**: The shared identity, correlation, provenance, lifecycle, and artifact-reference fields around one versioned extension-owned evidence payload. _Avoid_: Universal evidence object, SQL result when referring to the shared concept

**Metric Observation**: One unaggregated measurement tied to its metric identity, measured subject and population, partition, replicate, grader provenance, and source evidence. _Avoid_: Score

**Aggregate Measurement**: A measurement derived from identified observations under an explicit estimand, aggregation rule, and uncertainty method. _Avoid_: Summary score, pass-k when the aggregation semantics are not stated

**Environment Assurance**: The evidence-backed level of control an evaluation run has over environment state, finality, and cross-run separation: managed, attached snapshot, or observational. It describes proven guarantees rather than deployment location. _Avoid_: Environment type, local versus remote

**Evaluation Subject**: The explicitly identified product composition or module interface whose behavior an evaluation claim describes. Product-composition and component subjects cannot be silently substituted or aggregated. _Avoid_: Target, agent when the measured subject is narrower or broader

**Evaluation Operation**: The declared operation performed on a subject or its evidence, such as controlled run, shadow observation, rescore, reproject, model rerun, or environment re-execution. _Avoid_: Replay as an umbrella for operations with different external effects
