# Express Owner 模型

Express Owner 是 Express 领域的授权角色，不应被理解为永久的全局管理员别名。当前兼容策略仍将 `status=active && role=admin` 的全局管理员映射为 Owner，以保留既有部署的可用性；新增工作人员使用 `staff_accounts` 的 `role=staff|owner`、状态和 `campusIds` 约束。

Owner 操作始终在 `dbOperations` 服务端重新读取身份和权限。客户端传入的 `isOwner`、权限字段、操作者 ID 和 OpenID 均被忽略。停用账户下一次请求立即失效。工作人员管理只接受公开 `userId`，不接受 OpenID。

未来可将全局管理员兼容映射迁移为显式 `staff_accounts.role=owner`，迁移前必须完成独立 CloudBase 回归和审计核对。本轮不修改现有全局权限数据。
