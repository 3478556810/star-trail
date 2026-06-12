# 星迹 (Star Trail)

> 像素风回合制 Roguelike RPG，具备深度战斗、装备锻造、多人匹配与交易行系统。全栈独立架构，一人完成。

## 目录

- [项目背景](#项目背景)
- [核心系统](#核心系统)
- [架构设计](#架构设计)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [接口文档](#接口文档)
- [性能测试](#性能测试)
- [界面展示](#界面展示)
- [许可证](#许可证)

## 项目背景

星迹是一个单人全栈项目，旨在探索复杂游戏机制与实时多人服务的完整实现。游戏聚焦于以下几个方面：

**战斗深度**
回合制策略引擎，支持元素克制、元素反应、异常状态（中毒、燃烧、冻结、眩晕等）、印记引爆、BOSS 阶段切换，以及实时的 UI 动画反馈（震屏、闪白、立绘切换）。伤害计算封装为纯函数，保障可测试性与确定性。

**Roguelike 成长体系**
- **星图**：数百节点的被动技能树，支持自由缩放与拖拽，类似《流放之路》天赋盘。
- **职业系统**：三大基础职业，六条进阶路线，自由洗点。
- **刻印面板**：通过装备刻印积累点数，达到阈值即可激活强力战斗增益效果。

**装备与锻造**
装备具有等级、品质与随机词缀。锻造升级采用金色菱形旋转动画，支持刻印符文以赋予元素加成。

**多人 BOSS 副本**
通过 WebSocket 实现房间创建、密码加入、踢人、解散、实时战斗状态广播，支持多人组队挑战 BOSS。

**交易行**
RESTful 交易服务，支持物品上架、搜索（关键词、价格区间、排序、分页）、购买（事务性金币流转）、下架（退回物品）。Redis 对高频搜索进行 60 秒缓存，降低数据库压力。

**视听表现**
AI 生成角色立绘差分，VOICEVOX 日语语音，针对不同怪物类型配置独立音效。

## 核心系统

### 战斗引擎

自研回合制引擎 `CombatEngine`，位于 `src/combat/`：

| 模块 | 职责 |
|------|------|
| `CombatEngine.js` | 引擎主循环：回合管理、阶段检测、胜负判定、狂暴机制 |
| `UnitState.js` | 单位状态：HP/MP、护盾、效果列表（BUFF/DEBUFF/印记） |
| `damageCalculator.js` | 纯函数伤害计算：元素克制、暴击、减伤、穿透 |
| `effectDefs.js` | 效果类型常量与定义 |
| `dotTick.js` | 玩家持续伤害结算 |
| `rewards.js` | 战后奖励生成：经验、金币、掉落 |
| `actions/` | 玩家行动、敌人行动、同伴行动的执行逻辑 |
| `effects/` | 各类效果的详细实现 |
| `engine/` | BOSS 机制（阶段触发、无敌/图腾/分身等） |

### 角色养成

- **星图**：Vue Flow 驱动的节点编辑器，自由缩放拖拽
- **属性系统**：攻击、防御、速度、暴击率、暴击伤害、闪避等
- **套装效果**：龙骸套装（龙焰印记）、暗影套装（暗蚀印记）、血怒套装（满血增伤）等

### 装备与锻造

- **装备属性**：等级、品质（白/绿/蓝/紫/金）、随机词缀
- **锻造系统**：消耗材料升级装备，动画反馈（GSAP）
- **刻印系统**：装备刻印积累点数，达到阈值激活强力战斗增益

### 多人房间匹配

基于 WebSocket 的房间管理：

```
客户端 → /ws (WebSocket)
  ├── get_rooms     → 获取当前房间列表
  ├── create_room   → 创建房间（BossID、人数、难度、密码）
  ├── join_room     → 加入房间（密码校验、人数校验）
  ├── leave_room    → 退出房间（房主转移）
  ├── disband_room  → 解散房间（仅房主）
  ├── kick_member   → 踢出成员（仅房主）
  ├── start_battle  → 开始战斗（满员检测、权限校验）
  └── battle_action → 广播战斗操作
```

### 交易行

RESTful API + PostgreSQL 事务 + Redis 缓存：

- **上架**：物品信息写入 `market_listings` 表
- **购买**：事务性操作，先锁行（`SELECT ... FOR UPDATE`），校验金币 → 扣款 → 更新库存 → 写入 `market_transactions`
- **搜索**：关键词模糊匹配、价格区间、排序（价格升/降、最新）、分页；前三页结果 Redis 缓存 60 秒
- **下架**：校验所有权 → 更新状态为 `cancelled` → 物品退回 `player_inventory`

## 架构设计

```mermaid
graph TB
    subgraph 前端 (Vue 3 + Vite)
        MV[MainScreen.vue] --> BS[BattleScene.vue]
        MV --> P[各面板组件<br/>锻造/宝石/交易/房间/星图]
        P --> S[Pinia Store]
        S -->|WebSocket| WS[Match Manager]
        S -->|HTTP| API[Market API]
    end

    subgraph 后端 (Go 1.21+)
        API -->|/api/market/*| MH[Market Handler]
        WS -->|/ws| WH[WebSocket Handler]
        WH --> MM[Match Manager]
        MM -->|内存| RM[Room Map<br/>sync.Mutex 保护]
        MH --> PG[(PostgreSQL 15)]
        MH --> RD[(Redis 7)]
    end

    Vite[Vite Dev Proxy] -->|/api → localhost:8080| API
    Vite -->|/ws → ws://localhost:8080| WS
```

### 请求流程

```
用户操作
    │
    ├── 搜索物品 ──→ GET /api/market/search
    │                   ├── Redis 缓存命中? → 直接返回
    │                   └── Redis 未命中 → PostgreSQL 查询 → 写入缓存
    │
    ├── 购买物品 ──→ POST /api/market/buy
    │                   └── 事务: 锁行 → 扣款 → 更新库存 → 记录交易
    │
    ├── 创建房间 ──→ WebSocket → create_room
    │                   └── 内存创建 Room → 广播房间列表
    │
    ├── 进入战斗 ──→ MainScreen → BattleScene
    │                   └── CombatEngine 初始化 → 回合循环
    │
    └── 锻造装备 ──→ ForgePanel → 消耗材料 → 更新装备属性
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 (Composition API) + Pinia | 状态管理 |
| UI 组件 | PrimeVue (Lara Dark Blue) + UnoCSS | 像素风格 + 原子化 CSS |
| 动画 | GSAP 3 | 锻造旋转、震屏、闪白等特效 |
| 地图/节点 | Vue Flow | 星图节点编辑器 |
| 图标 | Iconify (Material Design Icons) | 统一图标系统 |
| 构建 | Vite 5 + Vue Plugin + PWA | 开发代理、生产构建 |
| 后端 | Go 1.21+ (net/http + gorilla/websocket) | 单二进制，同时处理 HTTP 和 WebSocket |
| 数据库 | PostgreSQL 15 | 主存储：用户、物品、交易记录 |
| 缓存 | Redis 7 | 交易行搜索缓存（60 秒 TTL） |
| 语音 | VOICEVOX | 角色日语语音 |
| 音效 | 独立配置 | 按怪物类型配置攻击/受击音效 |
| 美术 | AI 生成 | 角色立绘差分、怪物图像、场景背景 |

## 快速开始

### 前置条件

- Go 1.21+
- Node.js 18+
- PostgreSQL 15+（需创建 `startrail` 数据库）
- Redis 7+（未命中时缓存功能降级运行）

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/3478556810/star-trail.git
cd star-trail

# 2. 安装前端依赖
npm install

# 3. 配置数据库
# 创建 PostgreSQL 数据库: startrail
# 执行 docs/schema.sql 初始化表结构

# 4. 配置环境变量
# 在 go-game-server/ 下创建 .env 文件:
# DATABASE_URL=postgres://postgres:你的密码@localhost:5432/startrail?sslmode=disable
# REDIS_ADDR=localhost:6379
# PORT=8080

# 5. 启动 Go 后端
cd go-game-server
go mod tidy
go run main.go

# 6. 另开终端启动前端开发服务器
cd ..
npm run dev

# 7. 浏览器访问
open http://localhost:5173
```

Vite 开发服务器会自动将 `/api` 和 `/ws` 代理到 Go 后端的 `localhost:8080`。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `postgres://postgres:123456@localhost:5432/startrail?sslmode=disable` | PostgreSQL 连接字符串 |
| `REDIS_ADDR` | `localhost:6379` | Redis 地址，留空则禁用缓存 |
| `PORT` | `8080` | Go 服务监听端口 |

## 接口文档

### WebSocket（匹配）

**端点**：`ws://localhost:8080/ws`

消息格式：JSON，包含 `type` 字段标识消息类型。

**客户端 → 服务端**

| 类型 | 必填字段 | 说明 |
|------|----------|------|
| `get_rooms` | - | 请求当前房间列表 |
| `create_room` | `bossId`, `maxPlayers`, `difficulty`, `ownerName` | 创建新房间 |
| `join_room` | `roomId`, `playerName` | 加入房间（可选 `password`） |
| `leave_room` | - | 退出当前房间 |
| `disband_room` | - | 解散房间（仅房主） |
| `kick_member` | `memberId` | 踢出成员（仅房主） |
| `start_battle` | - | 开始战斗（满员且仅房主） |
| `battle_action` | - | 广播战斗操作（原始 JSON） |

**服务端 → 客户端**

| 类型 | 说明 |
|------|------|
| `welcome` | 连接成功，包含 `yourId` |
| `room_list` | 当前所有房间列表 |
| `room_created` | 房间创建成功 |
| `room_joined` | 成功加入房间 |
| `room_updated` | 房间状态变更（新成员、踢人等） |
| `room_disbanded` | 房间被房主解散 |
| `kicked` | 被踢出房间 |
| `match_success` | 战斗开始通知 |
| `error` | 错误信息 |

### HTTP（交易行）

所有接口前缀 `/api/market`，请求头 `x-user-id` 标识玩家（默认 `test-user`）。

#### 上架物品

```
POST /api/market/list
Content-Type: application/json

{
  "itemId": "sword_01",
  "itemData": { "name": "铁剑", "atk": 10, "quality": "blue" },
  "price": 100,
  "quantity": 1
}
```

**响应**：
```json
{ "success": true, "listing": { "id": "uuid..." } }
```

#### 购买物品

```
POST /api/market/buy
Content-Type: application/json

{ "listingId": "uuid...", "quantity": 1 }
```

**响应**：
```json
{ "success": true, "paid": 100, "receivedItem": "sword_01" }
```

#### 搜索物品

```
GET /api/market/search?keyword=剑&minPrice=50&maxPrice=500&sort=price_asc&page=1&limit=20
```

**响应**：
```json
{
  "listings": [
    {
      "id": "uuid...",
      "seller_id": "user_01",
      "item_id": "sword_01",
      "item_data": { "name": "铁剑" },
      "price": 100,
      "quantity": 1,
      "status": "active",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 5
}
```

#### 下架物品

```
POST /api/market/cancel
Content-Type: application/json

{ "listingId": "uuid..." }
```

**响应**：
```json
{ "success": true }
```

## 性能测试

> 测试环境：本地 8C16G，Go 单二进制同时处理 WebSocket 和 HTTP。

### 匹配服务（WebSocket）

- **场景**：100 并发用户持续创建与解散房间
- **P95 延迟**：< 200 ms
- **错误率**：0%

![匹配压测](docs/match_stress_test.png)

### 交易行（HTTP）

- **场景**：50 并发用户混合搜索、购买、上架
- **P95 延迟**：< 120 ms
- **成功率**：100%

![交易行压测](docs/market_stress_test.png)

详细 k6 压测脚本见 `go-game-server/scripts/`。

## 界面展示


**副本 BOSS 阶段切换与评分**
![BOSS 阶段](docs/boss_phase.gif)
印记动画、动态血条、阶段特效与战斗胜利后的评分面板。

**星图（被动技能树）**
![星图](docs/talent_grid.gif)
数百节点，可缩放拖拽，类《流放之路》天赋盘。

**刻印面板**
![刻印面板](docs/engraving.png)
通过装备刻印积累点数，达到阈值即可激活强力战斗增益效果。


**锻造动画**
![锻造](docs/forge_upgrade.gif)
手工装备固定词条特效及装备阶段升级时赋予的金色菱形旋转特效。

**多人匹配房间**
![房间](docs/match_room.gif)
实时创建、加入、管理 BOSS 副本房间。

**交易行**
![交易](docs/market.gif)
搜索、购买、下架物品，支持分页与排序。



## 许可证

MIT License

Copyright (c) 2025 Star Trail

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.