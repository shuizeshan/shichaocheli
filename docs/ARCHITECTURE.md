---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 32bb5da1dcc2421bb402c47203a9bca8_3e28be3ae3ea11f19231525400638852
    ReservedCode1: EYAyCyM3s1S8SmDSC6msjIjiY3EBTkVDV8P8iOgIx5sSr6aSUmlLPSqc5K4QQXEX2y62A20w0fweWwooW+KydZLDD4CQMaNpMUk1kwvNGCSqpkj5qqxpofwoUje/crRaWiTRWXS2vqjkK4jjZ8Md7kdhXS0r/NTRyIeQiMcIB5WOPaVblaNW0R1JZLs=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 32bb5da1dcc2421bb402c47203a9bca8_3e28be3ae3ea11f19231525400638852
    ReservedCode2: EYAyCyM3s1S8SmDSC6msjIjiY3EBTkVDV8P8iOgIx5sSr6aSUmlLPSqc5K4QQXEX2y62A20w0fweWwooW+KydZLDD4CQMaNpMUk1kwvNGCSqpkj5qqxpofwoUje/crRaWiTRWXS2vqjkK4jjZ8Md7kdhXS0r/NTRyIeQiMcIB5WOPaVblaNW0R1JZLs=
---

# 代码结构说明（ARCHITECTURE）

单文件 `DeadExtraction.html`，约 4000 行，结构顺序：`<style>` → 数据表 → 地图生成 → 战斗/AI → 渲染 → UI/存档 → 主循环 → `window.GAME` 测试接口。

## 1. 数据表（改数值先来这里）

| 变量 | 作用 |
| --- | --- |
| `ITEMS` / `NOTE_VALUE` / `WEAPONS` | 物资、笔记、武器数值（近战 dmg/rate/range/arc，枪械 mag/spread/reload/noise） |
| `ZT` | 丧尸 6 类：`walker` 行尸 / `brute` 暴君 / `runner` 跑步 / `crawler` 爬行 / `dog` 犬型 / `slow` 缓慢；含 hp/spd/dmg/vision/hear/xp |
| `BLD` | 建筑 6 类：`home` 居民楼 / `store` 商店 / `school` 校园 / `fire` 消防局 / `police` 警察局 / `hospital` 市立医院；含配色 `c`、图标 `ic`、容器池 `box` |
| `MAPS` | 4 张图：`suburb` 郊区住宅 / `city` 商业区 / `hospital` 市立医院 / `military` 军事基地；含丧尸量、掉落倍率、撤离点数、时限、建筑配比 |
| `RECIPES` / `SKILLS` / `BUILDS` | 制作配方、5 项技能、营地建造项 |
| `LOOT_COMMON/UNCOMMON/RARE` | 稀有度掉落池 |

## 2. 地图生成与建筑

| 函数 | 职责 |
| --- | --- |
| `genMap(cfg)` | 生成地形/建筑/容器/撤离点；内部用 `reachMap()` 过滤不可达落点 |
| `layoutBuilding(b)` | 按建筑类型生成内部格局与 `doors` 数组（含门位置、`dir`） |
| `addBuilding(m, x, y, type)` | 落地建筑：外墙 2 / 地板 4 / 调用 `layoutBuilding` 与 `cutDoor` |
| `cutDoor(m, dr, x, y, w, h)` | **门核心**：门格置 3 → 沿墙法向加宽为 2 格 → 向内拆墙打通 → `doorPathOk()` 失败则 `carveToCenter()`；写入 `dr.dir` / `dr.span` |
| `doorAssist(dt)` | 玩家靠近门洞时沿墙方向微调，避免卡门柱 |
| `doorPathOk()` / `carveToCenter()` / `roundPath()` | 门后可达性校验 / 拆墙兜底 / 圆角路径工具 |

瓦片编码：`0` 空地 `1` 障碍 `2` 墙 `3` 门 `4` 地板。

## 3. 战斗与 AI

`startRaid` → `updatePlayer` / `updateZombies` / `updateBullets` / `updateFx`；
射击 `tryFire` + `losClear`（视线判定）；近战扇形判定在 `tryFire` 的 melee 分支；
噪音 `noiseEvent` 引怪；`spawnZombie` / `pickZType`（按地图权重）。

## 4. 渲染（render 函数内顺序很关键）

`drawMap → 容器/掉落 → 建筑内部标识 → 屋顶遮挡(挖门洞) → 丧尸 → 玩家(含手持武器) → 子弹/特效 → 光照遮罩 drawImage → 门廊 → 撤离指示 → 小地图 → HUD`

- 屋顶：`roof_b.visited` 为 false 时绘制；路径用 `evenodd` 减去 `doors[].span` 矩形。
- 门廊：按 `span` 整体绘制门槛石/门框柱/暖光/箭头，`dir` 决定朝向。
- 光照：离屏 `lightCv` 用 `destination-out` 挖视野锥，再整层盖回主 canvas。

## 5. UI / 存档

`showScreen(name)` 是唯一界面切换入口（17 个界面：menu/hub/loadout/map/craft/build/skills/stash/notes/bag/slots/settings/help/pause/bloodmoon/confirmAbandon/raid）。
存档：`save()` / `load()` / `slotInfo()`，键前缀 `dead_extraction_save_`，多槽位 `SLOT_COUNT`。

## 6. 测试接口

`window.GAME` 暴露：`newGame / startRaid / step / render / showScreen / keys / cam / raid / MAPS / TILE / getScreen / handleAction / lootContainer / tryFire / useItem / repairGear / startBloodMoon / bloodMoonAction` 等。
`tools/door_check.js` 用 node `vm` + DOM/Canvas 桩加载本文件脚本，统计门格与走位；`tools/cdp_shot.mjs` 用 Edge headless + CDP 做真实渲染截图与按键走位。

## 7. 修改指引

- 加丧尸类型：`ZT` 加项 → `MAPS[].ztype` 加权重 → `drawZombieBody` 配色分支。
- 加建筑类型：`BLD` 加项（配色/图标/容器池）→ `layoutBuilding` 加格局分支 → `MAPS[].btype` 加权重。
- 加武器：`WEAPONS` 加项 → `ITEMS` 里挂 `wk` 标识 → `drawHeldWeapon` 加外形分支。
- 动门/墙相关代码前后**必须**跑 `node tools/door_check.js`。
*（内容由AI生成，仅供参考）*
