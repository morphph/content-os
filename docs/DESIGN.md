# content-os 设计说明

content-os 把 agentic-os（`morphph/agentic-os`，来源 commit `3262ca00e1de14df4f899df279d314da04415dc2`）里内容生产的五层 workflow 拆成 11 个**可以单独安装、单独发版**的 skill。主要调用方是 Nous Research 的 Hermes Agent，同一套目录也能被 Claude Code 等遵循 agentskills.io / SKILL.md 规范的 agent 使用。

复盘层（YouTube Review、Weekly Review、Metrics）以及 inbox-brief、lead-research、morning-report、morning 不在本仓库范围内。

---

## 1. 查到的 Hermes 事实（决定的依据）

调研方式：本会话的网络策略不允许访问 `hermes-agent.nousresearch.com` 和 `agentskills.io`，所以直接克隆了 `NousResearch/hermes-agent`（commit `fe8b920`，2026-11-18），读的是仓库里的文档源文件和实现代码：

- `website/docs/user-guide/features/skills.md`
- `website/docs/developer-guide/creating-skills.md`
- `website/docs/user-guide/security.md`
- `website/docs/user-guide/features/mcp.md`
- `tools/skills_hub_github.py`、`tools/skills_hub_sources.py`、`tools/skills_hub_models.py`、`tools/skills_tool.py`

| 问题 | 查到的事实 | 出处 |
|---|---|---|
| 目录结构 | 每个 skill 一个目录，`SKILL.md` 必需；可带 `references/`、`templates/`、`scripts/`、`examples/`、`assets/` | skills.md「Skill Directory Structure」 |
| frontmatter | `name`、`description`、`version`、`author`、`license`、`platforms`、`metadata.hermes.{tags, category, related_skills, requires_toolsets, requires_tools, fallback_for_*, config}`、`required_environment_variables`（旧别名 `prerequisites.env_vars`）；兼容 agentskills.io 规范 | creating-skills.md「SKILL.md Format」 |
| 脚本路径 | 加载 skill 时把正文里的 `${HERMES_SKILL_DIR}` 替换成 skill 目录的绝对路径，并在激活消息里给出 `[Skill directory: …]` | creating-skills.md「Referencing bundled scripts」 |
| 渐进加载 | `skills_list` → `skill_view(name)` → `skill_view(name, path)` 按需读 references | skills.md「Progressive Disclosure」 |
| 从 GitHub 安装 | `hermes skills tap add owner/repo`（默认扫描 `skills/` 下的**一级**子目录，不递归）；`hermes skills install owner/repo/skills/<name>`；`hermes skills check` / `update` | skills.md「Publishing a custom skill tap」；`_list_skills_in_repo` 只列一级目录 |
| GitHub 安装取哪个版本 | **总是默认分支当前的 tree**（`_get_repo_tree` 读 `default_branch`），identifier 里**没有** ref/tag 参数；锁文件记录 tree sha，用于 `check/update` 判断漂移 | `skills_hub_github.py` `fetch()` |
| 安装时拷哪些文件 | GitHub 安装下载该 skill 目录的完整内容；URL 安装只下载 SKILL.md **明确引用**的 `references/ templates/ scripts/ assets/ examples/` 下的文件和同目录链接文件；目录外（`../`）的文件**一律不拷** | skills.md；`_referenced_support_paths`、`_collect_tree_files` |
| 锁定版本 | URL 安装：`hermes skills install https://…/SKILL.md`，URL 原样存为 identifier，`update` 时从同一 URL 重取。指向某个 tag 的 raw URL 即可锁版本 | skills.md「Direct URL」 |
| skill 互相引用 | 只有 `metadata.hermes.related_skills`（信息性，`skill_view` 返回它）和「skill bundles」（YAML 把多个已安装 skill 一次加载）。没有依赖解析或自动安装 | creating-skills.md；skills.md「Skill Bundles」 |
| 凭证 | `required_environment_variables` 声明后：本地 CLI 加载时安全提示输入并存进 `~/.hermes/.env`；消息平台绝不在聊天里要密钥。**`terminal` / `execute_code` 会剥离敏感环境变量，只有 skill 声明过的变量才会透传给脚本** | skills.md「Secure Setup on Load」；security.md「Environment Variable Passthrough」 |
| 非密钥配置 | `metadata.hermes.config` 写进 `config.yaml` 的 `skills.config`，加载 skill 时把值注入上下文 | skills.md「Skill Config Settings」 |
| MCP | 原生支持，在 `~/.hermes/config.yaml` 的 `mcp_servers` 配 stdio 或 HTTP server | mcp.md |
| 外部目录 | `skills.external_dirs` 可以挂任意目录（例如 git clone 下来的仓库） | skills.md「External Skill Directories」 |
| 体积 | `SKILL.md` 正文超过约 24k 字符时 linter 给出 `oversized-body` **警告**（不阻止） | skills.md「What a skill entry looks like」 |

