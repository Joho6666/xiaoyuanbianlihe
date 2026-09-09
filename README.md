# 校园便利盒 (xiaoyuanbianlihe)

<div align="center">

**统一校园综合生活与社交平台 · 微信原生小程序**

校园此刻 · 同频找搭子 · 友桥中外交流 · 二手集市 · 互助生活 · 1对1私信

![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini%20Program-07C160?style=for-the-badge&logo=wechat&logoColor=white)
![CloudBase](https://img.shields.io/badge/CloudBase-Serverless-1677FF?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111)
![Status](https://img.shields.io/badge/Status-Beta%20Pilot-22C55E?style=for-the-badge)

</div>

---

## 🚀 当前版本状态：Beta Release (Pilot)

本项目当前处于 **桂林航天工业学院 (GUAT) 30~100 人首期封闭内测 (Beta Pilot)** 阶段。
开发与发布基准分支为：`refactor/campus-platform-foundation`。

代码库基于**多校统一底座与校区强隔离**设计，共享同一云开发后端体系，未来仅需更新唯一学校目录配置即可零开发低成本扩展桂电、广西师大、桂工、桂医等高校。

---

## 核心子系统与功能

| 模块 | 模式 / 设计原则 | 核心特性 | 对应路径 |
| :--- | :--- | :--- | :--- |
| **🔥 校园此刻** | 轻量首页聚合 (1次调用返回) | 实时轮播同频、友桥、二手、互助 3~5 条高时效内容 | `pages/index/` |
| **🏸 同频 Tongpin Lite** | 事情 > 照片（杜绝看脸交友） | 30秒极速三步发布、自动模板起名、5态流转、防并发超员事务审批 | `packageBuddy/` |
| **🌍 友桥 UniBridge Lite** | 跨语言/跨文化互补交流 | 2项必填秒启双语档案、互补匹配置顶、严格杜绝假留学生数据 | `packageBridge/` |
| **🛍️ 校园集市** | 闲置流转与面对面交易 | 支持图片安全审查、议价意向、分类瀑布流与卖家一键私信 | `packageMarket/` |
| **🙋 校园互助** | 互帮互助、解决急需 | 跑腿代取、课业答疑、失物与寻物全流程 | `packageMutual/` |
| **💬 1 对 1 安全私信** | 隐私保护、会话防拉黑 | 客户端仅暴露稳定 UserID，由云函数安全映射内部消息通道 | `pages/chat/` |
| **🏫 多校统一底座** | 唯一 Source of Truth 目录 | 以 `config/schools.js` 为权威配置，二维码扫码直达对应学校 | `config/schools.js` |

---

## 界面预览

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/discover.jpg" alt="首页发现信息流" width="240">
      <br>
      <strong>发现全域频道</strong>
      <br>
      <sub>聚合校区切换、同频、友桥、集市、互助与圈子入口</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/market.jpg" alt="校园集市" width="240">
      <br>
      <strong>校园集市</strong>
      <br>
      <sub>二手商品分类、搜索、商品卡片与发布入口</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/publish.jpg" alt="发布动态" width="240">
      <br>
      <strong>发布动态</strong>
      <br>
      <sub>树洞、求助、找搭子、校园生活等多频道发布</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/messages.jpg" alt="消息中心" width="240">
      <br>
      <strong>消息中心</strong>
      <br>
      <sub>私信会话、互动消息与服务通知状态</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/profile.jpg" alt="个人主页" width="240">
      <br>
      <strong>个人主页</strong>
      <br>
      <sub>资料展示、关注粉丝、发布内容与管理快捷入口</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/activity.jpg" alt="活动专区" width="240">
      <br>
      <strong>活动专区</strong>
      <br>
      <sub>活动横幅、活动动态搜索与空状态提示</sub>
    </td>
  </tr>
</table>

---

## 技术架构

```text
微信小程序客户端 (原生框架 + 5大分包)
├─ 主包：pages/* (首页、发现、消息、我的、聊天、帖子详情)
├─ packageMarket/*  (校园二手集市与详情)
├─ packageEvents/*  (校园活动专区与详情)
├─ packageBuddy/*   (同频找搭子广场、三步发布、详情审批)
├─ packageBridge/*  (友桥语伴广场、极简双语档案、伙伴详情)
└─ packageMutual/*  (校园互助跑腿、失物招领)

腾讯云开发 CloudBase (Serverless)
├─ login                 # 登录与用户稳定身份绑定
├─ dbOperations          # 模块化数据库服务中心
│  ├─ modules/buddies    # 搭子组局与事务审批
│  ├─ modules/bridge     # 语伴互补匹配与档案
│  ├─ modules/market     # 二手闲置与想要沟通
│  ├─ modules/mutual     # 互助生活与失物
│  ├─ modules/posts      # 树洞动态与互动
│  ├─ modules/messages   # 一对一安全私信
│  ├─ modules/campus-now # 校园此刻轻量聚合
│  └─ shared/            # 校区隔离、内容安全Wrapper、公开数据脱敏
└─ hosting/admin.html    # Web 运营后台页面
```

---

## 质量保障与自动化测试

```bash
# 1. 学校目录一致性校验 (保证云端与前端统一)
npm run check:schools

# 2. 单一领域模型 Source of Truth 双向一致性校验
npm run check:domain

# 3. 页面路由、分包引用与 WXSS 导入完整性校验
npm run validate

# 4. 全项目 JavaScript 严格语法检查
npm run lint

# 5. 运行完整单元测试与回归套件 (覆盖事务审批、校区隔离、安全审查、二维码解析)
npm test

# 6. 一键运行全套 CI 流水线
npm run ci

# 7. 运行端到端沙箱集成 Smoke 测试
npm run test:integration:memory
```

---

## 真机测试与发布门槛

- 详细的测试执行手册请见：[`docs/REAL_DEVICE_TEST_CHECKLIST.md`](docs/REAL_DEVICE_TEST_CHECKLIST.md)
- **Release Blocking Test（阻断性测试）**：
  必须由真实双微信号（测试学生 A 与 测试学生 B）跑通完整闭环：
  **扫码进桂航 → A 发羽毛球搭子 → B 浏览并申请 → A 事务审批通过 → B 点击私信发起人 → 双方私聊成功**。
  任何一步受阻，不得对外发布。

## 同频 · 心动（开发中）

新增自愿18+心动资料、同校双向喜欢、每日缘分卡（普通1张、开发Premium 3张），复用安全与私信。Payment: NOT IMPLEMENTED。实现说明见 [产品文档](docs/heart/HEART_PRODUCT_SPEC.md)、[规则](docs/heart/FATE_CARD_RULES.md)和[隐私与发布阻断项](docs/heart/HEART_PRIVACY.md)。自动CI与内存smoke通过不代表Beta Ready；真实CloudBase和双微信验收仍为NOT RUN。
