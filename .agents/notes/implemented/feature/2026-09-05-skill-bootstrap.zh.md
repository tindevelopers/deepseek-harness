# Agent Note: 条件式技能引导 —— 为非平凡工作自动加载方法论技能

Status: implemented

[English](2026-09-05-skill-bootstrap.md) | 中文

## 问题

`dsh-tool-skill` 列出可用技能，并仅在模型判断某请求匹配时才加载它们。Superpowers 风格的方法论技能（brainstorming、test-driven-development、systematic-debugging，以及它们的 `using-superpowers` 引导）依赖的恰恰相反：引导被预先注入，以便模型在首次响应前检查可适用技能。在每个会话中都注入该引导，会为平凡的一次性请求支付一整段强指令的提示代价，而这正是渐进式披露所要避免的噪音。

## 决策

`@deepseek-ai/dsh-skill-bootstrap` 在每个可见表面上至多注入一次某个命名技能的完整主体，作为一条持久的用户角色消息，且仅限于非平凡的多轮编程会话。它是可选的：挂载该插件即启用，随附的预设在默认情况下不挂载它。

闸门是两个信号的混合。首轮只有在步骤的直接用户文本匹配 `programmingSignals` 正则时才打开它——默认值匹配实现意图、源码产物引用与工程领域名词。任何到达 `escalateAtTurn`（默认 `2`）的步骤都会无条件打开它，因此一个发展为多轮工作的平凡首轮请求仍会收到主体，而平凡的一次性请求永远不会。去重以可见表面为键而非整个日志：监听器跳过批次或表面已携带 `skill-bootstrap` 消息的步骤，因此压缩遮蔽该消息会在下一步重新打开闸门。注入复用 `renderSkillContent`，所以模型看到的 `<skill_content>` 形状与 `skill` 工具返回的一致，并以调用代理为作用域通过 `ctx.skills.get()` 加载，遵守 `isModelInvocable`。

配置为 `skillName`（默认 `using-superpowers`）、`escalateAtTurn` 以及 `programmingSignals` 正则列表。前者用 `isSkillName` 校验，每个信号在加载时编译，因此错误值会响亮失败而不是静默关闭闸门；`escalateAtTurn` 由 schema 校验。

## 备选方案

**对首轮请求做模型驱动分类。** 本包弃用：一次额外的分类调用会给每个会话增加延迟与一个需记录的模型步骤，而确定性闸门已满足所述需求。

**仅按轮次计数升级。** 弃用，因为多轮的非编程闲聊会打开闸门；首轮信号把平凡与非工程会话排除在外。

**仅用首轮启发式。** 弃用，因为真正复杂的任务可能以一条简短的首条消息开始；升级能捕捉启发式漏掉的会话。

**在 `agent/session-start` 注入。** 弃用，因为首轮请求在那里尚未被领取，闸门无法读取它所分类的文本。pre-step 监听器直接读取被领取的批次。

## 后果

技能家族在注册表与目录消费者之间新增了一个可选注入器（[skill-system](../../archived/feature/2026-07-05-skill-system.md)）。它是显式 [`/name` 手势](../../archived/feature/2026-08-08-user-explicit-skill-invocation.md)的自动对应物：手势注入用户点名的技能，而引导仅在闸门打开时注入一个已配置的技能。闸门是确定性的且仅基于文本，因此不共享任何 `programmingSignals` 模式的请求会被视为平凡，无论工作区如何；部署方据此调整正则列表。注入消息是会话历史而非 World State，与目录消费者的持久化姿态一致。

## 延后

压缩后的重新注入依赖表面不再包含被遮蔽的消息；没有显式的 `agent/session-start` 压缩钩子。检查工作区（项目标记、打开的仓库）的首轮信号尚未提供——分类只读取请求文本。
