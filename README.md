# content-os

把内容生产流程拆成 11 个**可以单独安装、单独发版**的 skill，覆盖五层：情报 → 选题 → 研究 → 制作 → 分发。

- 主要给 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 用；
- 同样的目录也能放进 Claude Code（`~/.claude/skills/`）或其他遵循 SKILL.md 规范的 agent；
- 所有 skill 移植自 `morphph/agentic-os`（commit `3262ca0`）。rubric 正文逐字保留，每一处改写都登记在各 skill 的 `PROVENANCE.md` 里，并由测试强制检查。

设计细节和每个决定的理由见 [docs/DESIGN.md](docs/DESIGN.md)。

## Skill 一览

| 层 | skill | 做什么 | 需要的环境变量 |
|---|---|---|---|
| 情报 | `morning-intel` | 组合日报：一次跑完 News Intel、AI Trend Scan、Outlier Radar 三个部分，再附上最新的 GitHub Trending 快照。只出情报，不出选题 | `YOUTUBE_API_KEY`，可选 `TWITTERAPI_IO_KEY` |
| 情报 | `news-intel` | 当天 AI 新闻：AI 新闻、Hacker News、YouTube 雷达、X 上的官方发布，附 Source Status 表 | 同上 |
| 情报 | `ai-trend-scan` | 24 小时内 YouTube 和 X 的速度排行（每小时播放量 / 互动量），去重并按主题聚类，产出原始选题种子 | 同上 |
| 情报 | `outlier-radar` | 小频道异常值：拿视频的终身播放量和该频道近期视频的中位数比，另列早期速度候选 | `YOUTUBE_API_KEY` |
| 情报 | `github-trending` | 确定性脚本，不经过模型：7 天和 30 天的新仓库，加上日榜和月榜里增长最快的 AI/开发仓库 | 可选 `GITHUB_TOKEN` |
| 选题 | `content-opportunities` | 读已经保存的情报报告，排出 3–5 个 YouTube 选题（每个附证据和 seed），加 LinkedIn「Steal my X for Y」选题和短视频选题。不重新扫描来源 | 无 |
| 研究 | `deep-research-chase` | 一个主题的跨来源深度研究：YouTube（含转录稿精读）、网页、X、GitHub | `YOUTUBE_API_KEY`，可选 `TWITTERAPI_IO_KEY` |
| 研究 | `yt-pipeline` | 选出某主题最好的 5–8 个 YouTube 视频，读真实转录稿，做对比综述 | `YOUTUBE_API_KEY` |
| 制作 | `angle-brainstorm` | 一个 seed 生成 8–12 个分属不同框架的视频角度，每个附受众欲望标签 | 无 |
| 制作 | `outline-build` | 把选定的一个角度展开成关注留存的长视频大纲 | 无 |
| 分发 | `content-cascade` | 一个已发布视频 → 用真实转录稿写出博客草稿、X 帖子和回复、LinkedIn 帖子和首评。只写草稿，不发布 | 可选 `YOUTUBE_API_KEY`（用于取元数据） |

### 典型调用顺序

```
github-trending ─┐
                 ├─> morning-intel ─> content-opportunities ─┬─> (按需) deep-research-chase / yt-pipeline
                 │                                           └─> angle-brainstorm ─> outline-build ─> 录制、上传 ─> content-cascade
```

1. `/github-trending`：可以省略，但 Morning Intel 用新鲜快照效果更好。
2. `/morning-intel`：当天的情报。
3. `/content-opportunities`：读情报，给出排好序的选题，每个都带一行 seed。
4. 需要时 `/deep-research-chase <主题>` 或 `/yt-pipeline <主题>`。
5. `/angle-brainstorm <seed>`：选一个角度。
6. `/outline-build <选定的角度>`。
7. 录制、上传。
8. `/content-cascade <视频 URL>`：生成各平台草稿。

## 前置条件

- **Node.js 20.3+**：所有 skill 的脚本都需要。
- **Python 3.9+**：`github-trending`，以及用到转录稿的 skill（`yt-pipeline`、`deep-research-chase`、`content-cascade`）需要。
- **转录稿依赖**：两个都是可选的，至少装一个：
  ```bash
  pip install youtube-transcript-api   # 首选
  pip install yt-dlp                    # 备用
  ```
  都没装时，转录脚本会报出每种方法的失败原因，skill 会返回 `BLOCKED:`，不会用标题或简介冒充视频内容。

## 在 Hermes Agent 里安装

### 方式 A：锁定版本（推荐）

用指向 tag 的 raw URL 安装。URL 不变，内容就不变，`hermes skills update` 也只会从同一个 URL 重新取：

```bash
TAG=news-intel/v1.0.0
hermes skills install "https://raw.githubusercontent.com/morphph/content-os/refs/tags/$TAG/skills/news-intel/SKILL.md" --category content-os
```

升级到新版本时，先卸载再用新 tag 安装：

```bash
hermes skills uninstall news-intel
hermes skills install "https://raw.githubusercontent.com/morphph/content-os/refs/tags/news-intel/v1.1.0/skills/news-intel/SKILL.md" --category content-os
```

每个 SKILL.md 末尾都有「Bundled files」清单。URL 安装正是靠这份清单下载 `scripts/` 和 `references/` 里的文件。

### 方式 B：跟随最新版

```bash
hermes skills tap add morphph/content-os
hermes skills search content-os
hermes skills install morphph/content-os/skills/morning-intel --category content-os
hermes skills check      # 查看哪些 skill 有更新
hermes skills update     # 更新
```

这种方式跟随 `main` 分支。Hermes 从 GitHub 安装时总是取默认分支，没有指定 ref 的参数，所以要锁版本请用方式 A。

