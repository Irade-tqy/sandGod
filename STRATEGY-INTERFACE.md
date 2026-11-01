# 启灵沙盘：从零编写天梯选手

> 开发中：天梯提交、代码评测和在线对战尚未开放。下面是当前接口设计与入门示例；正式开放前可能调整。

## 1. 你要做什么？

你要编写一个“选手”：程序收到自己能看到的局面，决定下一步。平台负责检查决定是否合法、执行行动、随机移动棋子和判断胜负；你不需要自己实现整套游戏。

| 提交方式 | 需要准备 | 能做什么 |
| --- | --- | --- |
| C / C++ 源码 | 一个 .c 或 .cpp 源文件 | 平台编译后在隔离环境中评测；第一版不提供线上挑战 |
| MCP 地址 | 自己运行的 MCP 服务的公网 HTTPS 地址 | 参加评测；服务在线时，玩家也可以发起对局 |

源码单次上传不超过 **10 MiB**；当前按单个 UTF-8 源文件设计。两种方式采用相同的游戏消息。不需要提交自己的数据库密钥或模型训练代码。

### MCP 是什么？

MCP（Model Context Protocol）是一种让程序通过标准方式调用工具的协议。你可以把它想成：你的程序在网络上提供一个名为 qiling_choose 的工具；游戏把局面传给这个工具，工具返回你的决定。

MCP 不代表必须使用大模型。简单的规则程序也可以是 MCP 选手。你需要让服务持续运行，并提供可从公网访问的 HTTPS 地址；服务离线时，玩家不能和它对战。平台每次调用的超时时间为 **100 秒**。

## 2. 游戏怎样询问你的选手？

平台会发送一个 JSON 对象。JSON 是用文字表示数据的格式：花括号表示对象，方括号表示列表。

~~~json
{
  "phase": "action",
  "rules": "这里是当前规则说明",
  "state": {
    "ready": true,
    "chosen": true,
    "position": 76,
    "turn": "you",
    "ownFirst": true,
    "boundary": 0,
    "rounds": 0,
    "manualAvailable": false,
    "pendingManual": false,
    "canPass": false,
    "walls": [],
    "history": [],
    "opponentPosition": null
  },
  "legalActions": [4, 5, 60]
}
~~~

上例为方便阅读省略了一部分 state 字段。phase 表示平台正在问哪一个问题：

| phase | 问题 | 合法回答示例 |
| --- | --- | --- |
| weights | 开局选择四个方向的移动概率 | {"weights":[25,25,25,25]} |
| start | 选择起始行的哪一列 | {"col":4} |
| action | 选择行动 | {"action":4}，前提是 4 在 legalActions 中 |

weights 的顺序是**上、右、下、左**，以该选手自己的棋盘视角为准。四个数字必须是至少 1 的整数，总和为 100。例如 [40,20,20,20] 表示向上的权重为 40%。col 从左到右为 0–8，4 是中间一列。

行动阶段只能返回这次 legalActions 列表里的一个整数。每次都要重新读取列表：特殊阶段中，同一个数字可能有不同含义。如果返回不合法、超时或无法运行，提交或该场评测会报错，不计入 Elo。当前开发版本对单场评测设有 15 分钟总时长上限，在每次请求结束时检查；超时未完成的对局不计分。

### 选手能看到什么？

- state.position：自己的位置，范围为 0–80。行和列从 0 开始，位置等于“行 × 9 + 列”；例如 76 = 8 × 9 + 4。自己的起始行位于视角的底部。
- state.walls：墙的列表。每项有 id、orientation、row、col、length、owned、opponentOwned；对手的墙边不能重合，自己的墙不能完全重合。orientation 为 0 表示横墙，为 1 表示竖墙。
- state.debris：灰色残骸的墙边列表；每项 q 是方格编号，k 为 1 表示右边、2 表示下边。落在残骸上的墙边不阻挡移动。三段墙逐段判断：例如只有一段压到残骸时，其余两段仍能阻挡。移动时优先从不穿过己方叠在残骸上的墙段的可走方向中按权重抽取；没有这类方向时才从全部可走方向抽取。每次缩圈清除旧残骸，并仅在缩圈后保留的区域内为移除的墙生成新残骸。
- state.history：公开行动记录。player 为 0 表示自己，为 1 表示另一方；text 是文字描述。
- state.boundary：左右各缩去的列数。例如 1 表示左右各一列不可用；rounds 是双方各行动一次后的完整回合数，每 10 回合缩圈。
- state.ownFirst：自己是否为先手；canPass 表示单列阶段或没有合法墙操作时可以继续随机移动；本规则不提供自主移动。
- 对局进行中，state.opponentPosition 是 null，表示**未知**，不是坐标 0。不能读取对手的隐藏位置。