Claude Code 兼容：Claude Code 读 `~/.claude/skills/<name>/SKILL.md`（或项目 `.claude/skills/`），使用 `name`、`description`；其余字段被忽略。它不会替换 `${HERMES_SKILL_DIR}`，所以 SKILL.md 里所有命令都写成 `<skill-dir>/scripts/…`，并说明 `<skill-dir>` 在 Hermes 下等于 `${HERMES_SKILL_DIR}`，在其他 agent 下是这份 SKILL.md 所在目录。agentskills.io 规范要求 `description` ≤ 1024 字符，本仓库的结构测试按这个上限检查。

---

## 2. 仓库结构

```
content-os/
├── README.md                     # 中文使用说明
├── docs/DESIGN.md                # 本文
├── .env.example                  # 只有变量名和说明，没有真实值
├── package.json                  # npm test / npm run sync / npm run check
├── skills.sh.json                # 给 Hermes Marketplace 的分层分组
├── .github/workflows/ci.yml
│
├── tools/                        # 共用工具的【唯一源码】
│   ├── VERSION                   # 工具版本（tools/v1.0.0）
│   ├── provenance.json           # 逐字移植文件的 sha256
│   ├── lib/
│   │   ├── youtube-research-data.mjs   # 与 agentic-os 逐字节相同
│   │   ├── x-research-data.mjs         # 与 agentic-os 逐字节相同
│   │   └── config.mjs                  # vault / 状态目录 / 时区 / 参数解析
│   ├── youtube-data.mjs          # CLI：youtube_research_data
│   ├── x-data.mjs                # CLI：x_research_data（运行预算、日账本、文件锁）
│   ├── transcript.py             # CLI：转录稿（youtube-transcript-api → yt-dlp）
│   ├── reports.mjs               # CLI：报告路径 / 保存 / 情报输入选取
│   └── github-trending/
│       ├── fetch.py              # 与 agentic-os 逐字节相同
│       └── run.mjs               # 包装：重试、设置输出目录和时区
│
├── shared/references/            # 共用 rubric 的【唯一源码】
│   ├── youtube-data.md           # 来自 agentic-os，登记过改写
│   ├── x-data.md                 # 来自 agentic-os，登记过改写
│   ├── transcript.md             # content-os 新写（agentic-os 没有转录工具）
│   └── provenance.json
│
├── skills/                       # 一级平铺：Hermes tap 只扫一级目录
│   ├── morning-intel/            # 情报（组合）
│   │   ├── SKILL.md
│   │   ├── CHANGELOG.md
│   │   ├── PROVENANCE.md         # 由 provenance.json 生成
│   │   ├── provenance.json       # 来源、改写登记、同步清单
│   │   ├── references/
│   │   │   ├── news-intel.md     # ← 生成：skills/news-intel/SKILL.md 的 rubric 区段
│   │   │   ├── ai-trend-scan.md  # ← 生成
│   │   │   ├── outlier-radar.md  # ← 生成
│   │   │   ├── youtube-data.md   # ← 生成：shared/references
│   │   │   └── x-data.md         # ← 生成
│   │   └── scripts/              # ← 生成：tools/ 的副本
│   ├── news-intel/  ai-trend-scan/  outlier-radar/  github-trending/   # 情报
│   ├── content-opportunities/                                         # 选题
│   ├── deep-research-chase/  yt-pipeline/                             # 研究
│   ├── angle-brainstorm/  outline-build/                              # 制作
│   └── content-cascade/                                               # 分发
│
├── scripts/                      # 仓库维护脚本（不随 skill 安装）
│   ├── sync.mjs                  # tools/ shared/ 兄弟 rubric → 各 skill；--check 查漂移
│   ├── provenance.mjs            # 生成 PROVENANCE.md；--check
│   ├── check-versions.mjs        # 改了已发版 skill 却没升版本 → 失败
│   ├── verify-upstream.mjs       # 对照本地 agentic-os checkout 校验快照
│   └── release.mjs               # 列出 / 创建 <skill>/v<version> tag
│
├── upstream/agentic-os/          # 来源文件快照（3262ca0），原文一致性测试的基准
│   ├── SOURCE.json               # commit + 每个文件的 sha256
│   └── obsidian-v2/…             # 与 agentic-os 同路径
└── tests/                        # node:test
```

