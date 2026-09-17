---
description: "面向用户与维护者的条件式技能引导注入器：在非平凡的、多轮次的编程会话中自动加载技能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-bootstrap

[English](README.md) | 中文

## 概述

代理可以自动获得某个技能的完整指令——不是通过目录或 `skill` 工具，而是作为一条持久的注入消息——并且仅在会话属于非平凡的编程工作时才注入。闸门在首轮请求匹配 `programmingSignals` 模式时打开，或在会话到达 `escalateAtTurn`（多轮会话）时打开；压缩隐藏该消息后会重新注入。平凡的一次性请求永远不会收到它。挂载该插件即启用；随附的预设在默认情况下不挂载它。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知局限与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将插件与技能注册表一同挂载，即可自动注入某个命名技能的主体，且仅限于非平凡的多轮编程请求。它需要 `ctx.skills`。

### 何时选择它

当代理应在工程工作中自动加载方法论技能（例如 `using-superpowers`），而无需模型先调用 `skill` 工具时使用它。当会话目录与 `skill` 工具已覆盖发现，或当每个请求都应无条件收到技能主体时，不要使用它——本包的用途正是那个条件闸门。

### 挂载与配置

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-filesystem'
- name: '@deepseek-ai/dsh-tool-skill'
- name: '@deepseek-ai/dsh-skill-bootstrap'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `skillName` | `using-superpowers` | 闸门打开时注入的 kebab-case 技能名 |
| `escalateAtTurn` | `2` | 无条件打开闸门的首个轮次号（多轮会话） |
| `programmingSignals` | 三个内置模式 | 大小写不敏感的正则源码；首轮请求匹配任一即为非平凡编程请求 |

默认信号匹配实现意图（例如 `implement`、`fix`、`refactor`、`migrate`、`debug`）、源码产物引用（代码文件扩展名或 `src`/`packages`/`tests`/`apps` 路径）以及工程领域名词（例如 `bug`、`typecheck`、`lint`、`pull request`、`schema`、`test suite`）。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-skill-bootstrap)是每个字段的详尽来源。

### 闸门与去重

引导在每个可见表面上至多注入一次。首轮只有在直接用户文本匹配 `programmingSignals` 模式时才打开闸门；之后任何到达 `escalateAtTurn` 的步骤都会无条件打开它，因此一个发展为多轮工作的平凡首轮请求仍会收到主体。监听器把注入追加到被接受步骤的消息批次末尾，并跳过批次或可见表面已携带 `skill-bootstrap` 消息的步骤。压缩会把该消息从表面遮蔽，因此下一步会重新注入。

### 可观察的成功与失败

闸门打开、命名技能存在且模型可调用的步骤会追加一条包含规范 `<skill_content>` 块的 `skill-bootstrap` 消息。闸门关闭、技能缺失、技能被禁用模型调用或已可见的注入都会追加空内容，且不提供区分这些原因的诊断。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 —— 点击展开</summary>

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：闸门、去重、技能加载与 pre-step 注入监听器 |
| — | 不发布运行时不变式伴生文件；该适配器没有超出其所属接缝已强制契约之外的独立事件序列或可变数据关系。 |

### 设计概念

该插件是单个 `agent/pre-step` 瀑布监听器，把加载到的技能主体追加到步骤的其他注入上下文之后。它把三个决策分开：闸门是否打开（基于轮次的启发式加升级）、主体是否已可见（批次加表面扫描）、以及技能是否以模型可调用方式加载（以调用代理为作用域的注册表 `get()`）。注入消息复用 `renderSkillContent`，因此模型看到的 `<skill_content>` 形状与 `skill` 工具返回的一致。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [技能子系统参考](../../../docs/subsystems/skills.zh.md) —— 包含条件式引导注入契约的家族地图。
- [skill 包](../skill/README.zh.md) —— 本插件所读取的注册表。
- [tool-skill 包](../tool-skill/README.zh.md) —— 与引导共存的会话目录与 `skill` 工具。

-----

<a id="model-experience"></a>
## 模型体验

### 引导注入

#### 模型所见

一条追加到被接受步骤批次末尾的用户角色消息，携带由共享的 `renderSkillContent` 包装器渲染的引导技能完整指令（`<skill_content>` → `<skill_resources>` → `<skill_instructions>`）。主体由提供者拥有，故此处仅作概述；包装器与 `skill` 工具返回的规范形状一致。消息源记录 `kind: 'skill-bootstrap'`、技能 `name` 与 `form: 'instructions'`，供记录消费者使用；渲染后的文本才是模型的契约。

#### Token 影响

有条件的。闸门关闭、技能缺失或不可模型调用、或主体已可见时为零；否则为一条保留的、包含完整技能主体的注入消息。

#### KV 缓存影响

仅追加。注入在每个可见表面上向批次追加一条消息；之后遮蔽它的压缩会追加一次新的注入。仅主体编辑的技能会改变后续注入，而不会改变本包的可见性决策。

## 已知局限与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **首轮信号仅基于文本** —— 不引用任何 `programmingSignals` 模式的请求会被视为平凡，即便工作区显然是代码库；部署方应按自己对“非平凡”的定义调整正则列表。
- **升级按轮次计数而非内容** —— 多轮的非编程闲聊会在 `escalateAtTurn` 打开闸门；此处注入的技能主体低危害，仅因为模型找不到适用技能。
- **产物引用可能触发读取/摘要请求** —— 代码文件扩展名或目录标记会匹配“解释这个文件”这种一次性请求；除配置模式外，闸门没有意图分类器。
- **除模式外没有内容分类器** —— 闸门是确定性的，不发起模型调用，因此无法区分共享无任何信号的微妙平凡与非平凡措辞。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 —— 点击展开</summary>

无。

</details>