### 方式 C：整库挂载

```bash
git clone --branch morning-intel/v1.0.0 https://github.com/morphph/content-os ~/content-os
```

然后在 `~/.hermes/config.yaml` 里加上：

```yaml
skills:
  external_dirs:
    - ~/content-os/skills
```

这样整个仓库锁在一个提交上。

社区来源的 skill 安装时，Hermes 都会做安全扫描。脚本会访问 YouTube、twitterapi.io 和 GitHub 的 API，这是正常行为。如果扫描给出提示，检查后可以加 `--force`。

## 凭证与配置

**凭证只走环境变量**，仓库里只有 [.env.example](.env.example)。

- Hermes 本地 CLI 首次加载 skill 时，会按 `required_environment_variables` **安全地提示输入**并保存到 `~/.hermes/.env`。你也可以自己写进这个文件。
- 消息平台上不会在聊天里索要密钥。
- Hermes 只把 skill 声明过的变量透传给脚本。

| 变量 | 用途 |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `TWITTERAPI_IO_KEY` | twitterapi.io，按读取的帖子计费。没有它时 X 部分退回 web search，报告里会标注 |
| `GITHUB_TOKEN` | 可选，把 GitHub API 限额从每小时 60 次提高到 5000 次 |

非密钥设置都是可选的：

| 变量 | 默认 | 说明 |
|---|---|---|
| `CONTENT_OS_VAULT` | `~/content-os-vault` | 报告的保存和读取目录。目录布局与 agentic-os 相同，可以直接指向现有的 Obsidian vault |
| `CONTENT_OS_STATE_DIR` | `~/.content-os/state` | X 的日账本 `x-data-usage.json` 和运行记录 `x-runs/` |
| `CONTENT_OS_TZ` | 本机时区 | 报告日期用的时区，例如 `Asia/Shanghai` |
| `X_DATA_DAILY_POST_LIMIT` | 600 | 每个 UTC 日读取 X 帖子的上限，最高 5000 |

Hermes 的 terminal 默认不传未声明的变量。要让上表的设置生效，在 `~/.hermes/config.yaml` 里加：

```yaml
terminal:
  env_passthrough: [CONTENT_OS_VAULT, CONTENT_OS_STATE_DIR, CONTENT_OS_TZ, X_DATA_DAILY_POST_LIMIT]
```

另一种做法是在 Hermes 的 skill 设置里填 `content_os.vault`，skill 会把它作为 `--vault` 传给脚本。

**X 预算有三级**，与 agentic-os 相同：

- 每次调用：一页；
- 每次运行：200 条帖子。每次运行开头执行 `x-data.mjs new-run` 拿到运行 ID，之后每次调用都带上它；
- 每天：默认 600 条，按 UTC 日计算。

所有 skill 共用同一个日账本，并发调用由文件锁串行化。

## 在 Claude Code 里使用

```bash
mkdir -p ~/.claude/skills
cp -R skills/morning-intel skills/content-opportunities ~/.claude/skills/
```

需要的环境变量在启动 Claude Code 的 shell 里 export，或者写进 Claude Code 的 `settings.json` 的 `env`。SKILL.md 里的 `<skill-dir>` 就是这个 skill 所在的目录。

## 输出

每个 skill 都会在最终回答里返回**完整**报告，同时用 `scripts/reports.mjs save` 保存到 vault。保存路径与 agentic-os 完全一致，例如：

- `inbox/research/morning-intel/2026-11-19-intel-1a2b3c4d.md`
- `inbox/reports/content-opportunities/2026-11-19-opportunities-….md`

保存从不覆盖已有文件。`content-opportunities` 按 agentic-os 原来的规则读这些报告：

- 当天或昨天最新的组合报告；
- 加上比它更新的单项报告；
- 加上 8 天内的 YouTube 周复盘（有才用）。

## 版本与发版

- 每个 skill 独立使用 semver。版本号写在 `SKILL.md` frontmatter 的 `version`，变更写进该 skill 的 `CHANGELOG.md`。
- tag 命名为 `<skill>/v<version>`，例如 `news-intel/v1.0.0`。共用工具另打 `tools/v<version>`。
- 当前 tag：所有 11 个 skill 都是 `/v1.0.0`，工具是 `tools/v1.0.0`。

## 维护

```bash
npm test          # 工具单元测试、结构校验、原文一致性校验
npm run sync      # 把 tools/、shared/references/、兄弟 skill 的 rubric 同步进各 skill，并重新生成 PROVENANCE.md
npm run check     # 只检查不修改：同步漂移、PROVENANCE 是否最新、版本守卫
npm run release   # 列出待打的 tag；加 -- --create 创建
node scripts/verify-upstream.mjs --agentic-os ../agentic-os   # 用真实 checkout 校验来源快照
```

规则：

- **共用工具**只改 `tools/`，**共用 rubric** 只改 `shared/references/`，**子 rubric** 只改那个 skill 自己的 SKILL.md。改完运行 `npm run sync`。例如改 news-intel，morning-intel 里的副本会自动更新。
- **刻意偏离 agentic-os 原文**时，在该 skill 的 `provenance.json` 里登记一条改写，写明 `original`、`replacement` 和 `reason`，再运行 `npm run sync`。没登记的改动会让 `tests/fidelity.test.mjs` 失败。
- **改了已发版的 skill**，必须升 `version` 并补 CHANGELOG，否则 `check-versions` 会失败。合并到 `main` 后运行 `npm run release -- --create` 和 `git push origin --tags`。

## 许可

MIT。部分内容来自 agentic-os starter（Copyright (c) 2026 Chase AI，MIT）。见 [LICENSE](LICENSE)。
