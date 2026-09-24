# Ride 索引清单

索引来自当前服务端查询，创建与权限仍需在 CloudBase 控制台人工核对。

| 集合 | 查询模式 | 建议索引 |
| --- | --- | --- |
| `ride_posts` | 广场：按校区+状态+出发时间 | `campusId ASC, status ASC, departureTime ASC` |
| `ride_posts` | 我的发布：按作者倒序 | `_openid ASC, createdAt DESC` |
| `ride_posts` | 惰性过期扫描 | `status ASC, expiresAt ASC` |
| `ride_join_requests` | 行程的申请列表（审批看板） | `rideId ASC, status ASC, createdAt DESC` |
| `ride_join_requests` | 我发出的申请 | `_openid ASC, createdAt DESC` |
| `ride_members` | 行程成员列表 | `rideId ASC, joinedAt ASC` |
| `ride_members` | 我加入的行程 | `_openid ASC, joinedAt DESC` |

- 三个集合均设置为**仅云函数访问**（控制台权限核对）。
- 集合需提前创建（云函数 `createCollection` 不可靠），创建与索引输出脚本：`campus_treehole/scripts/run-ride-nosql.js`。
- `_id` 为确定性 ID 的集合（`ride_join_requests`、`ride_members`）依赖 `_id` 唯一约束保证幂等，无需额外唯一索引。
- 第一版候选量小，匹配距离在服务端内存计算，不建 GeoPoint 索引；后续接入 `geoNear` 再评估。
