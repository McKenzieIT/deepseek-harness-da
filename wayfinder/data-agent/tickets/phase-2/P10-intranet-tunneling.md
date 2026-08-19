# P10 — 内网穿透安全加固

**Type**: prototype
**Phase**: 生产
**Status**: Unblocked

**Question**: 隧道技术（frp/chisel/...）+ TLS 终止 + mTLS + token 轮换/吊销 + 单一信任边界（RBI 门）+ 业务用户工具门禁（不得触达 bash）。

**From G3（per-user 门禁，2026-08-19）**：caller 身份 = web UI per-user 登录（账号+密码，复用 RBI `Tenant`；非端点绑定——同一 addr:port 多用户各有独立登录）+ mTLS。内网 addr:port 由 admin 经 P9 分配。PAT 由用户在 web UI 提交一次（经 mTLS 入 P12 keychain），后续每调用 harness 服务端 resolve→`accessToken(value)`，**不每调用经隧道明文**、不进 process.env。详见 G3 Finding。
