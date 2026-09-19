# dsh-quick-model

把 DSH 的 **设置 → 模型** 页换成一个「一步到位」的面板。

原来的流程要自己想清楚服务商标识、接口地址、线路协议、密钥变量名，再一个一个手打模型 id。这个面板把这件事压成两步：**粘贴地址和密钥 → 勾选模型 → 保存**。

> [!IMPORTANT]
> **⚠️ 待注意：本插件通过「关闭 DSH 自带的模型页」来取代它。**
> 安装前请先读 [安装](#安装) 一节里的警示 —— 特别是"卸载方式"和"不要只禁用它"两条。

## 安装

**从 npm（推荐，一行搞定）：**

```sh
dsh plugin --profile web add dsh-quick-model
```

装完 **重启 DSH**，再**强刷页面**（`Ctrl` + `Shift` + `R`），就是这个面板。

> [!WARNING]
> **⚠️ 待注意 —— 装它等于关掉官方「模型」页**
>
> 本插件启用后会**禁用 DSH 自带的 `ui-settings-models` 那一行**，并占住它的位置。
> 这是它的工作原理，不是故障。装之前请确认你能接受下面四点。
>
> - **只有一份模型页。** 官方那一页不会与它并存 —— 你没看到第二份是正常的。
> - **想还原只需两步：** `dsh plugin --profile web remove dsh-quick-model` 然后重启，
>   官方模型页自动回来。不需要改任何产品文件。
> - **不要在插件面板里"只禁用它"。** 只把这一行设为 `disabled: true` 而不卸载，
>   会让你的模型设置页**空白** —— 因为官方那行也已经被关了。
> - **它同时撤掉了三个扩展点：** `settings.models.provider-card`、
>   `settings.models.footer`、`settings.onboarding`。如果你之后要装依赖这些位置的第三方
>   插件，请删掉本包 `cordis.patch.yml` 里那条 `disabled`，本插件会改为与官方页面并排显示。
>
> 完整说明见 [它是怎么把官方页面关掉的](#它是怎么把官方页面关掉的)。

**从 GitHub**（npm 不可用时的等价方案。本包是纯 JavaScript、**没有构建步骤**，所以不会撞上
pnpm 默认拦截 git 依赖 `prepare` 脚本的 `allowBuilds` 门槛）：

```sh
dsh plugin --profile web add github:jiyuljc/dsh-quick-model
```

下面几种写法等价，都实测可用：

```sh
dsh plugin --profile web add git+https://github.com/jiyuljc/dsh-quick-model.git
dsh plugin --profile web add https://github.com/jiyuljc/dsh-quick-model
```

**从本地 tarball / 本地目录**（离线分发或开发时）：

```sh
dsh plugin --profile web add ./dsh-quick-model-1.0.1.tgz
dsh plugin --profile web add D:\path\to\dsh-quick-model
```

> `--profile web` 里的 `web` 是 profile 名，换用别的 profile 就改这里。
> `dsh plugin` 是 pnpm 的转发器：它在 profile 目录里跑 `pnpm add`，然后对照安装结果把
> `dsh.profile.bundles` 补齐。绝对路径与 `file:` 规格会原样传递；只有 `.` / `..` 这类相对
> 路径会被锚定到你当前所在目录。

### 装完必须重启，并且重新加载页面

**这两步都不能省**，缺任何一步都会让你觉得"装了没反应"：

1. **重启 DSH。** profile 的 bundle 列表是**启动时**读一次的快照，新加的 bundle 不会被热挂载。
2. **强制刷新浏览器页面**（`Ctrl` + `Shift` + `R`）。

第 2 步的原因：浏览器里的客户端模块清单来自页面加载那一刻注入的 `window.__DSH_BOOT__`。
DSH 重启**不会**自动刷新已打开的标签页，旧页面会继续挂着旧模块 —— 表现就是"面板还是老样子"。
普通 `F5` 可能读到缓存的 `index.html`，所以在 DSH 重启后请用强刷。

### 卸载

```sh
dsh plugin --profile web remove dsh-quick-model
```

卸载 + 重启后官方模型页自动回来。

### 给安装器作者

`scripts/install.ps1` 与 `scripts/install.sh` 是对上面那条命令的薄封装，可直接嵌入别的安装器：

```powershell
.\install.ps1 -Profile web -Source dsh-quick-model
.\install.ps1 -Profile web -Source github:jiyuljc/dsh-quick-model
```

```sh
./install.sh web dsh-quick-model
./install.sh web github:jiyuljc/dsh-quick-model
```

它们在 `dsh` 不在 PATH 时报错退出（码 2）、安装失败时退出（码 1）、安装后调用本包自己的
契约自检（失败则退出码 3），最后打印"必须重启"的提示。两者都是**纯 ASCII**，不受编码或
区域设置影响。`SKIP_VERIFY=1`（sh）或 `-SkipVerify`（ps1）可在未随附 `validate.mjs` 时跳过自检。

## 发布（维护者）

`dsh-quick-model@1.0.0` 已发布到 npm。首次发布之后，后续版本有三种方式：

```sh
# A. 本地手动发（npm 会在发布时要求一次 2FA 验证码）
npm login --registry https://registry.npmjs.org/
npm publish --registry https://registry.npmjs.org/ --access public --otp <6位验证码>
```

```sh
# B. 打 tag 交给 CI（推荐）
npm version patch && git push --follow-tags
```

```sh
# C. 只推代码，不发 npm
git push -u origin main
```

### 认证现状（容易踩坑，务必看）

npm 的认证方式在 2025-12-09 变过一次，网上大量教程已经过时：

- **classic token 被永久撤销**，包括以前常说的 "Automation token"。那个选项在
  npmjs.com 的令牌页面上**已经不存在**了。
- `npm login` 现在拿到的是**两小时会话令牌**，且**发布时会额外要求一次 2FA 验证** ——
  所以 `npm publish` 通常需要 `--otp <验证码>`。
- **granular access token** 只有在勾选 **Bypass two-factor authentication (2FA)** 时才能用于
  发布。勾了之后令牌元数据里 `bypass_2fa: true` —— 可以用
  `GET https://registry.npmjs.org/-/npm/v1/tokens`（带该令牌）自查这个字段。这类令牌对"直接
  发布"正在收紧，属于过渡方案。
- **CI 的推荐路径是 OIDC trusted publishing**（本仓库工作流已采用）：不需要任何长期令牌。
  一次性配置：在包的 npm 设置页添加 Trusted Publisher，provider 选 GitHub Actions，
  repository 填 `<owner>/dsh-quick-model`，workflow filename 填 `publish.yml`。配好之后
  方式 B 就能无人值守发布，并自动附带 provenance 证明。

GitHub 通道可以独立于 npm 工作 —— 只推仓库不发包，`dsh plugin --profile web add github:jiyuljc/dsh-quick-model` 一样能装。

> 仓库目前**没有 tag、没有 Release**。README 里不再给出 Release tarball 的安装写法，因为
> 那种 URL 在 Release 实际存在之前必然是 404。等 `publish.yml` 随 tag 跑过之后，才会产出
> `https://github.com/jiyuljc/dsh-quick-model/releases/download/<tag>/dsh-quick-model-<版本>.tgz`。

## 自检

安装前后都可以跑这两个脚本，它们检查的是 loader 与客户端模块扫描器**真正会强制**的契约，
而不是"看起来对"：

```sh
# 1. 打包契约 + 客户端半在桩浏览器里真实加载
node scripts/validate.mjs <profile目录> dsh-quick-model

# 2. Host 半挂到桩服务上，真跑一遍路由与全部动作
node scripts/smoke-host.mjs lib/index.js
```

第一个验证：包能否从 profile 解析、`dsh.bundle.patch` 是否存在且能解析出 insert 行、
`dsh.client` 是否声明、`exports["./client"]` 是否可读、Host 半是否导出
`{ name, inject, apply }`、客户端半是否真的调用 `__ModuleLoader__.load` 并以
`settings.section` + 官方 `models` id 注册。

第二个验证：路由注册、`/state` 的组装、`discover` 的规范化、`save` 的校验与写入顺序、
`remove` / `set-default` / `probe`、以及各种拒绝路径。

两个脚本都不需要启动 DSH。

## 它到底做了什么

面板里所有读写都走 Host 半注册的两个接口，密钥**从不进入浏览器**：

| 接口 | 作用 |
| --- | --- |
| `GET /api/quick-model/state` | 当前已配置服务商、pi-ai 服务商目录、当前默认模型 |
| `POST /api/quick-model/action` | `discover` / `save` / `remove` / `set-default` / `probe` |

Host 半用的就是官方模型页同一套接缝：

- `ctx.settings` —— 读写 `settings.yaml` 里的 `llm-pi-ai.providers.<route>`
- `ctx.credentials` —— 把密钥写进 `$DSH_HOME/.credentials.yaml`，配置里只留 `apiKeyEnv` 引用
- `ctx.llm` —— `discoverModels` 探测端点、`resolveModelInfo` 解析模型能力
- `ctx.agentDefaultModel` —— 保存 `{ provider, model, reasoningEffort }`

## 界面

**当前默认模型** —— 显示 provider / model，旁边的推理强度下拉（默认 / off / low / medium / high / max）改完点「应用」。

**添加服务商** —— 两个页签：

- *常用网关 / 自定义*：13 个预设一键填入地址与协议（DeepSeek、阿里云百炼、硅基流动、Kimi、智谱 GLM、火山方舟、MiniMax、OpenRouter、OpenAI、Anthropic、Ollama、vLLM/LM Studio）。填好后点「拉取模型列表」，面板会请求 `baseURL + /models`，把模型列出来供你搜索、全选、勾选。
- *内置服务商目录*：从 pi-ai 已安装的目录里选，模型列表离线可得，不联网。

**已配置服务商** —— 每行显示名称、标识、端点、协议、模型数量与密钥状态；展开可看全部模型，**点任意一个模型即把它设为默认**；右侧可删除。

## 几个刻意的设计

- **密钥变量名留空会自动生成**（如 `OPENROUTER_API_KEY`）。若该引用已被环境变量或 `.env` 提供，则跳过写入并如实告知来源，不会假装成功。
- **勾选全部模型时不写 `models` 字段**，让该路由继续跟随目录；只有你手动削减时才写死清单。
- **内置目录里已存在的服务商，保存时不写 `api`**，避免把目录路由强行变成手写路由（后者会收窄可用范围）。
- **写入走 `settings.mutate` 的路径寻址**，只动你看到的那一项，不覆盖同文件里的其他配置。
- 面板**只显示走 pi-ai 适配器的路由**。`deepseek-official` 之类由 composition 提供的路由不出现在列表里 —— 这不是遗漏，是这个页面的职责边界。

## 它是怎么把官方页面关掉的

两件事一起做，缺一不可：

1. **关掉官方那一行。** 本包的 `cordis.patch.yml` 里有一条 id 定向补丁：

   ```yaml
   - id: ui-settings-models
     disabled: true
   ```

   `ui-settings-models` 就是 web bundle 里提供「设置 → 模型」页的那一行。bundle patch 按
   `dsh.profile.bundles` 顺序叠加，而 `dsh plugin add` 把新 bundle 追加到最后 —— 所以我们的
   补丁在 `@deepseek-ai/dsh-web-app` 之后生效，`disabled` 覆盖成功。

2. **占用同一个导航格子。** 浏览器半注册进 `settings.section` 并复用官方那个 `models` id。
   按该插槽契约，新 id 会被加在官方条目**旁边**；而官方那一行已被关掉，格子是空的 —— 两边
   都对上，导航里就只剩一个「模型」。

### 代价

**1. 只有一份模型页。** 官方那一行被关掉后就不会与它并存 —— 导航里只剩一个「模型」，点进去
是本插件的面板。这是设计，不是故障。

**2. 不要"只禁用它"。** 如果你的目的是临时停用，请**卸载**（`dsh plugin --profile web remove
dsh-quick-model`）而不是把插件行设为 `disabled: true`。只禁用插件行的话，官方那行仍然是关的 ——
结果是你的模型设置页**整个空白**，而卸载是干净的。

**3. 三个扩展点会被撤掉。** 官方那一行声明的 `settings.models.provider-card`、
`settings.models.footer`、`settings.onboarding` 随它一起消失。标准 web profile 里没有别的
插件往这些位置注册，所以无影响。**如果你之后装了依赖这些扩展点的第三方插件**，就把
`cordis.patch.yml` 里那条 `disabled` 删掉 —— 本插件会转而与官方页面并排显示，而不是替换它。

### 取消替换

卸载 + 重启，官方模型页自动回来。不需要改任何产品代码。

## 依赖

需要 profile 里有 `settings`、`credentials`、`llm`、`agentDefaultModel`、`webServer` 五个服务（标准 web profile 全部自带）。浏览器侧需要 `slots`。

## License

MIT
