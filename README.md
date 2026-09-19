# dsh-quick-model

把 DSH 的 **设置 → 模型** 页换成一个「一步到位」的面板。

原来的流程要自己想清楚服务商标识、接口地址、线路协议、密钥变量名，再一个一个手打模型 id。这个面板把这件事压成两步：**粘贴地址和密钥 → 勾选模型 → 保存**。

## 安装

三个来源，任选其一 —— 都是同一条命令的形式。

**从 npm**（包已发布时，其他人最省事）：

```sh
dsh plugin --profile <profile名> add dsh-quick-model
```

**从 GitHub**（未发 npm 时也能一行装。本包是纯 JavaScript、**没有构建步骤**，
所以不会撞上 pnpm 默认拦截 git 依赖 `prepare` 脚本的 `allowBuilds` 门槛）：

```sh
dsh plugin --profile <profile名> add github:<用户名>/dsh-quick-model
```

**从 GitHub Release 的 tarball URL**（最适合嵌进别的安装器）：

```sh
dsh plugin --profile <profile名> add https://github.com/<用户名>/dsh-quick-model/releases/download/v1.0.0/dsh-quick-model-1.0.0.tgz
```

**从本地 tarball / 本地目录**（离线分发或开发时）：

```sh
dsh plugin --profile <profile名> add ./dsh-quick-model-1.0.0.tgz
dsh plugin --profile <profile名> add D:\path\to\dsh-quick-model
```

> `dsh plugin` 是 pnpm 的转发器：它在 profile 目录里跑 `pnpm add`，然后对照安装结果把
> `dsh.profile.bundles` 补齐。绝对路径与 `file:` 规格会原样传递；只有 `.` / `..` 这类相对
> 路径会被锚定到你当前所在目录。

**安装后必须重启 DSH。** profile 的 bundle 列表是**启动时**的快照 —— 只有用户
`cordis.patch.yml` 被编辑时才会热重载，新增 bundle 不会热挂载。重启后打开
「设置 → 模型」，看到的就是这个面板。

卸载：

```sh
dsh plugin --profile <profile名> remove dsh-quick-model
```

卸载并重启后，官方模型页自动回来。

### 给安装器作者

`scripts/install.ps1` 与 `scripts/install.sh` 是对上面那条命令的薄封装，可直接嵌入别的安装器：

```powershell
.\install.ps1 -Profile web -Source github:someone/dsh-quick-model
```

```sh
./install.sh web github:someone/dsh-quick-model
```

它们在 `dsh` 不在 PATH 时报错退出（码 2）、安装失败时退出（码 1）、安装后调用本包自己的
契约自检（失败则退出码 3），最后打印"必须重启"的提示。两者都是**纯 ASCII**，不受编码或
区域设置影响。`SKIP_VERIFY=1`（sh）或 `-SkipVerify`（ps1）可在未随附 `validate.mjs` 时跳过自检。

## 发布（维护者）

包已经在本地建好 git 仓库并提交，`dsh-quick-model` 这个名字在 npm 上是空的。发布只要三步：

```sh
# 1. 在 github.com 新建一个空仓库 dsh-quick-model（不要勾选初始化 README）
git remote add origin https://github.com/<用户名>/dsh-quick-model.git
git push -u origin main
```

```sh
# 2. 发到 npm —— 之后任何人都能 `dsh plugin add dsh-quick-model`
npm login
npm publish --access public
```

```sh
# 3. 后续版本：打 tag 即自动发布（CI 会先跑自检，再发 npm 并附上 Release tarball）
npm version patch && git push --follow-tags
```

第 3 步依赖仓库里配好 `NPM_TOKEN` secret（npmjs.com → Access Tokens → Generate New Token
→ **Automation**，Automation 类型才能免 2FA 在 CI 里发布）。只做第 1 步、不发 npm 也可以 ——
GitHub 通道能独立工作。

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

官方那一行被关掉后，它声明的扩展点也随之消失：`settings.models.provider-card`、
`settings.models.footer`、`settings.onboarding`。标准 web profile 里没有别的插件往这些位置
注册，所以无影响。**如果你之后装了依赖这些扩展点的第三方插件**，就把上面那条 `disabled`
从 `cordis.patch.yml` 里删掉 —— 本插件会转而与官方页面并排显示，而不是替换它。

### 取消替换

卸载 + 重启，官方模型页自动回来。不需要改任何产品代码。

## 依赖

需要 profile 里有 `settings`、`credentials`、`llm`、`agentDefaultModel`、`webServer` 五个服务（标准 web profile 全部自带）。浏览器侧需要 `slots`。

## License

MIT
