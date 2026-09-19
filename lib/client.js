// dsh-quick-model — browser half.
//
// Replaces the shipped Settings → Models page. It registers into the
// `settings.section` slot with the shipped id `models`; per that slot's
// contract a fresh id would be added BESIDE the shipped entries, while reusing
// a shipped id puts this plugin in THAT cell and replaces it — which is the
// whole point of this plugin.
//
// The panel never touches settings or credentials itself. Everything goes
// through the host routes registered by lib/index.js:
//
//   GET  /api/quick-model/state
//   POST /api/quick-model/action
//
// so the API key is never present in the page.
//
// Styling uses only `--dsw-*` theme tokens that exist in the shipped theme
// build, so the panel follows light/dark mode on its own.
window.__ModuleLoader__.load({
	id: "dsh-quick-model",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const h = react.createElement;
		const { useState, useEffect } = react;

		// ---- styles ----------------------------------------------------
		const CSS = `
.dsh-qmodel { display: flex; flex-direction: column; gap: 16px; }
.dsh-qmodel h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dsh-qmodel .hint { margin: 0; font-size: 13px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.dsh-qmodel .card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.dsh-qmodel .card-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dsh-qmodel .muted { font-size: 12px; font-weight: 400; color: var(--dsw-alias-label-secondary); }
.dsh-qmodel .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dsh-qmodel .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
.dsh-qmodel .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dsh-qmodel .field > span { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-qmodel input, .dsh-qmodel select { font: inherit; font-size: 13px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); min-width: 0; width: 100%; box-sizing: border-box; }
.dsh-qmodel input:focus, .dsh-qmodel select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dsh-qmodel button { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 8px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); white-space: nowrap; }
.dsh-qmodel button:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dsh-qmodel button:disabled { opacity: 0.5; cursor: default; }
.dsh-qmodel button.primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.dsh-qmodel .tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dsh-qmodel button.tab { border: none; border-radius: 0; background: transparent; color: var(--dsw-alias-label-secondary); border-bottom: 2px solid transparent; padding: 6px 2px; }
.dsh-qmodel button.tab.on { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); }
.dsh-qmodel .notice { border-radius: 8px; padding: 9px 12px; font-size: 13px; line-height: 1.6; border: 1px solid var(--dsw-alias-border-l1); }
.dsh-qmodel .notice.ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.dsh-qmodel .notice.err { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dsh-qmodel .current-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; color: var(--dsw-alias-label-primary); }
.dsh-qmodel code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; padding: 2px 6px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.dsh-qmodel .picker { display: flex; flex-direction: column; gap: 10px; border-top: 1px dashed var(--dsw-alias-border-l1); padding-top: 12px; }
.dsh-qmodel .picker-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dsh-qmodel .picker-bar input { flex: 1 1 200px; }
.dsh-qmodel .chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 250px; overflow: auto; padding: 2px; }
.dsh-qmodel button.chip { border-radius: 999px; padding: 4px 11px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-qmodel button.chip.on { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-qmodel .provider { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden; }
.dsh-qmodel .provider + .provider { margin-top: 10px; }
.dsh-qmodel .provider-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; }
.dsh-qmodel .provider-main { display: flex; flex-direction: column; gap: 4px; cursor: pointer; min-width: 0; }
.dsh-qmodel .provider-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dsh-qmodel .provider-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.dsh-qmodel .provider-side { display: flex; align-items: center; gap: 8px; }
.dsh-qmodel .provider-body { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 10px; }
.dsh-qmodel .tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dsh-qmodel .tag.ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.dsh-qmodel .tag.warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
`;
		const CSS_TAG_ID = "dsh-quick-model/panel.css";
		if (
			typeof document !== "undefined" &&
			document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]") === null
		) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-quick-model";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ---- host API --------------------------------------------------
		const API = "/api/quick-model";

		async function getState() {
			const res = await fetch(API + "/state", { cache: "no-store" });
			if (!res.ok) throw new Error("HTTP " + res.status);
			return res.json();
		}

		/** POST one action. JSON.stringify drops undefined fields, so an omitted field stays omitted. */
		async function postAction(action, payload) {
			const res = await fetch(API + "/action", {
				method: "POST",
				headers: { "content-type": "application/json" },
				cache: "no-store",
				body: JSON.stringify(Object.assign({ action: action }, payload || {})),
			});
			if (!res.ok) throw new Error("HTTP " + res.status);
			return res.json();
		}

		// ---- presets ---------------------------------------------------
		const PRESETS = [
			{ label: "— 自定义 —", route: "", baseURL: "", api: "openai-completions" },
			{ label: "DeepSeek 官方", route: "deepseek", baseURL: "https://api.deepseek.com/v1", api: "openai-completions" },
			{ label: "阿里云百炼 · 通义千问", route: "dashscope", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", api: "openai-completions" },
			{ label: "硅基流动 SiliconFlow", route: "siliconflow", baseURL: "https://api.siliconflow.cn/v1", api: "openai-completions" },
			{ label: "月之暗面 Kimi", route: "moonshot", baseURL: "https://api.moonshot.cn/v1", api: "openai-completions" },
			{ label: "智谱 GLM", route: "zhipu", baseURL: "https://open.bigmodel.cn/api/paas/v4", api: "openai-completions" },
			{ label: "火山方舟 · 豆包", route: "volcengine", baseURL: "https://ark.cn-beijing.volces.com/api/v3", api: "openai-completions" },
			{ label: "MiniMax", route: "minimax", baseURL: "https://api.minimax.chat/v1", api: "openai-completions" },
			{ label: "OpenRouter", route: "openrouter", baseURL: "https://openrouter.ai/api/v1", api: "openai-completions" },
			{ label: "OpenAI 官方", route: "openai", baseURL: "https://api.openai.com/v1", api: "openai-completions" },
			{ label: "Anthropic 官方", route: "anthropic", baseURL: "https://api.anthropic.com", api: "anthropic-messages" },
			{ label: "Ollama 本地", route: "ollama", baseURL: "http://localhost:11434/v1", api: "openai-completions" },
			{ label: "vLLM / LM Studio 本地", route: "local", baseURL: "http://localhost:8000/v1", api: "openai-completions" },
		];
		const APIS = ["openai-completions", "openai-responses", "anthropic-messages"];
		const EFFORTS = ["", "off", "low", "medium", "high", "max"];

		const fmtCtx = function (n) {
			if (typeof n !== "number" || n <= 0) return "";
			if (n >= 1048576) return Math.round(n / 104857.6) / 10 + "M";
			return Math.round(n / 1024) + "K";
		};
		const errText = function (e) {
			return e && typeof e === "object" && typeof e.message === "string" && e.message.length > 0 ? e.message : String(e);
		};
		const trimmed = function (s) {
			return typeof s === "string" ? s.trim() : "";
		};

		// ---- the panel -------------------------------------------------
		function QuickModelSection() {
			const [snap, setSnap] = useState({ loading: true, writable: true, providers: [], directory: [], current: null });
			const [tick, setTick] = useState(0);
			const [tab, setTab] = useState("preset");
			const [presetIdx, setPresetIdx] = useState(0);
			const [catalogId, setCatalogId] = useState("");
			const [route, setRoute] = useState("");
			const [displayName, setDisplayName] = useState("");
			const [baseURL, setBaseURL] = useState("");
			const [api, setApi] = useState("openai-completions");
			const [apiKey, setApiKey] = useState("");
			const [apiKeyEnv, setApiKeyEnv] = useState("");
			const [models, setModels] = useState([]);
			const [picked, setPicked] = useState({});
			const [filter, setFilter] = useState("");
			const [busy, setBusy] = useState("");
			const [notice, setNotice] = useState(null);
			const [openRoute, setOpenRoute] = useState("");
			const [rowModels, setRowModels] = useState({});
			const [effort, setEffort] = useState("");

			useEffect(() => {
				let alive = true;
				getState()
					.then((res) => {
						if (!alive) return;
						const r = res && typeof res === "object" ? res : {};
						setSnap({
							loading: false,
							writable: r.writable !== false,
							providers: Array.isArray(r.providers) ? r.providers : [],
							directory: Array.isArray(r.directory) ? r.directory : [],
							current: r.current && typeof r.current === "object" ? r.current : null,
						});
					})
					.catch((e) => {
						if (!alive) return;
						setSnap({ loading: false, writable: true, providers: [], directory: [], current: null });
						setNotice({ kind: "err", text: "读取配置失败：" + errText(e) });
					});
				return () => {
					alive = false;
				};
			}, [tick]);

			const currentKey = snap.current
				? snap.current.provider + "/" + snap.current.model + "#" + snap.current.reasoningEffort
				: "";
			useEffect(() => {
				setEffort(snap.current && snap.current.reasoningEffort ? snap.current.reasoningEffort : "");
			}, [currentKey]);

			// Expanding a route that serves its whole catalog needs the catalog
			// model list, which only the host can name. Offline for catalog routes.
			useEffect(() => {
				if (!openRoute) return undefined;
				let row = null;
				for (const candidate of snap.providers) if (candidate.route === openRoute) row = candidate;
				if (row === null) return undefined;
				if (row.modelsReplaced && row.models.length > 0) return undefined;
				let alive = true;
				postAction("discover", { provider: openRoute })
					.then((res) => {
						if (!alive || !res || !res.ok || !Array.isArray(res.models)) return;
						setRowModels((prev) => Object.assign({}, prev, { [openRoute]: res.models }));
					})
					.catch(() => {});
				return () => {
					alive = false;
				};
			}, [openRoute, tick]);

			const reload = () => setTick((t) => t + 1);

			const call = async (action, payload, busyKey) => {
				setBusy(busyKey);
				try {
					const res = await postAction(action, payload);
					return res && typeof res === "object" ? res : { ok: false, error: "宿主返回了意外的结果" };
				} catch (e) {
					return { ok: false, error: errText(e) };
				} finally {
					setBusy("");
				}
			};

			const doDiscover = async (payload) => {
				setNotice(null);
				const res = await call("discover", payload, "discover");
				if (res.ok) {
					const list = Array.isArray(res.models) ? res.models : [];
					const all = {};
					for (const m of list) all[m.id] = true;
					setModels(list);
					setPicked(all);
					setFilter("");
					if (list.length === 0) setNotice({ kind: "err", text: "这个端点没有返回任何模型，请检查地址是否正确" });
					else setNotice({ kind: "ok", text: "拉取到 " + list.length + " 个模型，取消不需要的，然后点「保存并启用」" });
				} else {
					setNotice({ kind: "err", text: res.error || "拉取失败" });
				}
			};

			const applyPreset = (i) => {
				const p = PRESETS[i];
				setPresetIdx(i);
				setRoute(p.route);
				setBaseURL(p.baseURL);
				setApi(p.api);
			};

			const discoverFromPreset = () => {
				const p = PRESETS[presetIdx];
				const url = trimmed(baseURL) || p.baseURL;
				if (!url) {
					setNotice({ kind: "err", text: "请先填写接口地址 baseURL" });
					return;
				}
				doDiscover({
					provider: trimmed(route) || p.route || undefined,
					baseURL: url,
					api: api,
					apiKey: trimmed(apiKey) || undefined,
					apiKeyEnv: trimmed(apiKeyEnv) || undefined,
				});
			};

			const discoverFromCatalog = () => {
				if (!catalogId) {
					setNotice({ kind: "err", text: "请先选择一个内置服务商" });
					return;
				}
				doDiscover({
					provider: catalogId,
					apiKey: trimmed(apiKey) || undefined,
					apiKeyEnv: trimmed(apiKeyEnv) || undefined,
				});
			};

			const finishSave = (res) => {
				if (res.ok) {
					setNotice({
						kind: "ok",
						text:
							"已保存服务商「" +
							res.route +
							"」，密钥引用 " +
							res.apiKeyEnv +
							(res.keyNote ? " · " + res.keyNote : "") +
							" · 已生效",
					});
					setModels([]);
					setPicked({});
					setApiKey("");
					setFilter("");
					reload();
				} else {
					setNotice({ kind: "err", text: res.error || "保存失败" });
				}
			};

			const savePreset = async () => {
				const chosen = models.filter((m) => picked[m.id] === true);
				const p = PRESETS[presetIdx];
				const finalRoute = trimmed(route) || p.route;
				let inDirectory = false;
				for (const d of snap.directory) if (d.provider === finalRoute) inDirectory = true;
				// A route pi-ai already ships keeps its catalog protocol unless the
				// operator picked a custom one; writing `api` on a catalog route
				// forces the hand-declared construction path, which narrows it.
				const res = await call(
					"save",
					{
						route: finalRoute,
						displayName: trimmed(displayName) || undefined,
						baseURL: trimmed(baseURL) || p.baseURL || undefined,
						api: inDirectory ? undefined : api,
						apiKey: trimmed(apiKey) || undefined,
						apiKeyEnv: trimmed(apiKeyEnv) || undefined,
						catalog: false,
						replaceModels: true,
						models: chosen,
					},
					"save",
				);
				finishSave(res);
			};

			const saveCatalog = async () => {
				const chosen = models.filter((m) => picked[m.id] === true);
				const all = models.length > 0 && chosen.length === models.length;
				const res = await call(
					"save",
					{
						route: catalogId,
						apiKey: trimmed(apiKey) || undefined,
						apiKeyEnv: trimmed(apiKeyEnv) || undefined,
						catalog: true,
						replaceModels: chosen.length > 0 && !all,
						models: chosen,
					},
					"save",
				);
				finishSave(res);
			};

			const removeRoute = async (r) => {
				const res = await call("remove", { route: r }, "remove:" + r);
				if (res.ok) {
					setNotice({ kind: "ok", text: "已删除服务商「" + r + "」" });
					if (openRoute === r) setOpenRoute("");
					reload();
				} else {
					setNotice({ kind: "err", text: res.error || "删除失败" });
				}
			};

			const makeDefault = async (provider, model) => {
				const payload = { provider: provider, model: model };
				if (effort) payload.reasoningEffort = effort;
				const res = await call("set-default", payload, "default");
				if (res.ok) {
					setNotice({ kind: "ok", text: "默认模型已切换为 " + provider + " / " + model });
					reload();
				} else {
					setNotice({ kind: "err", text: res.error || "切换默认模型失败" });
				}
			};

			const toggle = (id) => {
				setPicked((prev) => {
					const next = Object.assign({}, prev);
					if (next[id] === true) delete next[id];
					else next[id] = true;
					return next;
				});
			};
			const selectAll = () => {
				const next = Object.assign({}, picked);
				for (const m of models) next[m.id] = true;
				setPicked(next);
			};
			const clearAll = () => setPicked({});

			const field = (label, value, setter, placeholder) =>
				h(
					"label",
					{ className: "field", key: label },
					h("span", null, label),
					h("input", { value: value, placeholder: placeholder, onChange: (e) => setter(e.target.value) }),
				);

			const filtered = models.filter((m) => {
				const q = filter.trim().toLowerCase();
				if (!q) return true;
				return m.id.toLowerCase().indexOf(q) >= 0 || (m.name || "").toLowerCase().indexOf(q) >= 0;
			});
			let pickedCount = 0;
			for (const m of models) if (picked[m.id] === true) pickedCount += 1;

			const header = h(
				"div",
				{ key: "header" },
				h("h2", null, "模型"),
				h(
					"p",
					{ className: "hint" },
					"选一个服务商，或直接粘贴接口地址和 API Key → 拉取模型列表 → 勾选「保存并启用」。写入后立即生效，不需要重启。",
				),
			);

			const noticeNode = notice ? h("div", { key: "notice", className: "notice " + notice.kind }, notice.text) : null;

			const currentCard = h(
				"section",
				{ key: "current", className: "card" },
				h("div", { className: "card-title" }, "当前默认模型"),
				snap.current
					? h(
							"div",
							{ className: "current-row" },
							h("code", null, snap.current.provider),
							h("span", null, "/"),
							h("strong", null, snap.current.model),
						)
					: h("div", { className: "muted" }, "尚未设置默认模型"),
				h(
					"div",
					{ className: "row" },
					h("span", { className: "muted" }, "推理强度"),
					h(
						"select",
						{
							style: { width: "120px" },
							value: effort,
							disabled: !snap.current,
							onChange: (e) => setEffort(e.target.value),
						},
						EFFORTS.map((v) => h("option", { key: v || "default", value: v }, v === "" ? "默认" : v)),
					),
					snap.current
						? h(
								"button",
								{
									className: "primary",
									disabled: busy !== "",
									onClick: () => makeDefault(snap.current.provider, snap.current.model),
								},
								"应用",
							)
						: null,
				),
			);

			const apiKeyFields = h(
				"div",
				{ className: "grid", key: "key" },
				h(
					"label",
					{ className: "field" },
					h("span", null, "API Key"),
					h("input", {
						type: "password",
						value: apiKey,
						placeholder: "粘贴密钥，例如 sk-...",
						onChange: (e) => setApiKey(e.target.value),
					}),
				),
				h(
					"label",
					{ className: "field" },
					h("span", null, "密钥变量名（可选）"),
					h("input", {
						value: apiKeyEnv,
						placeholder: "留空自动生成，例如 OPENROUTER_API_KEY",
						onChange: (e) => setApiKeyEnv(e.target.value),
					}),
				),
			);

			const catalogOptions = [h("option", { key: "__none", value: "" }, "请选择...")];
			for (const d of snap.directory) {
				catalogOptions.push(h("option", { key: d.provider, value: d.provider }, d.displayName + " (" + d.provider + ")"));
			}

			const catalogFields = h(
				"div",
				{ key: "catalog" },
				h(
					"div",
					{ className: "grid" },
					h(
						"label",
						{ className: "field" },
						h("span", null, "内置服务商"),
						h("select", { value: catalogId, onChange: (e) => setCatalogId(e.target.value) }, catalogOptions),
					),
				),
				h(
					"div",
					{ className: "row" },
					h(
						"button",
						{ className: "primary", disabled: busy !== "" || !catalogId, onClick: discoverFromCatalog },
						busy === "discover" ? "拉取中..." : "拉取模型列表",
					),
					h("span", { className: "muted" }, "内置服务商的模型来自 pi-ai 目录，不联网。"),
				),
			);

			const presetFields = h(
				"div",
				{ key: "preset" },
				h(
					"div",
					{ className: "grid" },
					h(
						"label",
						{ className: "field" },
						h("span", null, "预设"),
						h(
							"select",
							{ value: String(presetIdx), onChange: (e) => applyPreset(Number(e.target.value)) },
							PRESETS.map((p, i) => h("option", { key: p.label, value: String(i) }, p.label)),
						),
					),
					field("接口地址 baseURL", baseURL, setBaseURL, "https://api.example.com/v1"),
					h(
						"label",
						{ className: "field", key: "api" },
						h("span", null, "协议"),
						h(
							"select",
							{ value: api, onChange: (e) => setApi(e.target.value) },
							APIS.map((v) => h("option", { key: v, value: v }, v)),
						),
					),
					field("服务商标识 route（可选）", route, setRoute, "例如 my-gateway"),
					field("显示名称（可选）", displayName, setDisplayName, "例如 我的中转"),
				),
				h(
					"div",
					{ className: "row" },
					h(
						"button",
						{ className: "primary", disabled: busy !== "", onClick: discoverFromPreset },
						busy === "discover" ? "拉取中..." : "拉取模型列表",
					),
					h("span", { className: "muted" }, "会请求 baseURL + /models，需要端点支持 OpenAI 式的列表接口。"),
				),
			);

			const picker =
				models.length === 0
					? null
					: h(
							"div",
							{ className: "picker", key: "picker" },
							h(
								"div",
								{ className: "picker-bar" },
								h("input", { value: filter, placeholder: "搜索模型...", onChange: (e) => setFilter(e.target.value) }),
								h("span", { className: "muted" }, "已选 " + pickedCount + " / " + models.length),
								h("button", { onClick: selectAll }, "全选"),
								h("button", { onClick: clearAll }, "清空"),
							),
							h(
								"div",
								{ className: "chips" },
								filtered.map((m) => {
									const on = picked[m.id] === true;
									const size = fmtCtx(m.contextWindow);
									return h(
										"button",
										{
											key: m.id,
											title: m.id,
											className: on ? "chip on" : "chip",
											onClick: () => toggle(m.id),
										},
										(on ? "✓ " : "") + m.id + (size ? " · " + size : ""),
									);
								}),
							),
							h(
								"div",
								{ className: "row" },
								h(
									"button",
									{
										className: "primary",
										disabled: busy !== "" || pickedCount === 0,
										onClick: tab === "catalog" ? saveCatalog : savePreset,
									},
									busy === "save" ? "保存中..." : "保存并启用（" + pickedCount + " 个模型）",
								),
							),
						);

			const builder = h(
				"section",
				{ key: "builder", className: "card" },
				h(
					"div",
					{ className: "card-title" },
					"添加服务商",
					h("span", { className: "muted" }, snap.directory.length + " 个内置服务商可用"),
				),
				h(
					"div",
					{ className: "tabs" },
					h("button", { className: tab === "preset" ? "tab on" : "tab", onClick: () => setTab("preset") }, "常用网关 / 自定义"),
					h("button", { className: tab === "catalog" ? "tab on" : "tab", onClick: () => setTab("catalog") }, "内置服务商目录"),
				),
				tab === "preset" ? presetFields : catalogFields,
				apiKeyFields,
				picker,
			);

			const rows =
				snap.providers.length === 0
					? h("div", { className: "muted" }, "还没有任何服务商，用上面的表单添加第一个吧。")
					: snap.providers.map((row) => {
							const isOpen = openRoute === row.route;
							const list =
								row.modelsReplaced && row.models.length > 0
									? row.models.map((id) => ({ id: id }))
									: rowModels[row.route] || [];
							return h(
								"div",
								{ key: row.route, className: "provider" },
								h(
									"div",
									{ className: "provider-head" },
									h(
										"div",
										{ className: "provider-main", onClick: () => setOpenRoute(isOpen ? "" : row.route) },
										h(
											"div",
											{ className: "provider-name" },
											row.displayName,
											h("code", null, row.route),
											h("span", { className: "muted" }, isOpen ? "收起" : "展开"),
										),
										h(
											"div",
											{ className: "provider-meta" },
											(row.baseURL || "内置端点") +
												" · " +
												(row.api || "目录协议") +
												" · " +
												(row.modelsReplaced ? row.models.length + " 个模型" : "目录全部模型"),
										),
									),
									h(
										"div",
										{ className: "provider-side" },
										h("span", { className: row.key.configured ? "tag ok" : "tag warn" }, row.key.configured ? "密钥已配置" : "缺少密钥"),
										h("button", { disabled: busy !== "" || !snap.writable, onClick: () => removeRoute(row.route) }, "删除"),
									),
								),
								isOpen
									? h(
											"div",
											{ className: "provider-body" },
											h("div", { className: "muted" }, "点一个模型把它设为默认："),
											h(
												"div",
												{ className: "chips" },
												list.length === 0
													? h("span", { className: "muted" }, "读取模型列表中...")
													: list.map((m) =>
															h(
																"button",
																{
																	key: row.route + "/" + m.id,
																	className: "chip",
																	disabled: busy !== "",
																	onClick: () => makeDefault(row.route, m.id),
																},
																m.id,
															),
														),
											),
											h(
												"div",
												{ className: "muted" },
												"密钥引用：" + (row.apiKeyEnv || "（未设置）") + (row.key.source ? " · 来源 " + row.key.source : ""),
											),
										)
									: null,
							);
						});

			const listCard = h(
				"section",
				{ key: "list", className: "card" },
				h(
					"div",
					{ className: "card-title" },
					"已配置服务商",
					h("span", { className: "muted" }, snap.loading ? "读取中..." : String(snap.providers.length) + " 个"),
				),
				rows,
				snap.writable ? null : h("div", { className: "notice err" }, "当前设置文档不可写，无法保存修改。"),
			);

			return h("div", { className: "dsh-qmodel" }, header, noticeNode, currentCard, builder, listCard);
		}

		// ---- client plugin body ----------------------------------------
		const inject = ["slots"];

		function apply(ctx) {
			// Reusing the shipped `models` id puts this panel in THAT cell and
			// replaces the shipped Models page; a fresh id would sit beside it.
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "models",
						order: 10,
						label: "模型",
					},
					QuickModelSection,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