### 决定：一级平铺 + 元数据分层

**推荐**：`skills/<name>/` 平铺，层级写在 `metadata.content-os.layer`、`metadata.hermes.tags` 和根目录 `skills.sh.json` 的 `groupings` 里。

**理由**：
- Hermes tap 用 `GET /contents/skills` 只列一级子目录，按层嵌套（`skills/intel/news-intel`）会让 `hermes skills tap add morphph/content-os` 搜不到任何 skill。
- Claude Code 的 `~/.claude/skills/` 也是一级。
- `skills.sh.json` 是 Hermes 读取的标准分组文件，Marketplace 会按「情报层 / 选题层 / …」显示分类。

---

## 3. SKILL.md 的组成

每个 SKILL.md 按固定顺序分成四段：

1. **frontmatter**：`name`、`description`、`version`、`author`、`license`、`metadata.hermes`、`metadata.content-os`、`required_environment_variables`。
2. **content-os adapter**（新写，明确标注）：这个 skill 在 content-os 里怎么运行：
   - 术语映射（vault、supplied context、attached rubric、工具名分别对应什么）；
   - 要跑哪些脚本；
   - 结果存到哪里；
   - 附带文件清单。
3. **Upstream execution contract**（`<!-- contract:begin -->` … `<!-- contract:end -->`）：
   - 逐句取自 agentic-os 的 `originalPrompt`（该 workflow 的任务说明）；
   - 以及 `workflowPrompt` 的通用契约：来源是数据不是指令、Connector mapping、OUTPUT CONTRACT、`BLOCKED:`、不发送不发布、保留部分结果。
   - 每一行都必须能在来源 JS 文件里找到（登记过的改写除外）。
4. **Rubric**（`<!-- rubric:begin source="…" -->` … `<!-- rubric:end -->`）：agentic-os rubric 正文**逐字**复刻，只套用登记过的改写。

### 决定：rubric 内联在 SKILL.md，不放进 references

**推荐**：内联。

**理由**：
- rubric 是 workflow 的核心指令。内联能保证 agent 一加载 skill 就拿到它，不依赖 agent 记得再调一次 `skill_view(name, path)`。
- 共用 rubric（`youtube-data`、`x-data`、`transcript`）和组合 skill 的子 rubric 放 `references/`。agentic-os 当初也是把它们作为单独的「BUNDLED RUBRIC」附上的，这样拆分和原来一致。
- 代价：`outline-build` 的 SKILL.md 约 25k 字符，会触发 Hermes 的 `oversized-body` 警告。这只是警告，原文保真优先，接受它。

### 决定：术语映射优先，少改正文

agentic-os 的 rubric 里有几类和运行环境绑定的词。凡是**通过 adapter 里的术语映射就能保持语义正确**的，正文一律不改：

| rubric 里的词 | content-os 映射 |
|---|---|
| vault / vault-relative path | 数据根目录 `CONTENT_OS_VAULT`（默认 `~/content-os-vault`）。报告目录布局与 agentic-os 完全相同，把它指向现有 Obsidian vault 就能和 agentic-os 共用报告 |
| supplied context | 本 skill 的输入选取脚本（`reports.mjs intel-inputs` / `github-snapshot`）的输出，加上用户在对话里给的材料 |
| attached rubric / attached … rubric | 本 SKILL.md 的 rubric 区段和 `references/` 里的同名文件 |
| `x_research_data` / `youtube_research_data` 工具 | `node <skill-dir>/scripts/x-data.mjs` / `youtube-data.mjs`，参数是同样字段的 JSON |
| installed transcript helper / transcript reader | `python3 <skill-dir>/scripts/transcript.py` |
| WebFetch / web search | 宿主 agent 自带的网页抓取和搜索工具（Hermes：`web_extract` / `web_search`） |

