---
type: research
status: open
assignee: null
blocked_by: []
---

# CL-30: hybrid retrieval 融合策略复验

## Question

CL-5 选择的 coverage-weighted continuous blend 是否仍优于 weighted reciprocal-rank fusion，以及“图只扩展候选、内容检索负责重排”的策略？

实验必须：

1. 复用 CL-4 alias-dependent protected slice，并增加代表生产分布的非 alias、concept、join 和 metric 切片。
2. 比较当前 continuous blend、weighted RRF、graph candidate expansion + BM25/embedding rerank。
3. 使用同一 corpus、同一 query set、同一 top-k 和 paired run；记录 case-level gained/lost 与失败归因。
4. 分别报告 retrieval recall、downstream SQL/delivery、延迟和 token 成本，不能只用 aggregate pass rate。
5. 在生产与 eval 共享同一 projection 路径后再作最终默认策略决定。
