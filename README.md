# 校园便利盒（微信小程序）

校园便利盒是一个面向校园场景的小程序项目，当前仓库包含：
- 小程序前端（`campus_treehole/`）
- 云函数（`campus_treehole/cloudfunctions/`）
- 运营后台相关页面与资料（`_1/` ~ `_5/`、`azure_campus/`）

## 项目结构

```text
stitch_mvp/
├─ campus_treehole/                # 小程序主工程
│  ├─ pages/                       # 页面
│  ├─ cloudfunctions/              # 云函数
│  └─ utils/                       # 工具函数
├─ azure_campus/                   # 设计与补充文档
├─ _1 ~ _5/                        # 后台页面与截图素材
├─ project.config.json             # 微信开发者工具项目配置（根目录）
└─ project.private.config.json     # 本地私有配置（不入库）
```

## 本地开发

1. 使用微信开发者工具打开 **仓库根目录 `stitch_mvp`**（不要只打开 `campus_treehole`）。
2. 安装与使用 CloudBase CLI（按 `campus_treehole/package.json` 脚本执行）。
3. 云函数位于 `campus_treehole/cloudfunctions`，按需单独部署。

## 仓库协作规则

1. **分支规则**：`main` 保持可发布状态，功能开发走 `feature/*` 分支后合并。
2. **提交规则**：提交信息建议使用 `feat/fix/chore/docs` 前缀，单次提交聚焦一个改动主题。
3. **配置规则**：禁止提交密钥、令牌、账号等敏感信息；本地私有配置不入库。
4. **目录规则**：小程序主代码仅在 `campus_treehole/`，避免跨目录散落逻辑。
5. **变更规则**：涉及云函数接口或数据结构变更时，同步更新调用端与文档说明。

## 说明

- 本仓库优先使用中文沟通与文档。
- 如需贡献，请先阅读 `CONTRIBUTING.md`。

