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

## 目录

- `DeadExtraction.html` 游戏本体（唯一入口）
- `PLAN.md` 项目状态看板：目标、已完成、历史 Bug、当前阶段、下一步、技术栈、目录规范
- `docs/CHANGELOG.md` Bug 时间线（现象/根因/修复/验证）
- `docs/ARCHITECTURE.md` 代码结构与关键函数索引
- `tools/door_check.js` 门与进入逻辑桩测试
- `tools/cdp_shot.mjs` 无头浏览器截图验证
- `screenshots/` 验收截图
- `archive/` 历史版本备份（不参与运行）

## 自测

```powershell
# 逻辑：门格/门洞宽度/能否走进去
node tools\door_check.js

# 视觉：需先启动带调试端口的 Edge，再运行
msedge --headless=new --remote-debugging-port=9455 --user-data-dir=<临时目录> about:blank
node tools\cdp_shot.mjs
```
*（内容由AI生成，仅供参考）*