state 还可能包含合法行动、墙数和胜负等字段。以后可能增加字段，建议忽略自己不认识的字段；策略只能根据收到的信息推理。

### 行动编号（进阶）

刚开始可以直接从 legalActions 选一个数字。想根据位置选择墙时，可以使用下表。行、列从 0 开始，均为选手自己的视角：

| 情况 | 编号 |
| --- | --- |
| 放横墙 | 4 + row × 7 + col；row 为 0–7，col 为 0–6 |
| 放竖墙 | 4 + 56 + row × 8 + col；row 为 0–6，col 为 0–7 |
| 拆除自己的墙 | 116 + 墙的 id；墙 id 等于其放置编号减 4 |
| 棋盘只剩一列，或没有合法墙操作 | 4 表示继续随机移动 |

所以 **4 不总是同一个动作**：先看 canPass，再结合 legalActions。任何时候都以平台发来的合法行动列表为准。

## 3. 第一个 C++ 选手

下面的程序固定选择均等概率和中间起点，每次返回第一个合法行动。它演示消息如何进入程序、决定如何返回；之后可以把选墙逻辑改成自己的策略。

1. 新建名为 player.cpp 的纯文本文件。
2. 将下面完整内容复制进去，保存为 UTF-8。
3. 本机安装 C++ 编译器后，可按下方步骤试运行。正式提交时预计上传源文件，由平台编译。

~~~cpp
#include <cctype>
#include <cstdlib>
#include <iostream>
#include <string>

// 仅演示需要的字段；复杂策略请使用完整 JSON 解析器。
std::string stringField(const std::string& json, const std::string& key) {
    auto p = json.find("\"" + key + "\"");
    if (p == std::string::npos) return "";
    p = json.find(':', p);
    if (p == std::string::npos) return "";
    p = json.find('"', p + 1);
    if (p == std::string::npos) return "";
    auto end = json.find('"', p + 1);
    return end == std::string::npos ? "" : json.substr(p + 1, end - p - 1);
}

bool firstLegalAction(const std::string& json, int& action) {
    auto p = json.find("\"legalActions\"");
    if (p == std::string::npos) return false;
    p = json.find('[', p);
    if (p == std::string::npos) return false;
    ++p;
    while (p < json.size() && std::isspace(static_cast<unsigned char>(json[p]))) ++p;
    if (p >= json.size() || json[p] == ']') return false;
    char* end = nullptr;
    long value = std::strtol(json.c_str() + p, &end, 10);
    if (end == json.c_str() + p || value < 0 || value > 227) return false;
    action = static_cast<int>(value);
    return true;
}

int main() {
    std::string request;
    if (!std::getline(std::cin, request)) return 1;
    const std::string phase = stringField(request, "phase");
    if (phase == "weights") {
        std::cout << "{\"weights\":[25,25,25,25]}\n";
    } else if (phase == "start") {
        std::cout << "{\"col\":4}\n";
    } else if (phase == "action") {
        int action;
        if (!firstLegalAction(request, action)) return 1;
        std::cout << "{\"action\":" << action << "}\n";
    } else {
        return 1;
    }
    return 0;
}
~~~

在 Linux 或 macOS 终端中，本机编译并运行：

~~~bash
g++ -std=c++17 player.cpp -o player
./player
~~~

程序会等待输入。粘贴下面**一整行**并按回车：

~~~json
{"phase":"action","rules":"示例","state":{},"legalActions":[4,5,60]}
~~~

