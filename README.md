---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 32bb5da1dcc2421bb402c47203a9bca8_3ca0469ce3ea11f1b35052540024e231
    ReservedCode1: +Wxz4EvfGt6L9wbqaPIc0QJZYEOEYMbahlVNIb9YMXroXWZjx5gC1XdCxRbsbAKkbl5VXUHuuKSueV9tdquHzZYPa2YxJ3XqX/eCsFJCY6Lu+KdAg/wEbqdEPHrs1vqIKDKEZ6NJVK6E3k2uZT8gL452/Mc0xT0OSZHuyvA05STtG8SOzuYyhLraTwk=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 32bb5da1dcc2421bb402c47203a9bca8_3ca0469ce3ea11f1b35052540024e231
    ReservedCode2: +Wxz4EvfGt6L9wbqaPIc0QJZYEOEYMbahlVNIb9YMXroXWZjx5gC1XdCxRbsbAKkbl5VXUHuuKSueV9tdquHzZYPa2YxJ3XqX/eCsFJCY6Lu+KdAg/wEbqdEPHrs1vqIKDKEZ6NJVK6E3k2uZT8gL452/Mc0xT0OSZHuyvA05STtG8SOzuYyhLraTwk=
---

# DeadExtraction（丧尸搜打撤）

双击 `DeadExtraction.html` 即可游玩，无需安装、无需联网、无外部依赖。

## 操作

| 键 | 作用 |
| --- | --- |
| W A S D | 移动 |
| Shift | 冲刺（消耗体力） |
| 鼠标左键 / J | 攻击（枪械射击 / 近战挥击） |
| E（长按） | 搜刮容器 / 交互 |
| R | 换弹 |
| 1 2 / Q | 切换武器 |
| B | 背包 | 
| Esc | 暂停 |

流程：营地整备 → 选图出发 → 搜刮与战斗 → 靠近撤离点按 E 呼叫 → 坚守到撤离 → 带出战利品升级营地。

## 主菜单

- **背景音乐**：进入主菜单即载入循环 BGM（低沉铺底 + 稀疏心跳），按浏览器自动播放策略处理——**必须有一次真实点击/按键**后才解锁发声，未交互前不会有声音也不会报 autoplay 警告。
  - 右下角音乐控件：点按展开音量条（0/10/20…100%，0.1 步进）与"音乐 / 已静音"切换；
  - 菜单顶部另有"音乐：开 / 关"快捷按钮，与右下角控件共享同一状态；
  - 音量与静音写入存档，下次启动沿用；进入突袭自动切换到突袭模式 BGM，返回菜单再切回，不中断重来。
- **电影感微动画**：菜单背景是一层独立 canvas 的慢镜头场景——两层城市剪影与忽明忽暗的窗光、地面火点与升腾烟柱、飘散的余烬、从右向左奔逃的人群被身后僵尸追赶、右侧持盾特警与警车（红蓝爆闪 + 探照灯）压制射击，整体缓慢横移形成视差。
  - 舞台分区设计：人群与战斗集中在画面右侧 6 成区域，左侧留白放标题卡，因此面板不会压住叙事主体；
  - 性能：绘制缓冲降采样 + 30fps 封顶 + 静态层离屏缓存，进入游戏后动画立即停止，零额外开销。

## 击退机制

命中有可见的击退位移与反馈，力度由"武器 × 目标体型"双重决定：

| 武器 | 击退值 kb | 对行尸表现 | 说明 |
| --- | --- | --- | --- |
| 撬棍 | 60 | 净位移约 35px、硬直 0.28s | 近战基础击退，适合推开贴脸丧尸 |
| 消防斧 | 110 | 净位移约 65px、硬直 0.42s | 重武器，能把小体型僵尸打退一大步 |
| M1911 | 44 | 轻推 + 命中标记 | 单发点射，靠准度不靠推 |
| AKM | 52 | 中等推力、持续压制 | 连发叠加速度但受 `KB_MAX` 封顶 |
| 双管霰弹枪 | 30 × 8 弹丸 | 近距一枪轰退 | 多弹丸冲量叠加，贴脸最明显 |

- 冲量公式：`imp = 武器.kb × (1 − min(0.86, 目标.kbRes + 目标.armor × 0.55))`，**暴君等高抗性目标只有普通僵尸约 1/7 的位移，且不会被打出硬直**；
- 反馈分级：轻击 → 准星命中标记 + 定向火花 + 短促闷响；重击（冲量 > 16）→ 额外硬直、僵尸按击退方向倾斜、屏幕震动，冲量 ≥ 45 还会飘出"击退"字样；
- 击退走 `kbx/kby` 速度 + 碰撞检测积分，贴墙时保留 12% 速度，不会穿墙也不会卡进模型。

## 目录

- `DeadExtraction.html` 游戏本体（唯一入口）
- `PLAN.md` 项目状态看板：目标、已完成、历史 Bug、当前阶段、下一步、技术栈、目录规范
- `docs/CHANGELOG.md` Bug 时间线（现象/根因/修复/验证）
- `docs/ARCHITECTURE.md` 代码结构与关键函数索引
- `tools/door_check.js` 门与进入逻辑桩测试
- `tools/loot_check.js` 搜刮结算弹窗桩测试
- `tools/menu_kb_check.js` 主菜单动画 / BGM 控件 / 击退物理桩测试
- `tools/cdp_shot.mjs` 无头浏览器截图验证
- `tools/menu_shot.mjs` 主菜单多分辨率布局截图与帧差验证
- `tools/bg_probe.mjs` 纯背景动画取帧与亮度统计
- `tools/kb_realshot.mjs` 真实浏览器击退位移取证（输出 kbPower / dx / dy / 净位移 / 硬直）
- `screenshots/` 验收截图（`06` 主菜单电影感、`07` 纯背景动画、`08` 击退对比、`09` 小分辨率）
- `archive/` 历史版本备份与历史调试截图（不参与运行）

## 自测

```powershell
# 1) 逻辑桩测试（无需浏览器，三套都必须全 PASS）
node tools\door_check.js        # 门格 / 门洞宽度 / 能否走进去          预期 PASS=4  FAIL=0
node tools\loot_check.js        # 搜刮结算弹窗全流程                    预期 PASS=25 FAIL=0
node tools\menu_kb_check.js     # 主菜单动画状态 / BGM 控件 / 击退物理  预期 PASS=65 FAIL=0

# 2) 视觉验证：先起一个带调试端口的 Edge（必须独立临时 profile，避免触发账户/同步弹窗）
msedge --headless=new --remote-debugging-port=9455 `
       --user-data-dir="$env:TEMP\de_edge_prof" --no-first-run --no-default-browser-check `
       --disable-sync --disable-features=msEdgeIdentityFRE,msEdgeSync about:blank
node tools\cdp_shot.mjs         # 门外观 / 建筑内部 / 突袭视角
node tools\loot_shot.mjs        # 结算弹窗
node tools\menu_shot.mjs        # 主菜单布局（1600×900 / 1366×640 / 1024×600 / 820×520）
node tools\bg_probe.mjs         # 纯背景动画取帧（隐藏 UI）+ 两帧差异统计
node tools\kb_realshot.mjs      # 击退位移取证（撬棍 / 消防斧 / 暴君）
```

判定口径：布局类断言看 `overflowBtns=[]`（无按钮溢出）与 `cardBottomRatio < 0.45`（标题卡不压住背景主体）；动画类看两帧像素差异是否明显大于 0；击退类看 `kbPower`、净位移与 `stun` 是否与上表预期一致，且暴君位移显著小于行尸。

*（内容由AI生成，仅供参考）*
