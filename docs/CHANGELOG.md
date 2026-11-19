---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 32bb5da1dcc2421bb402c47203a9bca8_3d69e2b0e3ea11f19231525400638852
    ReservedCode1: 73XG2YClChvnXWLBuMMWe3Tu5ZHonB/Z69KwIyTID0XaWGDUz8d5yQvYITvgxXGC+hKxo6w6rTYlV/FNd6VyYPHdTE27HbZkJ4sf/sN50ZIGgvqReKdAcpw8DPB+B9WWFiJgjD9TCNfLwG3ECB3jFkcCl9KpWknNPD5vpSiZTD7xkOdYm+0sNrj7csQ=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 32bb5da1dcc2421bb402c47203a9bca8_3d69e2b0e3ea11f19231525400638852
    ReservedCode2: 73XG2YClChvnXWLBuMMWe3Tu5ZHonB/Z69KwIyTID0XaWGDUz8d5yQvYITvgxXGC+hKxo6w6rTYlV/FNd6VyYPHdTE27HbZkJ4sf/sN50ZIGgvqReKdAcpw8DPB+B9WWFiJgjD9TCNfLwG3ECB3jFkcCl9KpWknNPD5vpSiZTD7xkOdYm+0sNrj7csQ=
---

# CHANGELOG / Bug 时间线

格式：每条含【现象】【根因】【修复】【验证】。新条目追加在顶部。

---

## 2026-11-19 · B05 画面出现大量方框（建筑屋顶像色块）

- 【现象】用户截图显示地图上多个棕色/黄色方格 + 白色边框，建筑无门、看不出可进入。
- 【根因】屋顶用纯色 `fillRect` + 白色 2px 外框 + 整格网格线绘制，且门洞被屋顶完全盖住；视觉上等价于"一堆方框"。
- 【修复】
  1. 屋顶路径改为 `evenodd` 填充，**从屋面减去门洞矩形**，门在屋顶上呈真实缺口；
  2. 方格网改为斜向瓦纹（`rgba(0,0,0,0.15)` 细斜线），去除白描边，改深色屋檐描边；
  3. 屋面加 7px 圆角（`roundPath()`）、透明度 0.94 → 0.86，隐约透出内部结构；
  4. 建筑名称改为深色胶囊底 + 浅字，不再像调试标签。
- 【验证】CDP 无头截图 `screenshots/03_raid_view.png`、`01_door_outside.png`。

## 2026-11-19 · B04c 门廊方框彻底移除（用户第四轮反馈"上下左右还是有框"）
- 【现象】地图上上下左右仍散布橙描边矩形 + 三角箭头的方框，玩家认为多余。
- 【根因】B04b 的门廊可视化：每个门都画 `strokeRect` 橙描边 + 向内箭头 + 地面光斑 + 门槛石 + 找门虚线，全图每栋建筑一个，遍布画面四周。
- 【修复】整段门廊绘制删除，门仅以屋顶缺口（evenodd 挖洞）表达；只在玩家进入 120px 内于门洞外侧显示一行 11px 半透明"门口"文字，无描边、无箭头、无光斑、无虚线。
- 【验证】`node tools/cdp_shot.mjs` 三张截图逐像素扫描：地图区域橙色长横线 0 条、长竖线 0 列（仅 HUD 左上 y≈62 一条装饰线）；`node tools/door_check.js` PASS=4 FAIL=0，门仍可正常走入。