只有映射解决不了的地方才改正文，并登记在 `provenance.json` 里：
- 「The bridge saves / owns / stores …」：content-os 没有 bridge，改为 skill 自己保存并返回全文；
- `agentic_vault` 工具名；
- `America/Chicago` 和 `CT`：agentic-os 用 `zoneText` 按机器时区替换，content-os 改为可配置的 `CONTENT_OS_TZ`；
- runner / cockpit 专属的调用说明；
- 超过 1024 字符的 description。

agentic-os 的 daily drivers（`rubricWithDrivers`）只影响 plan-today / plan-tomorrow 两个规划 rubric，本仓库的 11 个 skill 都不涉及。

---

## 4. 共用工具放在哪里

候选方案：
- (a) 仓库内共享 `tools/`，skill 用相对路径引用；
- (b) `tools/` 作为唯一源码，同步脚本复制进各 skill 的 `scripts/`，CI 查漂移；
- (c) 做成 MCP server。

**推荐：(b) 为主，(c) 作为以后可选的附加形态。**

| 维度 | (a) 相对路径 | (b) 同步副本 | (c) MCP server |
|---|---|---|---|
| 单个 skill 独立安装 | ✗ Hermes 不拷 skill 目录外的文件，装上就坏 | ✓ skill 目录自包含 | ✗ 要另外安装、配置 server |
| 单个 skill 独立发版 | ✗ 版本耦合 | ✓ skill 里的脚本就是它发版时的那份 | 工具版本与 skill 版本分离，需要兼容矩阵 |
| Hermes 支持 | 不支持（见第 1 节） | 原生支持（`scripts/` + `${HERMES_SKILL_DIR}` + 环境变量透传） | 支持，但需要用户改 `config.yaml` |
| Claude Code | 依赖仓库布局 | 直接可用 | 需要 `claude mcp add` |
| 维护成本 | 低 | 低：`npm run sync` 一条命令，CI 拦截漂移 | 中：server 生命周期、协议版本 |
| 凭证 | 环境变量 | 环境变量（Hermes 按 `required_environment_variables` 透传） | server 进程的环境 |
| X 预算账本 | — | 放在 `CONTENT_OS_STATE_DIR`，所有 skill 共用一份日账本 | server 内 |

细节：

- **逐字移植**：
  - `tools/lib/youtube-research-data.mjs`、`tools/lib/x-research-data.mjs`、`tools/github-trending/fetch.py` 与 agentic-os 逐字节相同，`tools/provenance.json` 记录 sha256，测试校验。
  - CLI 只是薄包装，参数白名单与 `vault-mcp.mjs` 相同。
- **凭证**：
  - 只从环境变量读：`YOUTUBE_API_KEY`、`TWITTERAPI_IO_KEY`、`GITHUB_TOKEN`，以及可选的 `X_DATA_DAILY_POST_LIMIT`。
  - 不读任何 `.env` 文件。agentic-os 的 `fetch.py` 只有在没设 `AGENTIC_OS_VAULT` 时才会读 `~/.claude/.env`，包装脚本总是设置这个变量，所以它永远不会读那个文件。
- **X 三级预算**：
  - 每次调用和每天两级由逐字移植的库原样执行。日账本是 `$CONTENT_OS_STATE_DIR/x-data-usage.json`，默认 `~/.content-os/state/x-data-usage.json`。
  - 在 agentic-os 里，「每次运行」= 一个 MCP server 进程的生命周期。CLI 每次调用都是一个新进程，所以改用**运行 ID**：skill 开头执行 `x-data.mjs new-run` 拿到 ID，之后每次调用都带上 `--run <id>`，运行用量记在 `$CONTENT_OS_STATE_DIR/x-runs/<id>.json`。
  - 没带 `--run` 时按「当前小时」归桶，并在结果里加警告。
  - morning-intel 的各部分可能并行调用，所以每次调用都持有一个状态目录文件锁（`mkdir` 锁，120 秒视为陈旧），避免日账本并发写丢失。