预期输出是 {"action":4}。再运行一次程序，输入 {"phase":"start","rules":"示例","state":{},"legalActions":[]}，应输出 {"col":4}。

开发中的评测器在每次请求时启动新的隔离进程，通过**标准输入**发送一行 JSON，从**标准输出**读取一个 JSON 对象。不要在标准输出打印欢迎语或调试日志；调试信息可写到标准错误。不能依赖上次进程里的变量或本地文件保留记忆。示例使用简化解析器，不适合任意复杂 JSON；复杂策略应在单个源码文件中使用可靠的 JSON 解析代码。

## 4. 第一个 MCP 选手

下面是采取同样简单策略的 Node.js 服务。它是**本机入门练习**；公开提供服务时，需要持续运行的机器和配置好的公网 HTTPS 入口。不要把数据库服务密钥写进服务代码。

先准备 Node.js，在一个新文件夹中运行：

~~~bash
npm init -y
npm install @modelcontextprotocol/sdk@1.32.2 express zod
~~~

新建 player.mjs，复制：

~~~javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import * as z from 'zod/v4';

function makeServer() {
  const server = new McpServer({ name: 'my-qiling-player', version: '1.0.0' });
  server.registerTool('qiling_choose', {
    description: '为启灵沙盘选择开局设置或行动',
    inputSchema: {
      phase: z.enum(['weights', 'start', 'action']),
      rules: z.string(),
      state: z.unknown(),
      legalActions: z.array(z.number().int())
    }
  }, async ({ phase, legalActions }) => {
    let answer;
    if (phase === 'weights') answer = { weights: [25, 25, 25, 25] };
    else if (phase === 'start') answer = { col: 4 };
    else if (legalActions.length) answer = { action: legalActions[0] };
    else return { isError: true, content: [{ type: 'text', text: '没有合法行动' }] };
    return { content: [{ type: 'text', text: JSON.stringify(answer) }] };
  });
  return server;
}

// 入门示例只监听本机，不能直接从公网访问。
const app = createMcpExpressApp();
app.post('/mcp', async (req, res) => {
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) res.status(500).json({
      jsonrpc: '2.0', error: { code: -32603, message: '服务错误' }, id: null
    });
  }
});
app.listen(8787, '127.0.0.1', () => console.log('服务已启动：http://127.0.0.1:8787/mcp'));
~~~

运行 node player.mjs 后，让这个终端保持打开。然后在**同一个文件夹**中新建 test.mjs，复制下面的测试程序：

~~~javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'player-test', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(
  new URL('http://127.0.0.1:8787/mcp')
));
const result = await client.callTool({
  name: 'qiling_choose',
  arguments: {
    phase: 'action',
    rules: '测试规则',
    state: {},
    legalActions: [4, 5, 60]
  }
});
console.log(result.content);
await client.close();
~~~

打开**另一个终端**，进入同一个文件夹，运行 node test.mjs。输出的文字内容应包含 {"action":4}。这个测试客户端模仿游戏发起一次工具调用；服务仍会在第一个终端中运行，按 Ctrl+C 可以停止它。

http://127.0.0.1:8787/mcp 只供本机测试，**不能提交给天梯**。

上线需要把服务部署到公网并提供 HTTPS 地址，例如 https://你的域名/mcp；平台目前不支持向选手服务附加私人认证密钥。服务提供者应自行限制资源、验证请求、保护部署环境。开放提交后，将公网地址作为 MCP 方式提交。

## 5. 从“第一个合法行动”继续改进

- 先只改 weights，观察不同方向的权重怎样影响到达对岸的速度。
- 读取 state.position，用 position / 9 和 position % 9 算出自己的行与列。
- 分析 state.walls 和 legalActions，为合法的放墙或拆墙行动打分，返回分数最高的编号。
- 考虑 boundary 会随时间增加，不要只为完整棋盘设计策略。
- 对手位置在对局中不可见。可以根据公开历史估计可能位置，但不能把猜测当成确定事实。

天梯 Elo 只由**天梯选手之间**完成的评测对局计算；人类对战不改变 Elo。代码选手第一版只参加评测；只有可用的 MCP 服务才能接受线上挑战。
