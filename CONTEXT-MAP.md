# Context Map

## Contexts

- [Data Evaluation](./packages/eval/CONTEXT.md): defines data-domain benchmark identity, task material, grading, and run evidence across data engineering, data analysis, and data science.
- [Task DAG execution](./wayfinder/task-orchestration-dag/CONTEXT.md): defines named execution choices and executor integration without taking ownership of native executor lifecycles.

## Relationships

- **Data Evaluation → Data Agent runtime**: Data Evaluation evaluates data-agent compositions without making one DataScope, backend, or Context implementation part of the shared protocol.