- **转录稿**：新写的 `transcript.py`：
  - 首选 `youtube-transcript-api`，优先人工字幕，其次自动字幕，对应 rubric 的「prefer original captions before generated captions」；
  - 失败时退回 `yt-dlp` 字幕下载并解析 VTT；
  - 输出 JSON：方法、语言、是否自动生成、分段时间戳、覆盖时长、全文；
  - 全部失败时 `available:false` 加上每种方法的失败原因，skill 据此返回 `BLOCKED:`；
  - 两个依赖都是可选安装（见 README）。
- **(c) 为什么不做主方案**：Hermes 和 Claude Code 都支持 MCP，但 MCP 要求用户单独安装并配置 server，破坏「装一个 skill 就能用」。将来如果要做，可以由同一份 `tools/lib` 生成一个只读 MCP server。

---

## 5. 组合 skill：morning-intel 怎么复用子 skill

**推荐**：morning-intel 自带子 rubric 的**生成副本**（`references/news-intel.md` 等），副本由 `scripts/sync.mjs` 从兄弟 skill 的 rubric 区段提取，CI 检查副本与源头一字不差。

- **改 news-intel 只改一个地方**：只编辑 `skills/news-intel/SKILL.md`，运行 `npm run sync`，morning-intel 的副本自动更新；忘记同步时 CI 失败。
- **组合 skill 仍然能独立安装**：morning-intel 不要求事先装好 news-intel 等三个 skill。
- **版本一致**：morning-intel 某个版本里带的就是当时的子 rubric。子 rubric 一变，morning-intel 的目录就变了，`check-versions` 会强制它也升版本，因此「morning-intel 1.2.0 用的是哪版 news-intel」永远可以回答。
- **没有选的方案**：
  - 运行时 `skill_view('news-intel')` 引用兄弟 skill：Hermes 没有依赖解析，兄弟没装或版本不同时会静默失效。
  - 用 Hermes bundle：bundle 只是一次加载多个已安装 skill，不解决版本问题。
- `metadata.hermes.related_skills` 仍然列出兄弟 skill，供发现和导航用。

deep-research-chase 依赖 yt-pipeline 的 rubric，用同样的方式附带 `references/yt-pipeline.md`。

---

## 6. 选题层怎么拿到情报报告

agentic-os 由 runner 的 `pipelineInputs` 注入。content-os 把这段逻辑**原样移植**进 `tools/reports.mjs`。

- `reports.mjs intel-inputs`：供 content-opportunities 使用，选取规则与 agentic-os 相同。
  - 当天或昨天最新的组合报告：`inbox/research/morning-intel/*-intel*.md`，按文件名日期排序，同一天再按保存时间；
  - 加上比它更新的单项报告：News Intel `inbox/research/news-intel`、AI Trend Scan `inbox/reports/trend-scan`、Outlier Radar `inbox/research/outlier-radar`、GitHub Trending `inbox/research/github-trending`；
  - 有单项报告时，即使没有组合报告也会选上；
  - 再加上 8 天内最新的 YouTube 周复盘 `inbox/reports/yt-reviews`（有才用）；
  - 单份上限 60,000 字符，总量上限 180,000 字符，超出部分截断并标注；
  - 只读日期开头的 `.md`，跳过 `_index.md`，不跟随指向 vault 外的符号链接；
  - 输出文本与 agentic-os 逐字相同，例如没有报告时的「Intelligence reports: none saved today or yesterday …」，rubric 依赖这些句子。
- `reports.mjs github-snapshot`：供 morning-intel 使用。24 小时内的 GitHub 快照全文附上；更旧的只给出路径和保存时间；没有就说明没有。
- 报告目录可以配置：`CONTENT_OS_VAULT` 或 `--vault`。YouTube 周复盘属于复盘层，不在本仓库，但只要把同一个 vault 交给 agentic-os 或其他工具，写进 `inbox/reports/yt-reviews/` 就会被读到。
- 这些测试移植自 agentic-os 的 `tests/content-pipeline.test.mjs`。