# 2026-11-19 · F01 搜刮结算弹窗（新需求）
- 【需求】搜完容器先弹窗显示搜到哪些物品与数量，玩家确认后才进背包。
- 【实现】`lootContainer()` 改为两段式：先用 `JSON.parse(JSON.stringify())` 复制背包做**预演**，算出本次实际可拿走的物品/数量（含 key/note 特殊通道与负重/格位失败部分），存进 `G.pendingLoot`，随后 `showScreen('lootResult')`（该屏 `step()` 不更新，游戏自动暂停）。新增 `UI.lootResult` 面板：物品名（沿用稀有度色）+ `x数量` + 关键/档案标记 + 放不下的清单 + "确认 · 收进背包"按钮。`confirmLoot()` 在确认时才真正 `bagAdd` / 发门卡 / 归档档案，并把放不下的部分写回容器 `c.loot`，最后回 `raid`。
- 【交互】按钮点击 `data-act="loot_ok"`，或按 E / 空格 / 回车 / Esc；键盘已加 `e.repeat` 拦截，防止长按 E 搜刮结束时按键重复直接跳过面板。
- 【验证】新增 `node tools/loot_check.js`：PASS=25 FAIL=0（面板必弹、确认前背包不变、确认后数量增加、背包满时提示"什么都没能带走"且不超重、门卡确认后才生效、档案确认后归档、无数据时 loot_ok 不崩）；`node tools/loot_shot.mjs` 截图 `04_loot_result.png`（医疗箱 → 绷带 x2、化学品 x1、按钮"确认·收进背包"）与 `05_after_confirm.png`（回局内）。

# 2026-11-19 · B04 左右墙的门永远只有 1 格宽（进不去的真凶）

- 【现象】门功能"已实现"但玩家仍反馈进不去；桩测试统计两格宽门只有 141/198。
- 【根因】`cutDoor()` 的加宽分支里，上下墙门用对了 `tget(m, ax, dr.y)`，但左右墙门误写成 `tget(m, ay, dr.x)` / `tset(m, ay, dr.x, 3)`——**x/y 顺序颠倒**，判空失败，于是左右墙的门从未被加宽（单格 40px 通道对圆形碰撞体容错仅 ±8px，极易卡门柱）。
- 【修复】改为 `tget(m, dr.x, ay)` / `tset(m, dr.x, ay, 3)`。
- 【验证】`node tools/door_check.js` → 建筑 199 / 门 199 / 两格宽门 199 / 非 3 门格 0 / 门到内部失败 0，PASS=4 FAIL=0；CDP 真实走位 `visited=true`。

## 2026-11-19 · B04b 门廊可视化重做

- 【现象】门上只有一个脉动小方块，加上近距文字才勉强识别为门。
- 【修复】门洞按 `span`（2 格）整体绘制：门槛石 + 两侧门框柱 + 橙色描边 + 地面暖光径向渐变 + 向建筑内的三角箭头；文字指引阈值 130 → 150px。整段一次绘制，不再一格一个方块。
- 【验证】截图 `screenshots/01_door_outside.png`。

## 早期 · B01 突袭画面被遮罩盖住

- 【现象】能操作但看不见画面。
- 【根因】进入突袭只改 `G.screen`，未调用 `showScreen('raid')`，遮罩层未隐藏。
- 【修复】所有界面切换统一走 `showScreen()`；`renderScreen` 对 raid 态清空遮罩并加 `hide`。

## 早期 · B02 建筑"没门"（第一轮反馈）

- 【结论】门逻辑本身存在，问题在视觉不可辨识。
- 【修复】门洞高亮描边 + 脉动 + 近距文字 + 进入时 `SFX.door()`。保留原逻辑，不重写系统。

## 早期 · B03 门洞过窄卡门柱

- 【修复】单格 → 2 格宽门；新增 `doorAssist()` 门口吸附（靠近门洞时沿墙方向微调对准）。

## 早期 · B06 六项功能缺失

- 制作过程无进度动画 → 加进度条动画；
- 营地无手动存档 → 加存档按钮；
- 切换武器无外形变化 → `drawHeldWeapon()` 按武器分层绘制；
- 近战无动画音效 → 扇形挥击动画 + 音效；
- 无背景音乐 → 低沉恐怖 BGM（菜单态也播）；
- 门不可辨识（见 B02）。

## 早期 · B07 撤离点/门后路径不可达

- 【根因】落点只判"非墙"。
- 【修复】`reachMap()` 从出生点 BFS 可达集合内放置撤离点；`doorPathOk()` + `carveToCenter()` 保证门后必达中心。

## 早期 · B08 关键物品零掉落导致锁死

- 【修复】`injectKeyItems()` 按未收集清单显式注入容器（含医院门卡保底），背包满也必得。
*（内容由AI生成，仅供参考）*
