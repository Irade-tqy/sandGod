# 启灵沙盘 MCP 玩家

游戏通过 MCP Streamable HTTP 连接玩家服务，并调用服务提供的 `qiling_choose` 工具。每次调用的参数包含 `phase`、`rules`、`state` 和 `legalActions`。`state` 是该玩家视角的局面，不包含未公开的对方位置。工具需要返回 JSON 对象（MCP structured content 或 JSON 文本）。

- `phase: "weights"`：返回 `{"weights":[上,右,下,左]}`，四个整数均至少为 1，总和为 100。
- `phase: "start"`：返回 `{"col":0}`，列编号为 0 至 8。
- `phase: "action"`：返回 `{"action":数字}`，数字必须包含在 `legalActions` 中；位置及方向按该玩家的棋盘视角表示。

工具调用超时为 100 秒。每局使用独立 MCP 会话，对局结束或退出时关闭会话。