---

## 7. 输出与落盘

agentic-os 是「bridge 负责保存报告」，worker 只返回 Markdown。content-os 没有 bridge，改为两者都做：

1. skill 用 `reports.mjs save --skill <name> [--topic …] --file <tmp.md>`（或通过 stdin）保存完整报告。
   - 路径规则**完全移植**自 `deliverablePathFor` 和 `destinationFor`，例如 `inbox/research/news-intel/2026-11-19-news-1a2b3c4d.md`；
   - 写入是原子的，**从不覆盖**已有文件：撞名时换一个 id；
   - 命令打印保存路径。
2. 最终回答里仍然返回**完整** Markdown，这一条原样保留 agentic-os 的 OUTPUT CONTRACT：不要用回执、摘要或链接代替。

github-trending 例外：和 agentic-os 一样，由确定性脚本自己写快照（`inbox/research/github-trending/YYYY-MM-DD-trending.md`，同一天固定文件名），skill 原样返回脚本生成的报告。

如果宿主没有 terminal 工具（比如只想要 angle 列表），skill 仍然返回全文，并说明没有保存。

---

## 8. 版本化

| 项 | 做法 |
|---|---|
| skill 版本号 | `SKILL.md` frontmatter 顶层 `version:`（Hermes 和 agentskills 工具读取的位置） |
| 变更记录 | 每个 skill 自己的 `CHANGELOG.md`（Keep a Changelog 格式），最新条目必须等于 `version` |
| git tag | `<skill>/v<semver>`，例如 `news-intel/v1.0.0`；工具单独打 `tools/v<semver>` |
| 工具版本与 skill 版本 | `tools/VERSION` 是工具版本，每个 skill 的 `provenance.json` 记录它带的工具版本。改工具 → `npm run sync` → 用到它的 skill 目录变化 → `check-versions` 要求这些 skill 升版本。工具版本只用来追溯，安装与锁定都以 skill 版本为准 |
| 发版守卫 | `scripts/check-versions.mjs`：对每个 skill，如果 `<skill>/v<当前version>` 已存在，而 HEAD 上 `skills/<skill>/` 与该 tag 不同，就失败（改了却没升版本）。tag 不存在表示待发版本，允许 |
| 发版 | 合并到 `main` 后运行 `node scripts/release.mjs --create`，为所有「当前版本还没有 tag」的 skill 打 tag，再 `git push origin --tags` |

### Hermes 里怎么锁定版本

| 方式 | 命令 | 版本行为 |
|---|---|---|
| 锁定某个版本（推荐生产使用） | `hermes skills install https://raw.githubusercontent.com/morphph/content-os/refs/tags/news-intel/v1.0.0/skills/news-intel/SKILL.md` | URL 不变 → 内容不变。`hermes skills update` 从同一个 URL 重取，所以不会漂移。升级时先 `hermes skills uninstall news-intel`，再用新 tag 的 URL 安装 |
| 跟随最新版 | `hermes skills tap add morphph/content-os`，然后 `hermes skills install morphph/content-os/skills/news-intel` | 跟随 `main`；`hermes skills check` / `update` 拉取更新。约定 `main` 上只有已发版状态 |
| 整库挂载 | `git clone --branch <tag> …` 后在 `config.yaml` 的 `skills.external_dirs` 指向 `<clone>/skills` | 整个仓库锁在一个提交上，适合一次性锁定全部 skill |

URL 安装只下载 SKILL.md 明确引用的文件，因此每个 SKILL.md 末尾都有「Bundled files」清单，用反引号列出 `scripts/…`、`references/…` 下的每个文件。结构测试保证清单与目录内容一致。

---

## 9. 测试与 CI

`npm test`（`node --test`），CI 在 Node 20 / 22 上运行，同时装 Python 跑 `transcript.py` 的离线测试：

| 测试 | 内容 |
|---|---|
| `tests/lib-youtube.test.mjs`、`tests/lib-x.test.mjs` | 移植自 agentic-os 的 `youtube-research-data.test.mjs` 和 `x-research-data.test.mjs`。改动只有 import 路径，以及 X 测试里的一个 keep-alive 定时器（原因见下） |
| `tests/tools-cli.test.mjs` | CLI 的参数白名单、跨调用的运行 ID 预算、日账本、并发锁、陈旧锁、错误输出不泄露密钥，以及 github-trending 包装的重试和环境变量 |
| `tests/reports.test.mjs` | 移植自 `content-pipeline.test.mjs` 中 `pipelineInputs` / `destinationFor` 的用例，另外测不覆盖、路径规则 |
| `tests/transcript.test.mjs` | VTT 解析、视频 ID 解析、两种方法都不可用时的 `available:false` |
| `tests/structure.test.mjs` | frontmatter 必填字段与格式；`name` 等于目录名；`description` ≤ 1024；`version` 是 semver 且等于 CHANGELOG 最新条目；Bundled files 清单与磁盘一致；SKILL.md 引用的文件都存在；声明的环境变量都出现在 `.env.example` 里；每个 skill 都在 `skills.sh.json` 里 |
| `tests/fidelity.test.mjs` | **原文一致性**，见下文 |
| `tests/sync.test.mjs` | `sync --check`（tools / shared / 子 rubric 副本无漂移）、`provenance --check`（PROVENANCE.md 是最新生成的） |
| `scripts/check-versions.mjs` | CI 用 `fetch-depth: 0` 拉 tag 后运行 |

**发现的上游问题**：`x-research-data.mjs` 的单次重试用的是 `unref()` 过的定时器。在没有其他待办事项的进程里，Node 会在重试前直接退出。

- agentic-os 的 `x-research-data.test.mjs` 在 Node 22 上因此有 9 个用例被标为 cancelled（不算 fail）。在 agentic-os checkout 里只读运行就能复现。
- 在 MCP server 里，stdin 让进程一直活着，所以这个问题从来没暴露过。
- 但做成 CLI 后，遇到 429 或 5xx 重试时，进程会无输出地退出。
- 处理：`tools/x-data.mjs` 在调用期间持有一个 keep-alive 定时器，移植的测试也加了同样的定时器。库本身保持逐字节不变。

### 原文一致性校验怎么做

- **快照**：`upstream/agentic-os/` 保存 3262ca0 时的来源文件，`SOURCE.json` 记录 sha256。
  - 测试先校验快照本身没被改过；
  - `scripts/verify-upstream.mjs --agentic-os <checkout>` 可以拿真实 checkout 的 `git show 3262ca0:<path>` 逐字节比对。本次初始化时已经跑过。
- **rubric 区段（exact 模式）**：把登记过的改写按顺序作用到来源文件（有 frontmatter 的取正文），结果必须与 SKILL.md 里的 rubric 区段**完全相等**。
  - 每条改写的 `original` 必须在来源里出现，`replacement` 必须在结果里出现，否则测试失败；
  - 这比「每一行都能在来源里找到」更严：不允许删句、调换顺序或多加一行。
- **contract 区段（fragments 模式）**：每一行去掉列表符号后，先把登记过的改写反向还原，必须是来源 JS 文件的子串；JS 的 `\'` 转义会先还原。
  - 新写的说明只能放在 adapter 段，不能混进 contract 段。
- **frontmatter 字段**：来源本身是 SKILL.md 的（angle-brainstorm、outline-build、github-trending），`description` 必须等于来源，或者按登记的改写得到。
- **共用 reference**（`shared/references/youtube-data.md`、`x-data.md`）：exact 模式。
- **逐字节文件**：两个工具库和 `fetch.py` 必须与快照完全相同。

---

## 10. Hermes 调用方式

```bash
# 安装（锁版本）
hermes skills install https://raw.githubusercontent.com/morphph/content-os/refs/tags/morning-intel/v1.0.0/skills/morning-intel/SKILL.md --category content-os

# 凭证：本地 CLI 首次加载时 Hermes 会安全地提示输入；也可以写进 ~/.hermes/.env
# 非密钥配置：CONTENT_OS_VAULT / CONTENT_OS_STATE_DIR / CONTENT_OS_TZ（环境变量）
```

在聊天或消息平台里：

```
/github-trending
/morning-intel
/content-opportunities
/deep-research-chase Claude Code sub-agents
/angle-brainstorm 第 2 个选题的 seed
/outline-build 选第 3 个角度
……录制、上传……
/content-cascade https://www.youtube.com/watch?v=XXXXXXXXXXX
```

定时任务可以用 Hermes 的 cron 或 blueprint，例如每天 7:30 跑 `/github-trending`、7:40 跑 `/morning-intel`。本仓库不内置调度，避免替用户决定时间。

---

## 11. 与 agentic-os 的对应关系

| content-os skill | 层 | agentic-os rubric | `originalPrompt` / `deliverablePathFor` key | 附带 references | 附带 scripts |
|---|---|---|---|---|---|
| morning-intel | 情报（组合） | `morning-intel.md` | `morning-intel` | news-intel, ai-trend-scan, outlier-radar, youtube-data, x-data | youtube-data, x-data, reports |
| news-intel | 情报 | `news-intel.md` | `news-intel` | youtube-data, x-data | youtube-data, x-data, reports |
| ai-trend-scan | 情报 | `ai-trend-scan.md` | `ai-trend-scan` | youtube-data, x-data | youtube-data, x-data, reports |
| outlier-radar | 情报 | `outlier-radar.md` | `outlier-radar` | youtube-data | youtube-data, reports |
| github-trending | 情报 | `github-trending.md` + `runner/scripts/github-trending/fetch.py` | `github-trending`（direct） | — | github-trending |
| content-opportunities | 选题 | `content-opportunities.md` | `content-opportunities` + `pipelineInputs` | — | reports |
| deep-research-chase | 研究 | `deep-research-chase.md` | `deep-research-chase` | yt-pipeline, youtube-data, x-data, transcript | youtube-data, x-data, transcript, reports |
| yt-pipeline | 研究 | `yt-pipeline.md` | `yt-pipeline` | youtube-data, transcript | youtube-data, transcript, reports |
| angle-brainstorm | 制作 | `angle-brainstorm.md` | `angle-brainstorm` | — | reports |
| outline-build | 制作 | `outline-build.md` | `outline-build` | — | reports |
| content-cascade | 分发 | `content-cascade.md` | `content-cascade` | transcript | transcript, youtube-data, reports |

references 列严格按 `workflows.mjs` 的 `referenceDependencies`。另外，deep-research-chase、yt-pipeline、content-cascade 加了 content-os 新写的 `transcript.md`，因为 agentic-os 没有打包转录工具。

| agentic-os 组件 | content-os 对应 |
|---|---|
| `vault-mcp.mjs` 的 `youtube_research_data` / `x_research_data` | `scripts/youtube-data.mjs` / `scripts/x-data.mjs`（参数白名单相同） |
| `workerEnv` 读 `~/.claude/.env` | 只读进程环境变量；Hermes 按 `required_environment_variables` 透传 |
| `vault/system/v2/x-data-usage.json` | `$CONTENT_OS_STATE_DIR/x-data-usage.json` |
| MCP server 进程 = 一次运行 | `x-data.mjs new-run` 运行 ID |
| `pipelineInputs` | `reports.mjs intel-inputs` / `github-snapshot` |
| `destinationFor` + bridge 保存 | `reports.mjs save` + 返回全文 |
| `zoneText`（按机器时区替换 America/Chicago） | `CONTENT_OS_TZ`（默认机器时区） |
| `directWorkflow` 的 github-trending 重试 | `scripts/github-trending/run.mjs`（3 次，同样的错误匹配和退避） |

---

## 12. 已知限制

- Hermes 的 GitHub identifier 安装不支持 ref，锁版本只能用 raw URL 安装或 `external_dirs`。这是读 `skills_hub_github.py` 得出的结论；Hermes 将来可能会加 ref 支持。
- URL 安装的 skill 信任级别是 `community`，每次安装都会做安全扫描。脚本里调用外部 API 是正常行为，但扫描器可能给出提示，用户检查后可以加 `--force`（`dangerous` 判定不能绕过）。
- `angle-brainstorm` 和 `outline-build` 的正文提到 `yt-hooks`、`yt-titles` 两个下游 skill，本仓库不包含它们。按保真要求保留原文，adapter 里说明：没装时到交接点停下。
- YouTube 周复盘在复盘层，不在本仓库，content-opportunities 只在 vault 里已有周复盘时才使用。
