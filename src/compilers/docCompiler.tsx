import { readFileSync } from "fs"
import { ansiToHTML } from "tutils/ansi"
import { quoteCSSString } from "tutils/css"
import { quoteHTMLAttribute } from "tutils/html"
import { quoteJSString } from "tutils/js"
import { Fragment, HTML, jsx } from "tutils/jsx"
import { LogEntry, LogLevel } from "tutils/logger"
import { Matcher } from "tutils/matcher"
import { capitalize, pushIfNotExists } from "tutils/misc"
import { containsPath, getDir, getExt, getName, getRoot, joinPath, pathEquals, relativePath, resolvePath, setExt, setRoot } from "tutils/path"
import { isAbsoluteURL, isExternalURL } from "tutils/url"
import { AssetType, Builder, CompileResult, DependencyCallback } from "../builder"
import { formatNaturalNumberToChinese } from "../shared/chinese"
import { parseEmmet } from "../shared/emmet"
import { blockquote, code, container, embed, heading, html, image, link, MarkdownCompiler, parmalink } from "../shared/markdownCompiler"
import { MarkdownListItem, parseMarkdownList } from "../shared/markdownList"
import { MarkdownMeta, parseMarkdownMeta } from "../shared/markdownMeta"
import { SearchIndexManager } from "../shared/searchIndexManager"
import { parseSVGSprite } from "../shared/svgSprite"
import { highlight, normalizeLanguage, removeHighlightMarkers } from "../shared/syntaxHighlighter"
import { TOCItem, TOCManager } from "../shared/tocManager"
import { DocClassOrInterface, DocEnum, DocFunction, DocMember, DocMemberModifiers, DocMemberType, DocNamespace, DocParameter, DocSourceLocation, DocType, DocTypeAlias, DocTypeParameter, DocTypeType, DocVariable, TypeScriptDocParser } from "../shared/typeScriptDocParser"

/** 表示一个文档编译器 */
export class DocCompiler {

	// #region 编译 Markdown

	/** 获取编译器的选项 */
	readonly options: DocCompilerOptions = {
		baseURL: "/",
		repositoryPath: "",
		branch: "master",
		maxTOCLevel: 4,
		counter: true,
		backToTop: true,
	}

	/**
	 * 初始化新的编译器
	 * @param builder 所属的构建器
	 */
	constructor(readonly builder: Builder) {
		Object.assign(this.options, builder.options.doc)
		try {
			this.icons = parseSVGSprite(readFileSync(resolvePath(builder.options.assetsDir, "icons.svg"), "utf8"))
		} catch {
			this.icons = Object.create(null)
		}
		this.options.logo ??= this.renderIcon("logo").toString()
		if (/^zh\b/.test(builder.options.locale)) {
			this.options.counter = ((counts, item) => {
				if (item.level === 0) {
					return `${formatNaturalNumberToChinese(counts[counts.length - 1])}、`
				}
				if (item.level === 1) {
					return `${counts[counts.length - 1]}. `
				}
			})
		}
		this.markdownCompiler = new MarkdownCompiler(builder.options.md)
			.use(image, token => {
				token.attrSet("class", "doc-image-zoom")
				token.attrSet("onclick", "DOC.viewImage(this)")
			})
			.use(blockquote, {
				"i": {
					class: "doc-blockquote doc-info",
					renderIcon: () => this.renderIcon("info", "doc-blockquote-icon")
				},
				"!": {
					class: "doc-blockquote doc-warning",
					renderIcon: () => this.renderIcon("warning", "doc-blockquote-icon")
				},
				"o": {
					class: "doc-blockquote doc-success",
					renderIcon: () => this.renderIcon("success", "doc-blockquote-icon")
				},
				"x": {
					class: "doc-blockquote doc-error",
					renderIcon: () => this.renderIcon("error", "doc-blockquote-icon")
				},
				"!!": {
					class: "doc-blockquote doc-error",
					renderIcon: () => this.renderIcon("alert", "doc-blockquote-icon")
				},
				"?": {
					class: "doc-blockquote doc-info",
					renderIcon: () => this.renderIcon("question", "doc-blockquote-icon")
				},
			}, () => `<div class="doc-blockquote-title">`, () => `</div>`)
			.use(container, {
				renderOpenContainer: (tokens, idx, options, context: DocPageContext) => {
					const token = tokens[idx]
					const title = token.info.trim()
					if (token.meta.detail = /^[>\^]/.test(title)) {
						return `<details${title.startsWith(">") ? "" : " open"}><summary>${this.markdownCompiler.renderInline(title.slice(1).trimStart(), context)}</summary>${token.meta.seperators ? `<div class="doc-grid">` : ""}`
					}
					if (token.meta.tabs = title.includes("|")) {
						return `<div class="doc-tab-header"><ul onclick="DOC.toggleTab(event.target)" role="tablist">${title.split("|").map((tab, index) => `<li tabindex="0" role="tab"${index ? "" : ` class="doc-selected"`}>${this.markdownCompiler.renderInline(tab, context)}</li>`).join("")}</ul></div><div class="doc-tab-body">`
					}
					const emmet = parseEmmet(title, token.meta.seperators ? "doc-grid" : "")
					return `<${token.meta.tag = emmet.tagName ?? "div"}${emmet.props}>`
				},
				renderCloseContainer(tokens, idx) {
					const token = tokens[idx]
					if (token.meta.openContainerToken.meta.detail) {
						return `${token.meta.openContainerToken.meta.seperators ? `</div>` : ""}</details>`
					}
					if (token.meta.openContainerToken.meta.tabs) {
						return `</div>`
					}
					return `</${token.meta.openContainerToken.meta.tag}>`
				},
				renderOpenSeperator(tokens, idx) {
					const token = tokens[idx]
					if (token.meta.openContainerToken.meta.tabs) {
						return `<div class="doc-tab-content${token.meta.index ? "" : " doc-selected"}" role="tabpanel">`
					}
					return `<div class="doc-cell">`
				},
				renderCloseSeperator() {
					return `</div>`
				},
			})
			.use(code, (content, info, context: DocPageContext) => {
				const parts = info.split(/\s+/)
				const language = normalizeLanguage(parts[0])
				const open = parts.includes("open", 1)
				const scrollable = parts.includes("scrollable", 1)
				const emmet = parseEmmet(info)
				const preClassName = `doc-code${scrollable ? " doc-code-scrollable" : ""}`
				const bodyClassName = emmet.className
				const codeBlockType = parts.includes("test", 1) ? CodeBlockType.test :
					parts.includes("example", 1) ? CodeBlockType.example :
						parts.includes("demo", 1) ? CodeBlockType.demo :
							parts.includes("run", 1) ? CodeBlockType.run : CodeBlockType.code
				const compiledCode = codeBlockType !== CodeBlockType.code ? this.compileEmabedCode(removeHighlightMarkers(content), language, context) : null
				const toolbar = this.renderCodeToolBar(content, language, info, compiledCode, context)
				const sourceCode = new HTML(highlight(content, language, "doc-token-"))
				if (compiledCode) {
					const js = compiledCode.js ? <script>{new HTML(compiledCode.js)}</script> : null
					if (compiledCode.container) {
						const html = compiledCode.html ? new HTML(compiledCode.html) : null
						if (codeBlockType === CodeBlockType.test) context.demoForTestCount++
						return <>
							{new HTML(`</div>`)}
							{codeBlockType === CodeBlockType.example ? <div class="doc-example doc-grid">
								<div class="doc-example-code doc doc-section">
									<h5>源码</h5>
									<pre class={preClassName}>
										<code class={`doc-language-${language}`} contenteditable="false" autocorrect="off" autocapitalize="off" spellcheck="false">
											{sourceCode}
										</code>
									</pre>
								</div>
								<div class="doc-example-result">
									<div class="doc doc-section">
										<h5>效果</h5>
									</div>
									<div id={compiledCode.container} class={`doc-run-result ${bodyClassName}`}>
										{html}
									</div>
									{js}
								</div>
							</div> : codeBlockType !== CodeBlockType.run ? <div class={`doc-demo${codeBlockType === CodeBlockType.test ? " doc-demo-test" : ""}`}>
								<div id={compiledCode.container} class={`doc-run-result ${bodyClassName}`}>
									{html}
								</div>
								<details class="doc-section doc doc-demo-code" open={open}>
									<summary>
										{toolbar}
										查看源码
									</summary>
									<pre class={preClassName}>
										<code class={`doc-language-${language}`} contenteditable="false" autocorrect="off" autocapitalize="off" spellcheck="false">
											{sourceCode}
										</code>
									</pre>
								</details>
								{js}
							</div> : <>
								<div id={compiledCode.container} class={`doc-run-result ${bodyClassName}`}>
									{html}
								</div>
								{js}
							</>}
							{new HTML(`<div class="doc doc-section">`)}
						</>
					}
					return codeBlockType === CodeBlockType.run ? js : <>
						<pre class={preClassName}>
							{toolbar}
							<code class={`doc-language-${language}`}>
								{sourceCode}
							</code>
						</pre>
						{js}
					</>
				}
				const detailsMatch = /^\s*([>\^])\s*(.*)$/.exec(info.substring(parts[0].length))
				if (detailsMatch) {
					const open = detailsMatch[1] !== ">"
					return <details class="doc-section doc doc-demo-details" open={open}>
						<summary>
							{toolbar}
							{this.markdownCompiler.renderInline(detailsMatch[2], context)}
						</summary>
						<pre class={preClassName}>
							<code class={`doc-language-${language}`}>
								{sourceCode}
							</code>
						</pre>
					</details>
				}
				return <pre class={preClassName}>
					{toolbar}
					<code class={`doc-language-${language}`}>
						{sourceCode}
					</code>
				</pre>
			})
			.use(link, {
				redirect: (url: string, context: DocPageContext) => {
					const href = this.parseHref(url, context).href
					return href && !isAbsoluteURL(href) && !/^\.\/|\.\.\/|#/.test(href) ? this.options.baseURL + href : href
				},
				externalClass: "doc-link-external",
				renderExternalIcon: () => this.renderIcon("external")
			})
			.use(embed, (type, content, context: DocPageContext) => {
				switch (type) {
					case "icon":
						const emmet = parseEmmet(content)
						return this.renderIcon(emmet.tagName ?? emmet.rest, emmet.className)
					case "link":
						return this.renderDocSeeAlso(content, context)
					default:
						// TODO: 支持内嵌引用
						return `{@${type} ${content}}<!-- 暂不支持 -->`
				}
			})
			.use(html, (content, context: DocPageContext) => this.compileEmbedHTML(content, "jsx", "scss", context))
			.use(heading, (token, content, hash, context: DocPageContext) => {
				const titleLevel = +token.tag.slice(1) || 1
				if (titleLevel === 1 || titleLevel > context.maxTOCLevel || hash === "-") {
					return
				}
				hash = hash && parseEmmet(hash).id || undefined
				const item = token.meta = context.tocManager.add(content, titleLevel - 2, hash)
				return item.anchor
			})
			.use(parmalink, (anchor, token) => <>
				{anchor ? this.renderPermalink(anchor) : null}
				{token.meta?.counter ? <span class="doc-counter">{token.meta.counter}</span> : null}
			</>)
	}

	/** 获取使用的 Markdown 编译器 */
	readonly markdownCompiler: MarkdownCompiler

	/**
	 * 编译 Markdown 中内嵌的 JS 代码
	 * @param content 要编译的代码
	 * @param lang 首选的语言
	 * @param context 生成 Markdown 的上下文
	 */
	protected compileEmbedJS(content: string, lang: string, context: DocPageContext) {
		if (!content) {
			return content
		}
		const scriptID = (++context.scriptCount).toString()
		const result = this.builder.compileTypeScript(`${content}

if (typeof exports !== "undefined") {
	for (var key in exports) {
		window[key] = exports[key];
	}
}`, `${context.sourceURL || ""}#${scriptID}.${lang}`, "transpileOnly", undefined, undefined, { sourceMap: false })
		result.content = result.content.replace(/^define\(/m, "require\(")
		if (result.errors?.length) {
			result.content = this.buildErrorPage(result.errors, ".js", result.content)
		}
		return result.content.replace(/<\/script>/gi, "<\\/script>")
	}

	/**
	 * 编译 Markdown 中内嵌的 HTML 代码
	 * @param content 要编译的代码
	 * @param script 首选的脚本语言
	 * @param style 首选的样式语言
	 * @param demoID 页内唯一标识
	 * @param context 生成 Markdown 的上下文
	 */
	protected compileEmbedHTML(content: string, script: string, style: string, context: DocPageContext) {
		// TODO: 支持 style 使用其它语法
		return content.replace(/(<script(?:'[^']*'|"[^"]*"|[^>])*>)(.*?)(<\/script>)/sgi, (source, start, body, end) => `${start}${this.compileEmbedJS(body, script, context)}${end}`)
	}

	/**
	 * 编译 Markdown 中内嵌的代码，如果不支持该语言则返回 `undefined`
	 * @param content 要编译的代码
	 * @param language 语言
	 * @param context 生成 Markdown 的上下文
	 */
	protected compileEmabedCode(content: string, language: string, context: DocPageContext) {
		if (language === "js" || this.builder.getOutputNames("&." + language).includes("&.js")) {
			let container: string
			content = content.replace(/\b__root__\b/g, () => container ??= `doc_demo_${++context.demoCount}`)
			return {
				container,
				js: this.compileEmbedJS(content, language, context)
			}
		}
		if (language === "html") {
			return {
				container: `doc_demo_${++context.demoCount}`,
				html: this.compileEmbedHTML(content, "jsx", "scss", context),
			}
		}
		if (language === "md") {
			return {
				container: `doc_demo_${++context.demoCount}`,
				html: this.markdownCompiler.render(content, context),
			}
		}
	}

	/**
	 * 渲染代码区块的工具条
	 * @param content 要编译的代码
	 * @param language 语言
	 * @param info 代码块的信息
	 * @param compiledCode 已编译的代码
	 * @param context 生成 Markdown 的上下文
	 */
	protected renderCodeToolBar(content: string, language: string, info: string, compiledCode: { html?: string, js?: string, container?: string } | undefined, context: DocPageContext) {
		return <span class="doc-toolbar">
			<button type="button" aria-hidden="true" class="doc-toolbar-button doc-code-tool-copy" onclick="DOC.handleCopy(this, '已复制', '复制失败')">
				{this.renderIcon("copy")}
				<span class="doc-tooltip doc-arrow">复制源码</span>
			</button>
		</span>
	}

	// #endregion

	// #region 文档页

	/**
	 * 构建指定的文档页
	 * @param content 要编译的 Markdown 源码
	 * @param path 模块的原始绝对路径
	 * @param outPath 模块的输出绝对路径
	 * @param options 附加选项
	 */
	async buildDocPage(content: string, path: string, outPath: string, options?: Partial<DocPageMeta>) {
		const meta = Object.assign(this.parseMarkdownMeta(content, path), options)
		const counter = meta.counter ?? this.options.counter
		const tocManager = new TOCManager(typeof counter === "function" ? counter : counter === false ? null : undefined)
		const context: DocPageContext = {
			url: this.builder.toURL(outPath),
			sourceURL: this.builder.toURL(path),
			errors: [],
			dependencies: [],

			tocManager,
			maxTOCLevel: meta.toc === false ? 0 : typeof meta.toc === "number" ? meta.toc : this.options.maxTOCLevel,
			narrow: meta.narrow,
			demoCount: 0,
			demoForTestCount: 0,
			scriptCount: 0,

			meta: meta,
			title: meta.title,
			subtitle: meta.subtitle,
			state: meta.state ?? "normal",
			tags: meta.tags,
			authors: meta.authors?.map(item => ({ label: item.name, href: item.href })),
			changeLogs: meta.changeLogs?.map(item => ({ label: item }))
		}
		// #title 固定用于标题
		tocManager.addAnchor("title")
		if (meta.keywords) {
			for (const keyword of meta.keywords) {
				this.addSearchKeyword(context.sourceURL, keyword)
			}
		}
		// 生成翻页数据
		if (meta.pager !== false && getDir(context.url)) {
			const indexURL = this.getPageIndexURL(context.url)
			if (indexURL !== context.url) {
				const listAsset = await this.builder.getAsset(indexURL)
				context.dependencies.push(...listAsset.dependencies)
				const listItems = listAsset.content["raw"].items as MarkdownListItem[]
				const sourceURL = setRoot(context.sourceURL, "")
				const siblings = findSiblings(listItems, sourceURL, true) || findSiblings(listItems, sourceURL, false)
				if (siblings) {
					context.activeURL = siblings.activeURL
					if (siblings.prev?.url) {
						context.prevPage = {
							label: siblings.prev.title,
							href: getRoot(context.url) + "/" + this.builder.getHTMLOutputName(siblings.prev.url)
						}
					}
					if (siblings.next?.url) {
						context.nextPage = {
							label: siblings.next.title,
							href: getRoot(context.url) + "/" + this.builder.getHTMLOutputName(siblings.next.url)
						}
					}
				}
				function findSiblings(buildList: MarkdownListItem[], url: string, equals: boolean) {
					const it = flattern(buildList)
					let item: IteratorResult<MarkdownListItem>
					let prevValue: MarkdownListItem
					while (!(item = it.next()).done) {
						const value = item.value as MarkdownListItem
						if (equals ? value.url === url : containsPath(url, value.url)) {
							return {
								activeURL: value.url,
								prev: prevValue,
								next: it.next().value as MarkdownListItem
							}
						}
						prevValue = value
					}
					return { activeURL: url, prev: undefined, next: undefined }
				}

				function* flattern(buildList: MarkdownListItem[]): IterableIterator<MarkdownListItem> {
					for (const item of buildList) {
						if (item.children) {
							yield* flattern(item.children)
						} else {
							yield item
						}
					}
				}
			}
		}
		// 解析 Markdown，提取标题
		const tokens = this.markdownCompiler.parse(meta.body, context)
		// 生成 API 文档
		let api: any
		let loader = ""
		if (meta.api !== false) {
			const jsAsset = await this.builder.getAsset(setExt(context.sourceURL, ".js"))
			context.dependencies.push(...jsAsset.dependencies)
			if (jsAsset.type === AssetType.file) {
				const sourcePath = jsAsset.dependencies[jsAsset.dependencies.length - 1] as string
				context.codeURL = this.builder.toURL(sourcePath)
				if (!outPath.endsWith(".test.html")) {
					context.unitTestURL = setExt(context.codeURL, ".test.js")
				}
				try {
					api = this.renderAPIDoc(sourcePath, context)
				} catch (e) {
					context.errors.push({
						warning: true,
						message: `无法解析 API 文档：${e}`,
						fileName: sourcePath,
						stack: e.stack
					})
				}
				loader = `<script>require("./${getName(outPath, false)}.js", function (exports) {
					window.exports = exports
					for (const key in exports) {
						window[key] = exports[key]
					}
				})</script>`
			} else {
				const cssAsset = await this.builder.getAsset(setExt(context.sourceURL, ".css"))
				context.dependencies.push(...cssAsset.dependencies)
				if (cssAsset.type === AssetType.file) {
					context.codeURL = this.builder.toURL(cssAsset.dependencies[cssAsset.dependencies.length - 1] as string)
					loader = `<script>require("./${getName(outPath, false)}.css")</script>`
				}
			}
		}
		// 计算版本和作者
		if (meta.meta !== false && this.options.readCommits && (!context.authors?.length || !context.changeLogs?.length)) {
			const commits = await this.options.readCommits([path, context.codeURL ? resolvePath(this.builder.options.baseDir, context.codeURL) : null, context.unitTestURL ? resolvePath(this.builder.options.baseDir, context.unitTestURL) : null].filter(t => t))
			const users = new Map<string, { label: string, email: string, href: string, count: number }>()
			let count = commits.length
			const versions: Link[] | undefined = context.changeLogs?.length ? undefined : context.changeLogs = []
			for (const commit of commits) {
				const exists = users.get(commit.authorEmail)
				if (exists) {
					exists.count++
				} else {
					users.set(commit.authorEmail, {
						label: commit.authorName,
						email: commit.authorEmail,
						href: `mailto:${commit.authorEmail}`,
						count: 1
					})
				}
				if (versions && versions.length < 20) {
					versions.push({ label: `${commit.date}(#${count--}, ${commit.authorName})` })
				}
			}
			if (users.size && !context.authors?.length) {
				context.authors = Array.from(users.values()).sort((x, y) => y.count - x.count)
			}
		}
		// 生成目录
		context.narrow ??= !(containsPath(this.builder.options.srcDir, path, this.builder.fs.isCaseInsensitive) || !content || context.codeURL)
		const toc = meta.toc !== false ? this.renderTOC(context) : null
		return {
			content: this.renderDocPage(context.url, context.title, <div class={`${toc ? "doc-article-has-toc" : ""}${context.narrow ? " doc-article-narrow" : ""}`}>
				{this.renderTools(context)}
				{this.renderTitle(context)}
				{meta.meta !== false ? await this.renderMetaInfo(context) : null}
				{this.renderPageHead(context)}
				{toc}
				<div class="doc doc-section">
					{meta.injectHead}
					{new HTML(this.markdownCompiler.renderer.render(tokens, this.markdownCompiler.options, context))}
					{api}
					{meta.injectFoot}
				</div>
				{this.renderPageFoot(context)}
				{new HTML(loader)}
			</div>),
			errors: context.errors,
			dependencies: context.dependencies
		}
	}

	/**
	 * 解析 Markdown 的元数据
	 * @param content 要解析的内容
	 * @param path 文件的路径
	 */
	protected parseMarkdownMeta(content: string, path: string) {
		const result = parseMarkdownMeta(content) as DocPageMeta
		result.title ??= capitalize(getName(path, false))
		result.name ??= containsPath(this.builder.options.srcDir, path) ? capitalize(getName(path, false)) : undefined
		if (result.name?.toLowerCase() === result.title.toLowerCase()) {
			result.name = undefined
		}
		return result
	}

	/**
	 * 渲染工具栏
	 * @param context 当前页面的上下文
	 */
	protected renderTools(context: DocPageContext) {
		const tools = this.renderToolItems(context)
		return tools?.length ? <div class="doc-section doc-popup-trigger doc-article-tools">
			{this.renderIcon("ellipsis")}
			<menu class="doc-menu doc-popup doc-arrow">{tools}</menu>
		</div> : null
	}

	/**
	 * 渲染工具栏项
	 * @param context 页面的上下文
	 */
	protected renderToolItems(context: DocPageContext) {
		return <>
			{context.sourceURL && this.options.repository ? <li>
				<a href={`${this.options.repository}/edit/${this.options.branch}/${this.options.repositoryPath ? this.options.repositoryPath + "/" : ""}${context.sourceURL}`} target="_blank" accesskey="e">
					{this.renderIcon("edit", "doc-icon-space-right")}编辑此页(E)
				</a>
			</li> : null}
			{this.options.repository ? <li>
				<a href={`${this.options.repository}/issues/new?title=${encodeURIComponent(`BUG: ${context.title}`)}`} target="_blank" accesskey="b">
					{this.renderIcon("bug", "doc-icon-space-right")}报告 BUG(B)
				</a>
			</li> : null}
			{context.codeURL && this.options.repository ? <li>
				<a href={`${this.options.repository}/tree/${this.options.branch}/${this.options.repositoryPath ? this.options.repositoryPath + "/" : ""}${context.codeURL}`} target="_blank" accesskey="v">
					{this.renderIcon("code", "doc-icon-space-right")}查看源码(V)
				</a>
			</li> : null}
			<li class="doc-menu-divider">
				<button type="button" onclick="DOC.handleQRCodeClick(this)" accesskey="q">
					{this.renderIcon("qrcode", "doc-icon-space-right")}二维码(Q)
				</button>
			</li>
			{context.demoCount ? <li>
				<button type="button" onclick="DOC.handleToggleDemoCodeClick(this)" accesskey="c">
					{this.renderIcon("terminal", "doc-icon-space-right")}展开示例源码(C)
				</button>
			</li> : null}
			{context.demoForTestCount ? <li>
				<button type="button" onclick="DOC.handleToggleDevMode(this)" accesskey="t">
					{this.renderIcon("test", "doc-icon-space-right")}显示自测用例(T)
				</button>
			</li> : null}
			{context.unitTestURL ? <li>
				<a href={`${this.options.baseURL}tdk/unittest.html?module=${context.unitTestURL}`} target="unittest" accesskey="u">
					{this.renderIcon("unittest", "doc-icon-space-right")}单元测试(U)
				</a>
			</li> : null}
		</>
	}

	/**
	 * 渲染一个标题
	 * @param context 页面的上下文
	 */
	protected renderTitle(context: DocPageContext) {
		return <h1 class="doc-section doc-article-title" id="title">
			{this.renderPermalink("title")}
			{context.title}
			{context.subtitle}
			{context.tags?.map(tag => <span class="doc-tag">{tag}</span>)}
			{context.state ? {
				"developing": <span class="doc-tag doc-error">开发中</span>,
				"experimental": <span class="doc-tag doc-warning">试验中</span>,
				"stable": <span class="doc-tag doc-success">稳定版</span>,
				"deprectated": <span class="doc-tag doc-warning">已废弃</span>,
				"legacy": <span class="doc-tag doc-error">历史遗留</span>
			}[context.state] : null}
		</h1>
	}

	/**
	 * 渲染页面头信息
	 * @param context 页面的上下文
	 */
	protected async renderMetaInfo(context: DocPageContext) {
		const metas = await this.getMetaInfo(context)
		return <div class="doc-section doc-article-meta">
			{metas.map(([title, icon, firstItem, items]) => firstItem ? <div class="doc-article-meta-item">
				<label class="doc-article-meta-label" title={title}>
					{this.renderIcon(icon)}
				</label>
				<div class={`doc-article-meta-value${items.length > 1 ? " doc-popup-trigger" : ""}`}>
					<span>
						{firstItem.href ? <a href={firstItem.href}>{firstItem.label}</a> : firstItem.label}
						{items.length > 1 ? this.renderIcon("chevron-down") : null}
					</span>
					{items.length > 1 ? <ul class="doc-popup">
						{items.map(item => <li>{item.href ? <a href={item.href}>{item.label}</a> : item.label}</li>)}
					</ul> : null}
				</div>
			</div> : null)}
		</div>
	}

	/**
	 * 获取页面的元数据
	 * @param context 页面的上下文
	 */
	protected async getMetaInfo(context: DocPageContext) {
		return [["维护", "maintainer", context.authors?.[0], context.authors], ["版本", "history", context.changeLogs?.[0], context.changeLogs]] as [string, string, Link, Link[]][]
	}

	/**
	 * 渲染一个目录
	 * @param context 页面的上下文
	 */
	protected renderTOC(context: DocPageContext) {
		let count = 0
		const toc = <ul class="doc-collapsed">
			<li class="doc-toc-head"><a href="#title">{context.title}</a></li>
			{context.tocManager.items.map(renderItem)}
		</ul>
		const tocCollapsable = count > 4

		if (count < 2) {
			return
		}
		return <aside class={`doc-section doc-toc${tocCollapsable ? " doc-collapsed" : ""}`}>
			<nav class="doc-toc-container doc-hide-scrollbar">
				{tocCollapsable ? <button type="button" class="doc-toc-title" onclick="DOC.toggleTOCCollapse()">目录{this.renderIcon("chevron-down")}</button> : <div class="doc-toc-title">目录</div>}
				{toc}
				<span class="doc-toc-anchor"></span>
				{tocCollapsable ? <button type="button" title="展开更多" class="doc-toc-more" onclick="DOC.toggleTOCCollapse()">
					{this.renderIcon("chevron-down")}
					{this.renderIcon("ellipsis")}
				</button> : null}
			</nav>
		</aside>

		function renderItem(item: TOCItem) {
			count++
			return <li>
				<a href={"#" + item.anchor}>{item.counter ? <span class="doc-counter">{item.counter}</span> : null}{item.label}</a>
				{item.items ? <ul>{item.items.map(renderItem)}</ul> : null}
			</li>
		}
	}

	/**
	 * 渲染页面顶部
	 * @param context 页面的上下文
	 */
	protected renderPageHead(context: DocPageContext) {
		return context.state ? {
			"developing": <div class="doc">
				<blockquote class="doc-blockquote doc-error">
					<div class="doc-blockquote-title">{this.renderIcon("alert", "doc-blockquote-icon")}正在开发中</div>
					请不要在生产环境使用！
				</blockquote>
			</div>,
			"deprectated": <div class="doc">
				<blockquote class="doc-blockquote doc-warning">
					<div class="doc-blockquote-title">{this.renderIcon("warning", "doc-blockquote-icon")}已废弃</div>
					请尽量不要使用！
				</blockquote>
			</div>
		}[context.state] : null
	}

	/**
	 * 渲染页面底部
	 * @param context 页面的上下文
	 */
	protected renderPageFoot(context: DocPageContext) {
		return context.prevPage || context.nextPage ? <nav class="doc-section doc-pager">
			{context.prevPage ? <a href={this.options.baseURL + context.prevPage.href} title={context.prevPage.label} class="doc-pager-prev">
				{this.renderIcon("arrow-right", "doc-icon-arrow-left")}
				上一页: {context.prevPage.label}
			</a> : null}
			{context.nextPage ? <a href={this.options.baseURL + context.nextPage.href} title={context.nextPage.label} class="doc-pager-next">
				{this.renderIcon("arrow-right", "doc-icon-arrow-right")}
				下一页: {context.nextPage.label}
			</a> : null}
		</nav> : null
	}

	/**
	 * 渲染一个文档页
	 * @param url 文档的地址
	 * @param title 文档的标题
	 * @param content 文档正文
	 */
	protected renderDocPage(url: string, title: string, content: any) {
		return `<!DOCTYPE html>` + <html lang={this.builder.options.locale} class="doc-page">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{title} - {this.options.displayName}</title>
				{this.renderHead(url)}
				<script src={this.options.baseURL + this.getPageIndexURL(url)} defer></script>
			</head>
			<body>
				{this.renderHeader(url)}
				<main class="doc-body">
					<nav class="doc-section doc-sidebar">
						<ul class="doc-menu doc-hide-scrollbar doc-navmenu" onclick="DOC.handleNavMenuClick(event)">
							<li><label class="doc-tip"><span class="doc-spinner doc-icon-space-right"></span>正在加载列表...</label></li>
						</ul>
					</nav>
					<article class="doc-article">
						<script src={this.options.baseURL + "tdk/assets/require.js"}></script>
						{new HTML(`<!--#DOC-ARTICLE-START-->`)}
						{content}
						{new HTML(`<!--#DOC-ARTICLE-END-->`)}
					</article>
					{this.options.backToTop ? <div class="doc-section doc-back-to-top">
						<a href="#" title="返回顶部" onclick="DOC.backToTop(); return false;">
							{this.renderIcon("top")}
						</a>
					</div> : null}
				</main>
				{this.renderFooter(url)}
				{this.renderFoot(url)}
			</body>
		</html>
	}

	// #endregion

	// #region 页面模板

	/**
	 * 渲染顶部的 HTML
	 * @param url 当前页面的地址
	 * @param pageData 页面的附加数据
	 */
	protected renderHead(url: string, pageData?: any) {
		return <>
			<link rel="stylesheet" href={this.options.baseURL + "tdk/assets/doc.css"} />
			{this.options.injectHead ? new HTML(this.options.injectHead) : ""}
			<script>var DOC_PAGE_DATA = {JSON.stringify({
				baseURL: this.options.baseURL,
				searchIndexURL: this.getSearchIndexURL(url),
				pageIndexRoot: getRoot(url) + "/",
				...pageData
			})}</script>
			<script src={this.options.baseURL + "tdk/assets/doc.js"} defer></script>
		</>
	}

	/**
	 * 渲染底部的 HTML
	 * @param url 当前页面的地址
	 */
	protected renderFoot(url: string) {
		return this.options.injectFoot ? new HTML(this.options.injectFoot) : ""
	}

	/**
	 * 渲染头部
	 * @param url 当前页面的地址
	 */
	protected renderHeader(url: string) {
		return <header class="doc-section doc-header">
			<button type="button" aria-label="主菜单" class="doc-navbutton doc-navbutton-navbar" onclick="DOC.toggleNavbar()">
				{this.renderIcon("menu")}
			</button>
			<a href={this.options.baseURL} class="doc-logo">
				{new HTML(this.options.logo)}
				<span class="doc-logo-title">{this.options.displayName}</span>
			</a>
			{this.options.version ? <div class={`doc-version${this.options.versions ? " doc-popup-trigger" : ""}`}>
				{this.options.version}
				{this.options.versions ? this.renderIcon("chevron-down") : null}
				{this.options.versions ? <ul class="doc-menu doc-popup doc-arrow">
					{this.options.versions.map(version => <li>
						{this.renderLink(version.label, version.href, version.title)}
					</li>)}
				</ul> : null}
			</div> : null}
			<nav class="doc-navbar">
				<ul>
					{this.options.navbar?.map(child => <li class={child.href && url.startsWith(child.href) ? "doc-selected" : null}>
						{this.renderLink(<>{child.label}{child.children ? this.renderIcon("chevron-down", "doc-icon-space-left") : null}</>, child.href, child.title)}
						{child.children ? <ul class="doc-menu doc-popup">
							{child.children.map(child => <li>
								{this.renderLink(child.label, child.href, child.title)}
							</li>)}
						</ul> : null}
					</li>)}
				</ul>
			</nav>
			<div class="doc-search">
				<input type="search" placeholder="搜索(Shift+Alt+F)" autocomplete="off" accesskey="f" oninput="DOC.showSearchResult(); DOC.updateSearchResult()" onfocus="DOC.showSearchResult()" onkeydown="DOC.handleSearchKeyDown(event)" />
				{this.renderIcon("search")}
			</div>
			{this.options.repository ? <a href={this.options.repository} target="_blank" class="doc-external">{this.renderIcon("github")}</a> : null}
			<button type="button" aria-label="搜索" class="doc-navbutton doc-navbutton-search" onclick="DOC.toggleSearch()">
				{this.renderIcon("search")}
			</button>
			{url ? <button type="button" aria-label="列表" class="doc-navbutton doc-navbutton-sidebar" onclick="DOC.toggleSidebar()">
				{this.renderIcon("sidebar")}
			</button> : null}
			<div class="doc-progress"></div>
		</header>
	}

	/**
	 * 渲染底部
	 * @param url 当前页面的地址
	 */
	protected renderFooter(url: string) {
		return <footer class="doc-section doc-footer">
			{this.options.footer ? <div class="doc-links">
				{this.options.footer.map((child, index) => <>
					{index ? " | " : null}
					{this.renderLink(child.label, child.href, child.title)}
				</>)}
			</div> : null}
			{this.options.copyright ? <div class="doc-copyright">{this.options.copyright}</div> : null}
		</footer>
	}

	/**
	 * 渲染一个链接
	 * @param label 链接的文案
	 * @param href 链接的地址
	 * @param title 鼠标悬停的工具提示
	 * @param className 可选设置 CSS 类名
	 */
	protected renderLink(label: any, href: string | undefined, title?: string, className?: string) {
		return <a href={href && !isAbsoluteURL(href) && !/^\.\/|\.\.\/|#/.test(href) ? this.options.baseURL + href : href} target={isExternalURL(href) ? "_blank" : null} title={title} class={className}>{label}</a>
	}

	/** 所有可用图标 */
	readonly icons: { [name: string]: string }

	/**
	 * 渲染一个图标
	 * @param name 图标的名称
	 * @param className 可选设置 CSS 类名
	 */
	protected renderIcon(name: string, className?: string) {
		const content = this.icons[name]
		if (content !== undefined) {
			return new HTML(content.replace(`<svg `, `<svg class="doc-icon${className ? " " + className : ""}" `))
		}
		return new HTML(`<svg class="doc-icon${className ? " " + className : ""}"><use xlink:href="${this.options.baseURL}tdk/assets/icons.svg#${name}"></use></svg>`)
	}

	/**
	 * 渲染本节链接
	 * @param anchor 当前链接的哈希值
	 */
	protected renderPermalink(anchor: string) {
		return <a href={"#" + anchor} class="doc-permalink" title="本节链接" aria-hidden="true">
			{this.renderIcon("anchor")}
		</a>
	}

	// #endregion

	// #region API 文档

	/**
	 * 渲染指定文件的 API 文档
	 * @param sourcePath JS/TS 文件路径
	 * @param context 页面的上下文
	 */
	protected renderAPIDoc(sourcePath: string, context: DocPageContext) {
		// 生成 API 文档
		const sourceFile = this.builder.typeScriptCompiler.getSourceFile(sourcePath)
		if (!sourceFile) {
			return
		}
		const program = this.builder.typeScriptCompiler.getCurrentProgram()
		const docParser = context.docParser = new TypeScriptDocParser(program)
		const docSourceFile = docParser.getDocSouceFile(sourceFile)
		if (!docSourceFile.members.length) {
			return
		}
		// 添加目录
		const apiTOC = context.tocManager.add("API", 0)
		return <section class="doc-api-section" onclick="DOC.handleMemberClick(event)">
			<h2 id={apiTOC.anchor}>
				{this.renderPermalink(apiTOC.anchor)}
				<span class="doc-toolbar">
					<button class="doc-toolbar-button doc-api-search">
						<input type="search" placeholder="筛选 API..." required class="doc-api-search-input" oninput="DOC.handleMemberFilter(this)" />
						{this.renderIcon("search")}
						<span class="doc-tooltip doc-arrow">筛选 API</span>
					</button>
					<button class="doc-toolbar-button doc-api-button-collapse" onclick="DOC.toggleMembersCollapse(this)">
						{this.renderIcon("sidebar")}
						<span class="doc-tooltip doc-arrow">全部展开或折叠</span>
					</button>
				</span>
				{apiTOC.counter ? <span class="doc-counter">{apiTOC.counter}</span> : null}
				{apiTOC.label}
			</h2>
			{this.renderDocMembers(docSourceFile.members, 1, context)}
		</section>
	}

	/**
	 * 渲染成员列表
	 * @param members 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocMembers(members: DocMember[], tocLevel: number, context: DocPageContext) {
		return members.map(member => {
			if (member.ignore) {
				return null
			}
			return this.renderDocMember(member, tocLevel, context)
		})
	}

	/**
	 * 渲染指定的成员
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocMember(member: DocMember, tocLevel: number, context: DocPageContext) {
		switch (member.memberType) {
			case DocMemberType.class:
			case DocMemberType.interface:
				return this.renderDocClassOrInterface(member, tocLevel, context)
			case DocMemberType.function:
			case DocMemberType.method:
				return this.renderDocFunction(member, tocLevel, context)
			case DocMemberType.var:
			case DocMemberType.let:
			case DocMemberType.const:
			case DocMemberType.field:
			case DocMemberType.accessor:
				return this.renderDocVariable(member, tocLevel, context)
			case DocMemberType.enum:
				return this.renderDocEnum(member, tocLevel, context)
			case DocMemberType.typeAlias:
				return this.renderDocTypeAlias(member, tocLevel, context)
			case DocMemberType.namespace:
				return this.renderDocNamespace(member, tocLevel, context)
			case DocMemberType.module:
				return this.renderDocModule(member, tocLevel, context)
			default:
				return this.renderDocUnknownMember(member, tocLevel, context)
		}
	}

	/**
	 * 渲染一个类或接口
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocClassOrInterface(member: DocClassOrInterface, tocLevel: number, context: DocPageContext) {
		// 对每个成员按所属类型和成员类型进行分组
		let constructor: DocFunction
		const thisProperties = [] as (DocVariable | DocFunction)[]
		const thisEvents = [] as DocVariable[]
		const thisMethods = [] as DocFunction[]
		const baseProperties = new Map<DocMember, (DocVariable | DocFunction)[]>()
		const baseEvents = new Map<DocMember, DocVariable[]>()
		const baseMethods = new Map<DocMember, DocFunction[]>()
		const preferRequested = member.members.every(member => member.memberType & (DocMemberType.constructor | DocMemberType.call | DocMemberType.index) || member.modifiers & DocMemberModifiers.optional)
		for (const child of member.members) {
			if (child.memberType === DocMemberType.constructor) {
				constructor = child
				continue
			}
			if (child.modifiers & DocMemberModifiers.private) {
				continue
			}
			let parentMember = child.parentMember
			// 如果覆盖了基类同名成员，显示在基类的成员下
			let overridingMember = child.overridingMember
			if (overridingMember) {
				while (overridingMember.overridingMember) {
					overridingMember = overridingMember.parentMember
				}
				parentMember = overridingMember.parentMember
			}
			if (parentMember && parentMember !== member && (parentMember.memberType === DocMemberType.class || parentMember.memberType === DocMemberType.interface)) {
				if (child.memberType === DocMemberType.method || child.memberType === DocMemberType.call) {
					const exists = baseMethods.get(parentMember)
					if (exists) {
						exists.push(child)
					} else {
						baseMethods.set(parentMember, [child])
					}
				} else if (child.memberType === DocMemberType.field || child.memberType === DocMemberType.accessor) {
					const exists = baseProperties.get(parentMember)
					if (exists) {
						exists.push(child)
					} else {
						baseProperties.set(parentMember, [child])
					}
				} else if (child.memberType === DocMemberType.event) {
					const exists = baseEvents.get(parentMember)
					if (exists) {
						exists.push(child)
					} else {
						baseEvents.set(parentMember, [child])
					}
				}
			} else {
				if (child.memberType === DocMemberType.method || child.memberType === DocMemberType.call) {
					thisMethods.push(child)
				} else if (child.memberType === DocMemberType.field || child.memberType === DocMemberType.accessor || child.memberType === DocMemberType.index) {
					thisProperties.push(child)
				} else if (child.memberType === DocMemberType.event) {
					thisEvents.push(child)
				}
			}
		}
		const childTOCLevel = tocLevel < 0 ? -1 : tocLevel + 1
		const showConstructor = constructor && (constructor.parameters.length || constructor.modifiers & (DocMemberModifiers.protected | DocMemberModifiers.internal | DocMemberModifiers.private))
		return <section class="doc-api">
			{this.renderDocMemberHeader(member, member.memberType === DocMemberType.class ? "class" : "interface", member.memberType === DocMemberType.class ? " 类" : " 接口", false, tocLevel, context)}
			<div class="doc-api-body">
				{member.extends?.length ? <div class="doc-api-type">
					<strong>继承：</strong>
					{member.extends.map((extend, index) => <>
						{index ? "、" : null}
						{this.renderExtendingHierarchy(extend, context)}
					</>)}
				</div> : null}
				{member.implements?.length ? <div class="doc-api-type">
					<span class="doc-tag">实现</span>
					{member.implements.map((extend, index) => <>
						{index ? "、" : null}
						{this.renderDocType(extend, context)}
					</>)}
				</div> : null}
				{this.renderDocTypeParameterList(member.typeParameters, context)}
				{showConstructor ? <h4>构造函数</h4> : null}
				{showConstructor ? this.renderDocConstructor(constructor, member, childTOCLevel, context) : null}
				{thisProperties.length || baseProperties.size ? <h4>属性</h4> : null}
				{thisProperties.length ? <figure>
					<table class="doc-api-table doc-api-props">
						<tr>
							<th class="doc-api-table-name">属性名</th>
							<th class="doc-api-table-summary">说明</th>
							<th class="doc-api-table-type">类型</th>
						</tr>
						{thisProperties.map(property => property.memberType === DocMemberType.index ? this.renderDocIndex(property, tocLevel, context) : this.renderDocProperty(property as DocVariable, preferRequested, childTOCLevel, context))}
					</table>
				</figure> : null}
				{map(baseProperties, (key, value) => <details class="doc-api-inherited">
					<summary>继承自 {key.name} {key.memberType === DocMemberType.class ? "类" : "接口"}的属性</summary>
					<figure>
						<table class="doc-api-table doc-api-props">
							<tr>
								<th class="doc-api-table-name">属性名</th>
								<th class="doc-api-table-summary">说明</th>
								<th class="doc-api-table-type">类型</th>
							</tr>
							{value.map(property => property.memberType === DocMemberType.index ? this.renderDocIndex(property, tocLevel, context) : this.renderDocProperty(property as DocVariable, preferRequested, childTOCLevel, context))}
						</table>
					</figure>
				</details>)}
				{thisEvents.length || baseEvents.size ? <h4>事件</h4> : null}
				{thisEvents.length ? <figure>
					<table class="doc-api-table doc-api-props">
						<tr>
							<th class="doc-api-table-name">事件名</th>
							<th class="doc-api-table-summary">说明</th>
							<th class="doc-api-table-type">类型</th>
						</tr>
						{thisEvents.map(property => this.renderDocProperty(property, true, childTOCLevel, context))}
					</table>
				</figure> : null}
				{map(baseEvents, (key, value) => <details class="doc-api-inherited">
					<summary>继承自 {key.name} {key.memberType === DocMemberType.class ? "类" : "接口"}的事件</summary>
					<figure>
						<table class="doc-api-table doc-api-props">
							<tr>
								<th class="doc-api-table-name">事件名</th>
								<th class="doc-api-table-summary">说明</th>
								<th class="doc-api-table-type">类型</th>
							</tr>
							{value.map(property => this.renderDocProperty(property, true, childTOCLevel, context))}
						</table>
					</figure>
				</details>)}
				{thisMethods.length || baseMethods.size ? <h4>方法</h4> : null}
				{thisMethods.map(method => this.renderDocFunction(method, childTOCLevel, context))}
				{map(baseMethods, (key, value) => <details class="doc-api-inherited">
					<summary>继承自 {key.name} {key.memberType === DocMemberType.class ? "类" : "接口"}的方法</summary>
					{value.map(method => this.renderDocFunction(method, childTOCLevel, context))}
				</details>)}
			</div>
		</section>

		function map<K, V, R>(map: Map<K, V>, callback: (key: K, value: V) => R) {
			const result: R[] = []
			for (const [key, value] of map) {
				result.push(callback(key, value))
			}
			return result
		}
	}

	/**
	 * 渲染一个继承链
	 * @param type 基础类型
	 * @param context 页面的上下文
	 */
	protected renderExtendingHierarchy(type: DocType, context: DocPageContext) {
		const baseType = type.typeType === DocTypeType.class && (type.member as DocClassOrInterface).extends?.find(t => t.typeType === DocTypeType.class)
		return <>
			{this.renderDocType(type, context)}
			{baseType ? <> ← {this.renderExtendingHierarchy(baseType, context)}</> : null}
		</>
	}

	/**
	 * 渲染一个索引访问器
	 * @param member 要渲染的成员
	 * @param parentMember 所属的类
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocConstructor(member: DocFunction, parentMember: DocMember, tocLevel: number, context: DocPageContext) {
		return <section class="doc-api doc-collapsed">
			<div class="doc-api-header">
				<h4 id={member.id} class="doc-api-title">
					{this.renderDocMemberToolBar(member, context)}
					{this.renderPermalink(member.id)}
					<code class="doc-api-name"><span class="doc-tag-operator">new </span>{parentMember.name}</code>
					{this.renderDocMemberTags(member, false, context)}
				</h4>
				{member.summary ? this.renderDocMemberSummary(member, context) : <div class="doc-api-summary">
					初始化新的 {this.renderDocMemberLink(parentMember, context)} 实例
					{this.renderDocDeprecatedMessage(member, context)}
				</div>}
			</div>
			<div class="doc-api-body">
				{this.renderDocFunctionBody(member, tocLevel, context)}
			</div>
		</section>
	}

	/**
	 * 渲染一个属性
	 * @param member 要渲染的成员
	 * @param preferRequested 是否标记必填项而非可选项
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocProperty(member: DocVariable, preferRequested: boolean, tocLevel: number, context: DocPageContext) {
		const tocItem = tocLevel >= 0 ? context.tocManager.add(member.name, tocLevel, member.id, "") : null
		this.addSearchKeyword(context.sourceURL, member.name)
		return <tr id={tocItem?.anchor}>
			<td class="doc-api-table-name">
				{this.renderIcon(member.memberType === DocMemberType.accessor ? "property" : member.memberType === DocMemberType.event ? "event" : "field", "doc-icon-space-right")}
				{this.renderDocMemberName(member, null, context)}
				{this.renderDocMemberTags(member, preferRequested, context)}
			</td>
			<td class="doc-api-table-summary">
				{this.renderDocMarkdown(member.summary, context)}
				{this.renderDocDeprecatedMessage(member, context)}
				{this.renderDocTypeDetail(member.type, context)}
				{this.renderDocMemberDetail(member, context)}
			</td>
			<td class="doc-api-table-type">{this.renderDocType(member.type, context)}</td>
		</tr>
	}

	/**
	 * 渲染类型的子属性
	 * @param type 要渲染的类型
	 * @param context 页面的上下文
	 */
	protected renderDocTypeDetail(type: DocType, context: DocPageContext) {
		const detail = this.renderDocObjectType(type, context, 0, new Set())
		if (detail) {
			return <details>
				<summary>展开子属性</summary>
				{detail}
			</details>
		}
		return null
	}

	/**
	 * 渲染一个索引访问器
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocIndex(member: DocFunction, tocLevel: number, context: DocPageContext) {
		return <tr id={member.id}>
			<td class="doc-api-table-name">
				{this.renderIcon("var", "doc-icon-space-right")}
				<code>[{member.parameters[0].name}: {this.renderDocType(member.parameters[0].type, context)}]</code>
			</td>
			<td class="doc-api-table-summary">
				{this.renderDocMarkdown(member.summary, context)}
				{this.renderDocDeprecatedMessage(member, context)}
				{this.renderDocMemberDetail(member, context)}
			</td>
			<td class="doc-api-table-type">{this.renderDocType(member.returnType, context)}</td>
		</tr>
	}

	/**
	 * 渲染一个枚举类型
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocEnum(member: DocEnum, tocLevel: number, context: DocPageContext) {
		return <section class="doc-api doc-collapsed">
			{this.renderDocMemberHeader(member, "enum", " 枚举", false, tocLevel, context)}
			<div class="doc-api-body">
				<h4>成员</h4>
				<figure>
					<table class="doc-api-table doc-api-enummembers">
						<tr>
							<th class="doc-api-table-name">枚举名</th>
							<th class="doc-api-table-summary">说明</th>
							<th class="doc-api-table-type">值</th>
						</tr>
						{member.members.map(child => <tr id={child.id}>
							<td class="doc-api-table-name">
								{this.renderIcon(child.memberType === DocMemberType.enumMember ? "enummember" : "field", "doc-icon-space-right")}
								{this.renderDocMemberName(child, null, context)}
								{this.renderDocMemberTags(child, false, context)}
							</td>
							<td class="doc-api-table-summary">
								{this.renderDocMarkdown(child.summary, context)}
								{this.renderDocMemberDetail(child, context)}
							</td>
							<td class="doc-api-table-type">{child.defaultValue !== undefined ? this.renderDocExpression(child.defaultValue, context) : null}</td>
						</tr>)}
					</table>
				</figure>
				{this.renderDocMemberDetail(member, context)}
			</div>
		</section>
	}

	/**
	 * 渲染一个命名空间
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocNamespace(member: DocNamespace, tocLevel: number, context: DocPageContext) {
		return <section class="doc-api">
			{this.renderDocMemberHeader(member, "namespace", " 命名空间", false, tocLevel, context)}
			<div class="doc-api-body">
				{this.renderDocMembers(member.members, tocLevel < 0 ? -1 : tocLevel + 1, context)}
				{this.renderDocMemberDetail(member, context)}
			</div>
		</section>
	}

	/**
	 * 渲染一个包
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocModule(member: DocNamespace, tocLevel: number, context: DocPageContext) {
		return <section class="doc-api">
			{this.renderDocMemberHeader(member, "package", " 包", false, tocLevel, context)}
			<div class="doc-api-body">
				{this.renderDocMembers(member.members, tocLevel < 0 ? -1 : tocLevel + 1, context)}
				{this.renderDocMemberDetail(member, context)}
			</div>
		</section>
	}

	/**
	 * 渲染一个类型别名
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocTypeAlias(member: DocTypeAlias, tocLevel: number, context: DocPageContext) {
		return <section class="doc-api doc-collapsed">
			{this.renderDocMemberHeader(member, "interface", " 类型", false, tocLevel, context)}
			<div class="doc-api-body">
				<div class="doc-api-type"><strong>同：</strong>{this.renderDocType(member.aliasedType, context)}</div>
				{this.renderDocMemberDetail(member, context)}
			</div>
		</section>
	}

	/**
	 * 渲染一个变量
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocVariable(member: DocVariable, tocLevel: number, context: DocPageContext) {
		return <section class="doc-api doc-collapsed">
			{this.renderDocMemberHeader(member, member.memberType === DocMemberType.const ? "const" : "var", "", false, tocLevel, context)}
			<div class="doc-api-body">
				<div class="doc-api-type"><strong>类型：</strong>{this.renderDocType(member.type, context)}</div>
				{this.renderDocMemberDetail(member, context)}
			</div>
		</section>
	}

	/**
	 * 渲染一个函数或方法
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocFunction(member: DocFunction, tocLevel: number, context: DocPageContext) {
		const namespaceMembers = member.namespace ? this.renderDocMembers(member.namespace.members, -1, context) : null
		return <section class="doc-api doc-collapsed">
			{this.renderDocMemberHeader(member, "method", "", false, tocLevel, context)}
			<div class="doc-api-body">
				{this.renderDocFunctionBody(member, tocLevel, context)}
				{member.namespace ? <>
					{namespaceMembers ? <h5>成员</h5> : null}
					{namespaceMembers}
					{this.renderDocMemberDetail(member.namespace, context)}
				</> : null}
				{member.classOrInterface ? this.renderDocClassOrInterface(member.classOrInterface, -1, context) : null}
			</div>
		</section>
	}

	/**
	 * 渲染一个函数或方法主体
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocFunctionBody(member: DocFunction, tocLevel: number, context: DocPageContext) {
		if (member.overloads) {
			return <div class="doc-tab">
				<div class="doc-tab-header">
					<ul onclick="DOC.toggleTab(event.target)" role="tablist">
						{member.overloads.map((overload, index) => <li tabindex="0" role="tab" class={index === 0 ? "doc-selected" : ""}>
							重载 {index + 1}
						</li>)}
					</ul>
				</div>
				<div class="doc-tab-body">
					{member.overloads.map((overload, index) => <div class={`doc-tab-content${index === 0 ? " doc-selected" : ""}`} role="tabpanel">
						{this.renderDocMarkdown(overload.summary, context)}
						{this.renderDocDeprecatedMessage(overload, context)}
						{this.renderDocFunctionBody(overload, tocLevel, context)}
					</div>)}
				</div>
			</div>
		}
		return <>
			{this.renderDocTypeParameterList(member.typeParameters, context)}
			{this.renderDocParameterList(member.parameters, context)}
			{member.memberType !== DocMemberType.constructor ? <h5>返回值</h5> : null}
			{member.memberType !== DocMemberType.constructor ? <div class="doc-api-type"><strong>类型：</strong>{this.renderDocType(member.returnType, context)}</div> : null}
			{member.returnSummary ? this.renderDocMarkdown(member.returnSummary, context) : null}
			{this.renderDocMemberDetail(member, context)}
		</>
	}

	/**
	 * 渲染类型参数列表
	 * @param typeParameters 类型列表
	 * @param context 页面的上下文
	 */
	protected renderDocTypeParameterList(typeParameters: DocTypeParameter[] | undefined, context: DocPageContext) {
		return typeParameters?.length ? <>
			<h5>泛型参数</h5>
			<ul>
				{typeParameters.map(parameter => <li>
					<code>{parameter.name}</code>
					{parameter.constraintType ? <>: {this.renderDocType(parameter.constraintType, context)}</> : null}
					{parameter.defaultType ? <> = {this.renderDocType(parameter.defaultType, context)}</> : null}
					{parameter.summary ? <> — {this.renderDocMarkdown(parameter.summary, context)}</> : null}
				</li>)}
			</ul>
		</> : null
	}

	/**
	 * 渲染参数列表
	 * @param tparameters 类型列表
	 * @param context 页面的上下文
	 */
	protected renderDocParameterList(parameters: DocParameter[], context: DocPageContext) {
		return parameters.length ? <>
			<h5>参数</h5>
			<figure>
				<table class="doc-api-table">
					<tr>
						<th class="doc-api-table-name">参数名</th>
						<th class="doc-api-table-summary">说明</th>
						<th class="doc-api-table-type">类型</th>
					</tr>
					{parameters.map(parameter => <tr>
						<td class="doc-api-table-name">
							{parameter.optional ? <small class="doc-api-optional">(可选)</small> : null}
							{parameter.rest ? <code>...</code> : null}
							<code>{parameter.name}</code>
						</td>
						<td class="doc-api-table-summary">
							{this.renderDocMarkdown(parameter.summary, context)}
							{parameter.subParameters ? <ul>
								{parameter.subParameters.map(subParameter => <li>
									{subParameter.name === "return" ? "返回值" : <code>{subParameter.name}</code>}
									{subParameter.optional ? <small class="doc-api-optional">(可选)</small> : null}
									{subParameter.summary ? new HTML(" — " + this.markdownCompiler.renderInline(subParameter.summary, context)) : null}
								</li>)}
							</ul> : null}
							{this.renderDocTypeDetail(parameter.type, context)}
							{parameter.defaultValue !== undefined ? <p>
								<strong>默认值：</strong>{this.renderDocExpression(parameter.defaultValue, context)}
							</p> : null}
						</td>
						<td class="doc-api-table-type">{this.renderDocType(parameter.type, context)}</td>
					</tr>)}
				</table>
			</figure>
		</> : null
	}

	/**
	 * 渲染一个未知成员
	 * @param member 要渲染的成员
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocUnknownMember(member: DocMember, tocLevel: number, context: DocPageContext) {
		return <section class="doc-api">
			{this.renderDocMemberHeader(member, "snippet", "", false, tocLevel, context)}
			<div class="doc-api-body">
				{this.renderDocMemberDetail(member, context)}
			</div>
		</section>
	}

	/**
	 * 渲染成员头部
	 * @param member 要渲染的成员
	 * @param icon 渲染的图标
	 * @param postfix 额外显示的后缀
	 * @param preferRequested 是否标记必填项而非可选项
	 * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
	 * @param context 页面的上下文
	 */
	protected renderDocMemberHeader(member: DocMember, icon: string, postfix: string, preferRequested: boolean, tocLevel: number, context: DocPageContext) {
		const tocItem = tocLevel >= 0 ? context.tocManager.add(member.name + postfix, tocLevel, member.id, "") : null
		this.addSearchKeyword(context.sourceURL, member.name)
		return <div class="doc-api-header">
			<h4 id={tocItem?.anchor} class="doc-api-title">
				{this.renderDocMemberToolBar(member, context)}
				{tocItem ? this.renderPermalink(tocItem.anchor) : null}
				{this.renderIcon(icon, "doc-icon-space-right")}
				{this.renderDocMemberName(member, postfix, context)}
				{this.renderDocMemberTags(member, preferRequested, context)}
			</h4>
			{this.renderDocMemberSummary(member, context)}
		</div>
	}

	/**
	 * 渲染一个工具条
	 * @param member 要渲染的成员
	 * @param context 页面的上下文
	 */
	protected renderDocMemberToolBar(member: DocMember, context: DocPageContext) {
		const parent = member.parentMember && member.parentMember.memberType !== DocMemberType.unknown ? this.renderDocMemberLink(member.parentMember, context, member.overridingMember ?? member.baseMember) : null
		const sourceLocation = member.sourceLocation
		const sourceHref = sourceLocation ? this.getSourceURL(sourceLocation) : undefined
		const source = sourceHref ? <a href={sourceHref} target="_blank" class="doc-toolbar-button" aria-label="查看源码">
			{this.renderIcon("code")}
			<span class="doc-tooltip doc-arrow">查看源码<br /><small>(共 {sourceLocation.endLine - sourceLocation.line + 1} 行)</small></span>
		</a> : null
		return parent || source ? <span class="doc-toolbar">
			{parent}
			{source}
		</span> : null
	}

	/**
	 * 获取指定源码地址的链接
	 * @param sourceLocation 源码地址
	 */
	protected getSourceURL(sourceLocation: DocSourceLocation) {
		if (this.builder.isIgnored(sourceLocation.sourcePath) || !this.options.repository) {
			return
		}
		return `${this.options.repository}/blob/${this.options.branch}/${this.options.repositoryPath}${this.builder.toURL(sourceLocation.sourcePath)}#L${sourceLocation.line + 1}-${sourceLocation.endLine + 1}`
	}

	/**
	 * 渲染一个指定成员的链接
	 * @param member 要渲染的成员
	 * @param context 页面的上下文
	 * @param anchorMember 附加设置描点的成员
	 */
	protected renderDocMemberLink(member: DocMember, context: DocPageContext, anchorMember = member) {
		const url = anchorMember?.sourceLocation ? this.getDocURL(anchorMember.sourceLocation) : undefined
		if (!url) {
			return <code class="doc-token-class-name">{member.name}</code>
		}
		return <code><a href={(url === context.url ? "" : this.options.baseURL + url) + "#" + anchorMember.id} class="doc-token-class-name">{member.name}</a></code>
	}

	/**
	 * 获取指定成员文档的链接
	 * @param sourceLocation 源码地址
	 */
	protected getDocURL(sourceLocation: DocSourceLocation) {
		if (this.builder.isIgnored(sourceLocation.sourcePath)) {
			return
		}
		return this.builder.toShortURL(this.builder.getHTMLOutputName(sourceLocation.sourcePath))
	}

	/**
	 * 渲染一个成员名
	 * @param member 要渲染的成员
	 * @param postfix 额外显示的后缀
	 * @param context 页面的上下文
	 */
	protected renderDocMemberName(member: DocMember, postfix: string | null, context: DocPageContext) {
		return <code class="doc-api-name">
			{member.modifiers & DocMemberModifiers.static && member.parentMember ? member.parentMember.name + "." : null}
			{member.name}
			{postfix}
		</code>
	}

	/**
	 * 渲染成员的标签
	 * @param member 要渲染的成员
	 * @param preferRequested 是否标记必填项而非可选项
	 * @param context 页面的上下文
	 */
	protected renderDocMemberTags(member: DocMember, preferRequested: boolean, context: DocPageContext) {
		return <>
			{member.modifiers & DocMemberModifiers.optional ? preferRequested ? null : <small class="doc-api-optional">(可选)</small> : preferRequested ? <small class="doc-api-optional">(必填)</small> : null}
			{member.modifiers & DocMemberModifiers.async ? <span class="doc-tag">异步</span> : null}
			{member.modifiers & DocMemberModifiers.generator ? <span class="doc-tag">生成器</span> : null}
			{member.modifiers & DocMemberModifiers.exportDefault ? <span class="doc-tag doc-success">默认导出</span> : null}
			{member.modifiers & DocMemberModifiers.protected ? <span class="doc-tag doc-warning">保护</span> : null}
			{member.modifiers & DocMemberModifiers.private ? <span class="doc-tag doc-warning">私有</span> : null}
			{member.modifiers & DocMemberModifiers.internal ? <span class="doc-tag doc-warning">内部</span> : null}
			{member.modifiers & DocMemberModifiers.static ? <span class="doc-tag doc-info">静态</span> : null}
			{member.modifiers & DocMemberModifiers.readOnly ? <span class="doc-tag doc-info">只读</span> : null}
			{member.modifiers & DocMemberModifiers.final ? <span class="doc-tag doc-info">密封</span> : null}
			{member.modifiers & DocMemberModifiers.virtual ? <span class="doc-tag doc-warning">可重写</span> : null}
			{member.modifiers & DocMemberModifiers.abstract ? <span class="doc-tag doc-warning">抽象</span> : null}
			{member.overridingMember ? <span class="doc-tag">已重写</span> : null}
			{member.modifiers & DocMemberModifiers.deprecated ? <span class="doc-tag doc-error">已废弃</span> : null}
			{member.modifiers & DocMemberModifiers.experimental ? <span class="doc-tag doc-warning">试验中</span> : null}
		</>
	}

	/**
	 * 渲染成员的概述
	 * @param member 要渲染的成员
	 * @param context 页面的上下文
	 */
	protected renderDocMemberSummary(member: DocMember, context: DocPageContext) {
		return member.summary ? <div class="doc-api-summary">
			{this.renderDocMarkdown(member.summary, context)}
			{this.renderDocDeprecatedMessage(member, context)}
		</div> : null
	}

	/**
	 * 渲染已废弃提示
	 * @param member 要渲染的成员
	 * @param context 页面的上下文
	 */
	protected renderDocDeprecatedMessage(member: DocMember, context: DocPageContext) {
		return member.deprecatedMessage ? <blockquote class="doc-blockquote doc-warning">
			<div class="doc-blockquote-title">{this.renderIcon("warning", "doc-blockquote-icon")}已废弃</div>
			{member.deprecatedMessage}
		</blockquote> : null
	}

	/**
	 * 渲染成员的详情描述
	 * @param member 要渲染的成员
	 * @param context 页面的上下文
	 */
	protected renderDocMemberDetail(member: DocMember, context: DocPageContext) {
		return <>
			{member.since ? <div class="doc-api-type"><strong>新增于：</strong>{member.since}</div> : null}
			{member.description ? <>
				<h5>说明</h5>
				{this.renderDocMarkdown(member.description, context)}
			</> : null}
			{member.examples?.length ? <>
				<h5>示例</h5>
				{member.examples.map(example => this.renderDocExample(example, context))}
			</> : null}
			{member.seeAlso?.length ? <>
				<h5>另参考</h5>
				<ul>
					{member.seeAlso.map(seeAlso => <li>{this.renderDocSeeAlso(seeAlso, context)}</li>)}
				</ul>
			</> : null}
		</>
	}

	/**
	 * 渲染一个示例
	 * @param example 示例的内容
	 * @param context 页面的上下文
	 */
	protected renderDocExample(example: string, context: DocPageContext) {
		// 多行的示例可能是 Markdown
		const lineBreakIndex = example.indexOf("\n")
		if (lineBreakIndex >= 0 && /^##|^```|^:::/m.test(example)) {
			return this.renderDocMarkdown(example, context)
		}
		return <>
			{lineBreakIndex > 0 ? <h5>{this.markdownCompiler.renderInline(example.substring(0, lineBreakIndex), context)}</h5> : null}
			<pre class="doc-code doc-code-merge">
				<span class="doc-toolbar">
					<button type="button" aria-hidden="true" class="doc-toolbar-button doc-code-tool-copy" onclick="DOC.handleCopy(this, '已复制', '复制失败')">
						{this.renderIcon("copy")}
						<span class="doc-tooltip doc-arrow">复制源码</span>
					</button>
				</span>
				<code class={`doc-language-tsx`}>
					{new HTML(highlight(example.substring(lineBreakIndex + 1), "tsx", "doc-token-"))}
				</code>
			</pre>
		</>
	}

	/**
	 * 渲染一个参考链接
	 * @param seeAlso 链接的内容
	 * @param context 页面的上下文
	 */
	protected renderDocSeeAlso(seeAlso: string, context: DocPageContext) {
		const parsed = this.parseHref(seeAlso, context)
		return this.renderLink(parsed.label, parsed.href)
	}

	/**
	 * 解析一个链接地址
	 * @param href 要解析的地址
	 * @param context 页面的上下文
	 */
	protected parseHref(href: string, context: DocPageContext) {
		if (isAbsoluteURL(href)) {
			return { href: href, label: href }
		}
		if (href.startsWith("#")) {
			const content = href.substring(1)
			return { href: "#" + (context.tocManager.findAnchor(content) ?? content), label: content }
		}
		const queryOrHashIndex = href.search(/[?#]/)
		const queryOrHash = queryOrHashIndex >= 0 ? href.substring(queryOrHashIndex) : ""
		if (queryOrHashIndex > 0) {
			href = href.substring(0, queryOrHashIndex)
		}
		// 链接到 API 文档
		if (/\.[jt]sx?$/i.test(href)) {
			return {
				href: this.builder.getHTMLOutputName(joinPath(context.url, "..", href)) + queryOrHash,
				label: /#(.*)$/.exec(queryOrHash)?.[1] ?? setExt(relativePath(this.builder.options.srcDir, href), "")
			}
		}
		// 链接到其它 Markdown 文档
		if (/\.md$/i.test(href)) {
			// 读取 Markdown 标记
			const path = resolvePath(this.builder.options.baseDir, context.url, "..", href)
			context.dependencies.push(path)
			let label: string
			try {
				const markdownContent = readFileSync(path, "utf-8")
				label = this.parseMarkdownMeta(markdownContent, path).title
			} catch {
				label = this.parseMarkdownMeta("", path).title
			}
			return {
				href: this.builder.getHTMLOutputName(joinPath(context.url, "..", href)) + queryOrHash,
				label: label
			}
		}
		return {
			href: this.builder.getHTMLOutputName(joinPath(context.url, "..", href)) + queryOrHash,
			label: href
		}
	}

	/**
	 * 渲染一个类型
	 * @param type 要渲染的类型
	 * @param context 页面的上下文
	 */
	protected renderDocType(type: DocType, context: DocPageContext) {
		return <code>{this.renderDocTypeWorker(type, context, 0, new Set())}</code>
	}

	/**
	 * 渲染类型
	 * @param type 要渲染的类型
	 * @param context 页面的上下文
	 * @param depth 遍历的深度
	 * @param rendered 已渲染的类型
	 */
	protected renderDocTypeWorker(type: DocType, context: DocPageContext, depth: number, rendered: Set<DocType>) {
		if (rendered.has(type)) {
			return <span class="doc-more" onclick="DOC.showMoreDetails(this)">
				(Circular)
				<span class="doc-more-details">{context.docParser.typeToString(type)}</span>
			</span>
		}
		rendered.add(type)
		try {
			switch (type.typeType) {
				case DocTypeType.native:
					return <span class="doc-token-builtin">{type.name}</span>
				case DocTypeType.error:
					return <span class="doc-token-entity">?</span>
				case DocTypeType.class:
				case DocTypeType.interface:
				case DocTypeType.enum:
					return this.renderDocMemberLink(type.member, context)
				case DocTypeType.numberLiteral:
				case DocTypeType.bigintLiteral:
					return <span class="doc-token-number">{type.value}</span>
				case DocTypeType.stringLiteral:
					return <span class="doc-token-string">{JSON.stringify(type.value)}</span>
				case DocTypeType.array:
					return <>
						{type.element.typeType & (DocTypeType.function | DocTypeType.union | DocTypeType.intersection | DocTypeType.conditional) ? <>
							<span class="doc-token-punctuation">(</span>
							{this.renderDocTypeWorker(type.element, context, depth + 1, rendered)}
							<span class="doc-token-punctuation">)</span>
						</> : this.renderDocTypeWorker(type.element, context, depth + 1, rendered)}
						<span class="doc-token-punctuation">[]</span>
					</>
				case DocTypeType.function:
					const func = <>
						{type.typeParameters ? <>
							<span class="doc-token-punctuation">&lt;</span>
							{type.typeParameters.map((typeParameter, index) => <>
								{index ? <span class="doc-token-punctuation">, </span> : null}
								<span class="doc-token-class-name">{typeParameter.name}</span>
								{typeParameter.constraintType ? <>
									<span class="doc-token-keyword">: </span>
									{this.renderDocTypeWorker(typeParameter.constraintType, context, depth + 1, rendered)}
								</> : null}
								{typeParameter.defaultType ? <>
									<span class="doc-token-operator"> = </span>
									{this.renderDocTypeWorker(typeParameter.defaultType, context, depth + 1, rendered)}
								</> : null}
							</>)}
							<span class="doc-token-punctuation">&gt;</span>
						</> : null}
						{this.renderDocParameters(type.parameters, context, depth, rendered)}
						<span class="doc-token-punctuation"> =&gt; </span>
						{this.renderDocTypeWorker(type.returnType, context, depth + 1, rendered)}
					</>
					if (depth && func.length > 20) {
						return <span class="doc-more" onclick="DOC.showMoreDetails(this)">
							<span class="doc-token-builtin">function</span>
							<span class="doc-more-details">{func}</span>
						</span>
					}
					return func
				case DocTypeType.constructor:
					return <>
						<span class="doc-token-operator">new</span>
						{this.renderDocParameters(type.parameters, context, depth, rendered)}
						<span class="doc-token-punctuation"> =&gt; </span>
						{this.renderDocTypeWorker(type.returnType, context, depth + 1, rendered)}
					</>
				case DocTypeType.this:
					return <span class="doc-token-builtin" title={type.member.name}>this</span>
				case DocTypeType.typeParameter:
					return <span class="doc-token-class-name">{type.member.name}</span>
				case DocTypeType.union:
				case DocTypeType.intersection:
					const list: any[] = type.operands.map(item => {
						const element = this.renderDocTypeWorker(item, context, depth + 1, rendered)
						if (item.typeType === DocTypeType.function || item.typeType === DocTypeType.constructor) {
							return <>({element})</>
						}
						return element
					})
					// 属性超过 10 个时仅显示前 3 和后 2
					if (list.length > 10) {
						const deleted = list.splice(3, list.length - 6)
						list[3] = <span class="doc-more" onclick="DOC.showMoreDetails(this)">
							... {deleted.length} more ...
							<span class="doc-more-details">{deleted.map((item, index) => <>
								{index ? <span class="doc-token-punctuation"> {type.typeType === DocTypeType.union ? "|" : "&"} </span> : null}
								{item}
							</>)}</span>
						</span>
					}
					return list.map((item, index) => <>
						{index ? <span class="doc-token-punctuation"> {type.typeType === DocTypeType.union ? "|" : "&"} </span> : null}
						{item}
					</>)
				case DocTypeType.keyOf:
					return <>
						<span class="doc-token-operator">keyof </span>
						{type.target.typeType & (DocTypeType.function | DocTypeType.union | DocTypeType.intersection | DocTypeType.conditional) ? <>
							<span class="doc-token-punctuation">(</span>
							{this.renderDocTypeWorker(type.target, context, depth + 1, rendered)}
							<span class="doc-token-punctuation">)</span>
						</> : this.renderDocTypeWorker(type.target, context, depth + 1, rendered)}
					</>
				case DocTypeType.tuple:
					return <>
						<span class="doc-token-punctuation">[</span>
						{type.elements.map((element, index) => <>
							{index ? <span class="doc-token-punctuation">, </span> : null}
							{this.renderDocTypeWorker(element, context, depth + 1, rendered)}
						</>)}
						<span class="doc-token-punctuation">]</span>
					</>
				case DocTypeType.generic:
					return <>
						{this.renderDocTypeWorker(type.target, context, depth + 1, rendered)}
						<span class="doc-token-punctuation">&lt;</span>
						{type.typeArguments.map((element, index) => <>
							{index ? <span class="doc-token-punctuation">, </span> : null}
							{this.renderDocTypeWorker(element, context, depth + 1, rendered)}
						</>)}
						<span class="doc-token-punctuation">&gt;</span>
					</>
				case DocTypeType.typeAlias:
					return this.renderDocMemberLink(type.member, context)
				case DocTypeType.conditional:
					return <>
						{this.renderDocTypeWorker(type.checkType, context, depth + 1, rendered)}
						<span class="doc-token-operator"> extends </span>
						{this.renderDocTypeWorker(type.extendsType, context, depth + 1, rendered)}
						<span class="doc-token-punctuation"> ? </span>
						{this.renderDocTypeWorker(type.trueType, context, depth + 1, rendered)}
						<span class="doc-token-punctuation"> : </span>
						{this.renderDocTypeWorker(type.falseType, context, depth + 1, rendered)}
					</>
				case DocTypeType.enumMember:
					return <>
						{this.renderDocMemberLink(type.member.parentMember, context)}
						<span class="doc-token-punctuation">.</span>
						{this.renderDocMemberLink(type.member, context)}
					</>
				case DocTypeType.typeOf:
					return <>
						<span class="doc-token-operator">typeof </span>
						{this.renderDocMemberLink(type.member, context)}
					</>
				case DocTypeType.indexedAccess:
					return <>
						{type.target.typeType & (DocTypeType.function | DocTypeType.union | DocTypeType.intersection | DocTypeType.conditional) ? <>
							<span class="doc-token-punctuation">(</span>
							{this.renderDocTypeWorker(type.target, context, depth + 1, rendered)}
							<span class="doc-token-punctuation">)</span>
						</> : this.renderDocTypeWorker(type.target, context, depth + 1, rendered)}
						<span class="doc-token-punctuation">[</span>
						{this.renderDocTypeWorker(type.key, context, depth + 1, rendered)}
						<span class="doc-token-punctuation">]</span>
					</>
				case DocTypeType.object:
					const members: any[] = type.members.map((child, index) => <span class="doc-type-indent">
						{child.memberType === DocMemberType.call || child.memberType === DocMemberType.index ? null : <span class="doc-token-property">{child.memberType === DocMemberType.module ? "..." : null}{child.name}</span>}
						{child.memberType === DocMemberType.field ? <>
							{child.modifiers & DocMemberModifiers.optional ? <span class="doc-token-operator">?</span> : null}
							<span class="doc-token-punctuation">: </span>
							{this.renderDocTypeWorker(child.type, context, depth + 1, rendered)}
						</> : child.memberType === DocMemberType.method || child.memberType === DocMemberType.call ? <>
							{this.renderDocParameters(child.parameters, context, depth, rendered)}
							<span class="doc-token-punctuation">: </span>
							{this.renderDocTypeWorker(child.returnType, context, depth + 1, rendered)}
						</> : child.memberType === DocMemberType.index ? <>
							<span class="doc-token-punctuation">[</span>
							{child.parameters[0].name}
							<span class="doc-token-punctuation">: </span>
							{this.renderDocTypeWorker(child.parameters[0].type, context, depth + 1, rendered)}
							<span class="doc-token-punctuation">]</span>
							<span class="doc-token-punctuation">: </span>
							{this.renderDocTypeWorker(child.returnType, context, depth + 1, rendered)}
						</> : null}
						{child.summary ? <span class="doc-token-comment"> // {new HTML(this.markdownCompiler.renderInline(child.summary, context))}</span> : null}
					</span>)
					// 属性超过 10 个时仅显示前 3 和后 2
					if (members.length > 10) {
						const deleted = members.splice(3, members.length - 6)
						members[3] = <span class="doc-more" onclick="DOC.showMoreDetails(this)">
							... {deleted.length} more ...
							<span class="doc-more-details">
								{deleted}
							</span>
						</span>
					}
					return <>
						<span class="doc-token-punctuation">{"{"}</span>
						{members}
						<span class="doc-token-punctuation">{"}"}</span>
					</>
				case DocTypeType.templateLiteral:
					return <>
						<span class="doc-token-string">`</span>
						{type.spans.map(span => typeof span === "string" ? <span class="doc-token-string">{span.replace(/`/g, "\\`")}</span> : <><span class="doc-token-entity">{"${"}</span>{this.renderDocTypeWorker(span, context, depth + 1, rendered)}<span class="doc-token-entity">{"}"}</span></>)}
						<span class="doc-token-string">`</span>
					</>
			}
			return context.docParser.typeToString(type)
		} finally {
			rendered.delete(type)
		}
	}

	/**
	 * 渲染类型中的参数列表
	 * @param expression 要渲染的表达式
	 */
	protected renderDocParameters(parameters: DocParameter[], context: DocPageContext, depth: number, rendered: Set<DocType>) {
		return <>
			<span class="doc-token-punctuation">(</span>
			{
				parameters.map((parameter, index) => <>
					{index ? <span class="doc-token-punctuation">, </span> : null}
					{parameter.rest ? <span class="doc-token-punctuation">...</span> : null}
					<span class="doc-token-variable">{parameter.name}</span>
					{parameter.optional ? <span class="doc-token-operator">?</span> : null}
					<span class="doc-token-punctuation">: </span>
					{this.renderDocTypeWorker(parameter.type, context, depth + 1, rendered)}
				</>)
			}
			<span class="doc-token-punctuation">)</span>
		</>
	}

	/**
	 * 渲染一个对象类型
	 * @param type 要渲染的类型
	 * @param context 页面的上下文
	 * @param depth 遍历的深度
	 * @param rendered 已渲染的类型
	 */
	protected renderDocObjectType(type: DocType, context: DocPageContext, depth: number, rendered: Set<DocType>) {
		if (depth > 5) {
			return null
		}
		type = findObjectType(type, 0)
		if (!type) {
			return null
		}
		if (rendered.has(type)) {
			return null
		}
		const properties = context.docParser.getPropertiesOfType(type)
		if (!properties.length) {
			return null
		}
		rendered.add(type)
		try {
			return <ul>
				{properties.map(property => {
					const type = context.docParser.checker.getTypeOfSymbolAtLocation(property.raw, property.declaration)
					const docType = context.docParser.getDocType(type)
					const childObject = this.renderDocObjectType(docType, context, depth + 1, rendered)
					const name = <code>{property.name}</code>
					const summary = property.summary ? new HTML(" — " + this.markdownCompiler.renderInline(property.summary, context)) : null
					if (childObject) {
						return <li>
							{name}
							{docType.typeType === DocTypeType.array ? new HTML(`: <code class="doc-token-builtin">array</code>`) : ""}
							{summary}
							{childObject}
						</li>
					}
					return <li>
						{name}
						: <code>{this.renderDocTypeWorker(docType, context, depth, rendered)}</code>
						{summary}
					</li>
				})}
			</ul>
		} finally {
			rendered.delete(type)
		}

		function findObjectType(type: DocType, depth: number): DocType {
			if (depth > 9) {
				return null
			}
			switch (type.typeType) {
				case DocTypeType.object:
				case DocTypeType.unknown:
					return type
				case DocTypeType.typeAlias:
					return findObjectType(type.aliasedType, depth + 1)
				case DocTypeType.interface:
					if (!(type.member as DocClassOrInterface).members?.some(member => member.memberType === DocMemberType.method)) {
						return type
					}
					break
				case DocTypeType.generic:
					if (findObjectType(type.target, depth + 1)) {
						return type
					}
					break
				case DocTypeType.intersection:
					return type.operands.some(findObjectType) ? type : null
				case DocTypeType.union:
					let result: DocType | null = null
					for (const operand of type.operands) {
						const child = findObjectType(operand, depth + 1)
						if (child) {
							if (result) {
								return null
							}
							result = child
						}
					}
					return result
				case DocTypeType.array:
					return findObjectType(type.element, depth + 1)
			}
			return null
		}
	}

	/**
	 * 渲染文档中的表达式
	 * @param expression 要渲染的表达式
	 * @param context 生成 Markdown 的上下文
	 */
	protected renderDocExpression(expression: DocVariable["defaultValue"], context: DocPageContext) {
		if (typeof expression === "string") {
			return <code>{expression}</code>
		}
		if (typeof expression === "number") {
			return <code><span class="doc-token-number">{expression}</span></code>
		}
		const text = this.builder.typeScriptCompiler.compile(expression.getText(), "<input>.tsx", false, undefined, null, {
			target: "esnext",
			module: "esnext",
			jsx: "preserve",
			sourceMap: false
		}).content.replace(/;\n*$/, "")
		const code = highlight(text, "js", "doc-token-")
		return <code>{new HTML(code)}</code>
	}

	/**
	 * 渲染文档中的 markdown 内容
	 * @param content 要渲染的内容
	 * @param context 生成 Markdown 的上下文
	 */
	protected renderDocMarkdown(content: string, context: DocPageContext) {
		return content ? new HTML(this.markdownCompiler.render(content, context)) : null
	}

	// #endregion

	// #region 索引页

	/**
	 * 生成一个列表页
	 * @param url 模块的地址
	 */
	async buildIndexPage(path: string): Promise<CompileResult> {
		const url = this.builder.toURL(path)
		const pageIndexURL = `tdk/data/pageIndex/${url}.js`
		const asset = await this.builder.getAsset(pageIndexURL)
		const { path: sourcePath, header, title, items, body } = asset.content["raw"]
		const [html, count] = this.renderWaterfallList(items, !url || url.endsWith("/") ? url : url + "/")
		const result = await this.buildDocPage(header + body, sourcePath, resolvePath(path, "index.html"), {
			api: false,
			meta: false,
			narrow: false,
			pager: false,
			injectHead: html,
			title,
			subtitle: <span class="doc-tag">{count}</span>
		})
		result.dependencies.push(...asset.dependencies)
		return result
	}

	/**
	 * 渲染多个瀑布流
	 * @param items 要渲染的数据
	 * @param baseURL 每个目录项的根地址
	 */
	protected renderWaterfallList(items: MarkdownListItem[], baseURL: string): [HTML, number] {
		let html = ""
		let count = 0
		const globalItems: MarkdownListItem[] = []
		for (const item of items) {
			if (item.children?.every(child => child.children)) {
				const [childHTML, childCount] = this.renderWaterFall(item.children, baseURL)
				html += <h2 id={item.title}>
					{item.title}
					{item.subtitle ? <small>{item.subtitle}</small> : item.url ? <small>{getName(item.url, false).replace(/^[a-z]/, w => w.toUpperCase())}</small> : undefined}
					<span class="doc-tag">{childCount}</span>
				</h2>
				html += childHTML
				count += childCount
			} else {
				globalItems.push(item)
			}
		}
		if (globalItems.length) {
			const [childHTML, childCount] = this.renderWaterFall(globalItems, baseURL)
			html = childHTML + html
			count += childCount
		}
		return [new HTML(html), count]
	}

	/**
	 * 渲染一个瀑布流
	 * @param items 要渲染的数据
	 * @param baseURL 每个目录项的根地址
	 */
	protected renderWaterFall(items: MarkdownListItem[], baseURL: string): [HTML, number] {
		let html = ""
		let count = 0
		const globalItems: MarkdownListItem[] = items.filter(item => !item.children)
		const [childHTML, childCount] = this.renderWaterFallSection(globalItems, baseURL)
		if (childCount) {
			html = <section class="doc-waterfall-item" style={`grid-row-end: span ${childCount + 1}`}>
				<ul>{childHTML}</ul>
			</section>
			count = childCount
		}
		for (const item of items) {
			if (item.children) {
				const [childHTML, childCount] = this.renderWaterFallSection(item.children, baseURL)
				if (childCount) {
					html += <section class="doc-waterfall-item" style={`grid-row-end: span ${childCount + 3}`}>
						<h4>
							{item.title}
							{item.subtitle ? <small>{item.subtitle}</small> : null}
							<span class="doc-tag">{childCount}</span>
						</h4>
						<ul>{childHTML}</ul>
					</section>
					count += childCount
				}
			}
		}
		return [<div class="doc-waterfall">{new HTML(html)}</div>, count]
	}

	/**
	 * 渲染瀑布流的一个区块
	 * @param items 要渲染的数据
	 * @param baseURL 每个目录项的根地址
	 */
	protected renderWaterFallSection(items: MarkdownListItem[], baseURL: string): [HTML, number] {
		let html = ""
		let count = 0
		for (const item of items) {
			if (item.children) {
				const [childHTML, childCount] = this.renderWaterFallSection(item.children, baseURL)
				html += childHTML
				count += childCount
			} else if (item.url !== undefined) {
				html += <li>
					<a href={this.options.baseURL + baseURL + this.builder.getHTMLOutputName(item.url)}>
						{item.title}
						{item.subtitle ? <small>{item.subtitle}</small> : null}
					</a>
				</li>
				count++
			}
		}
		return [new HTML(html), count]
	}

	/** 每个页面对应的搜索关键字 */
	readonly searchKeywords: { [url: string]: string[] } = Object.create(null)

	/**
	 * 添加指定页面对应的搜索关键字
	 * @param url 页面地址
	 * @param keyword 要添加的关键字
	 */
	addSearchKeyword(url: string, keyword: string) {
		const keywords = this.searchKeywords[url] ??= []
		pushIfNotExists(keywords, keyword)
	}

	/**
	 * 生成前端页面需要的数据
	 * @param url 当前页面的地址
	 */
	async buildData(url: string): Promise<CompileResult | undefined> {
		if (url.startsWith("pageIndex/") && url.endsWith(".js")) {
			const name = url.slice("pageIndex/".length, -".js".length)
			const dir = resolvePath(this.builder.options.baseDir, name)
			const data = await this.loadPageIndex(dir)
			const buffer = Buffer.from(`DOC.setPageIndexData(${JSON.stringify(data.items, (key, value) => {
				if (key === "indent" || key === "raw" || key === "checked") {
					return
				}
				if (key === "url") {
					return value === undefined ? value : this.builder.getHTMLOutputName(value)
				}
				if (Array.isArray(value)) {
					return value.filter(item => item.checked !== false)
				}
				return value
			})});`)
			buffer["raw"] = data
			return {
				content: buffer,
				dependencies: data.dependencies
			}
		}
		if (url === "searchIndex.js") {
			const searchIndex = new SearchIndexManager()
			const dependencies: (string | DependencyCallback)[] = []
			for (const root of await this.builder.getRootDirNames()) {
				const data = await this.builder.getAsset(`tdk/data/pageIndex/${root}.js`)
				if (data.type !== AssetType.file) {
					continue
				}
				const { items } = data.content["raw"]
				addItems(items, root, this.builder)
				if (data.dependencies) {
					dependencies.push(...data.dependencies)
				}
			}
			return {
				content: `DOC.setSearchIndexData(${JSON.stringify({
					items: searchIndex.items,
					pinyins: searchIndex.pinyins
				})});`,
				dependencies
			}

			function addItems(items: MarkdownListItem[], root: string, builder: Builder) {
				for (const item of items) {
					if (item.url) {
						searchIndex.add(item.title, item.subtitle, joinPath(root, builder.getHTMLOutputName(item.url)), builder.docCompiler.searchKeywords[item.url])
					}
					if (item.children) {
						addItems(item.children, root, builder)
					}
				}
			}
		}
		if (url === "testIndex.js") {
			const matcher = new Matcher("*.test.{js,jsx,ts,tsx}", this.builder.options.baseDir)
			if (this.builder.options.ignore) {
				matcher.exclude(this.builder.options.ignore)
				matcher.exclude(this.builder.options.outDir)
			}
			const tests = await this.builder.fs.glob(matcher)
			return {
				content: `DOC.renderUnitTest(${JSON.stringify(tests.map(test => setExt(this.builder.toURL(test), ".js")))});`,
				dependencies: [path => /\.test\.(?:js|jsx|ts|tsx)$/i.test(path)]
			}
		}
	}

	/**
	 * 获取动态生成的所有文件的地址
	 */
	async *getGeneratedDataURLs() {
		for (const entry of await this.builder.getRootDirNames()) {
			yield `pageIndex/${entry}.js`
		}
		yield "searchIndex.js"
		yield "testIndex.js"
	}

	/**
	 * 获取指定文件夹的索引数据
	 * @param dir 要扫描的文件夹绝对路径
	 */
	async loadPageIndex(dir: string) {
		const result = {
			autoGenerated: false,
			path: joinPath(dir, `index.md`),
			dependencies: [] as CompileResult["dependencies"],
			header: "",
			title: "",
			body: "",
			items: undefined as MarkdownListItem[]
		}
		// 先扫描 index.md 文件是否包含索引信息
		const listContent = await this.builder.fs.readText(result.path, false)
		if (listContent !== null) {
			const meta = parseMarkdownMeta(listContent)
			const list = parseMarkdownList(meta.body)
			result.header = meta.header
			result.title = meta.title
			result.body = list.rest
			if (result.items = list.items) {
				result.dependencies.push(result.path)
				return result
			}
		}
		result.autoGenerated = true
		result.title = getName(dir).toUpperCase()
		result.items = await this.generatePageIndex(dir)
		result.dependencies.push(path => containsPath(dir, path) && this.builder.getOutputNames(path).some(name => name.endsWith(".html")))
		return result
	}

	/**
	 * 扫描并生成指定文件夹的页面列表
	 * @param dir 要扫描的文件夹
	 * @param root 所属的根文件夹
	 * @param extensions 扫描的文件扩展名
	 */
	async generatePageIndex(dir: string, root = dir, extensions?: string[]): Promise<MarkdownListItem[]> {
		if (extensions === undefined) {
			extensions = []
			for (const compiler of this.builder.compilers) {
				if (compiler.outExt === ".html") {
					for (const inExt of compiler.inExts) {
						if (inExt === ".svg") {
							continue
						}
						extensions.push(inExt)
					}
				}
			}
		}
		const list: MarkdownListItem[] = []
		const entries = await this.builder.fs.readDir(dir, true)
		next: for (const entry of entries) {
			const path = joinPath(dir, entry.name)
			if (this.builder.isIgnored(path)) {
				continue
			}
			if (entry.isDirectory()) {
				// 如果文件夹存在首页，则链到首页
				const mainPath = joinPath(path, this.builder.getMainFileName(path) + ".md")
				const mainFileInfo = await this.loadPageIndexItem(mainPath)
				if (mainFileInfo) {
					mainFileInfo.url = relativePath(root, path) + "/"
					list.push(mainFileInfo)
					continue
				}
				// 否则遍历文件夹
				const childList = await this.generatePageIndex(path, root, extensions)
				if (childList.length) {
					list.push({
						title: entry.name.toUpperCase(),
						children: childList
					} as MarkdownListItem)
				}
				continue
			}
			// 文件：仅支持可生成 .html 的文件
			const index = extensions.indexOf(getExt(entry.name).toLowerCase())
			if (index < 0) {
				continue
			}
			// 如果有多个同名文件都能生成 .html，按编译器配置选择优先级
			for (let i = 0; i < index; i++) {
				if (entries.find(other => pathEquals(other.name, setExt(entry.name, extensions[i]), this.builder.fs.isCaseInsensitive))) {
					continue next
				}
			}
			// 排除根目录的 index.md 和首页.md
			if (root.length === dir.length) {
				const entryName = getName(entry.name, false)
				if (entryName === "index" || entryName === "README" || entryName === this.builder.getMainFileName(dir)) {
					continue
				}
			}
			const info = await this.loadPageIndexItem(path)
			if (info) {
				info.url = relativePath(root, path)
				list.push(info)
			}
		}
		list.sort((x, y) => {
			if (!x.children !== !y.children) {
				return x.children ? -1 : 1
			}
			return x.title < y.title ? -1 : x.title > y.title ? 1 : 0
		})
		return list
	}

	/**
	 * 解析指定页面对应的列表项
	 * @param path 要查询的页面
	 * @param checkExists 是否检查文件是否存在
	 */
	async loadPageIndexItem(path: string, checkExists?: boolean) {
		if (/\.md$/i.test(path)) {
			const content = await this.builder.fs.readText(path, false)
			if (content !== null) {
				const meta = this.parseMarkdownMeta(content, path)
				return {
					title: meta.name ?? meta.title,
					subtitle: meta.name ? meta.title : undefined
				} as MarkdownListItem
			}
			return null
		}
		if (checkExists && !await this.builder.fs.existsFile(path)) {
			return null
		}
		return {
			title: getName(path, false)
		} as MarkdownListItem
	}

	/**
	 * 获取指定地址对应的页面索引地址
	 * @param url 要处理的地址
	 */
	getPageIndexURL(url: string) {
		return "tdk/data/pageIndex/" + getRoot(url) + ".js"
	}

	/**
	 * 获取搜索索引地址
	 * @param url 要处理的地址
	 */
	getSearchIndexURL(url: string) {
		return "tdk/data/searchIndex.js"
	}

	// #endregion

	// #region 其它

	/**
	 * 构建一个单元测试页
	 * @param url 当前页面的地址
	 */
	buildUnitTestPage(url: string): CompileResult {
		return {
			content: this.renderUnitTestPage(url)
		}
	}

	/**
	 * 渲染一个单元测试页
	 * @param url 当前页面的地址
	 */
	protected renderUnitTestPage(url: string) {
		return `<!DOCTYPE html>` + <html lang={this.builder.options.locale} class="doc-page">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>单元测试 - {this.options.displayName}</title>
				<link rel="stylesheet" href={this.options.baseURL + "tdk/assets/qunit.css"} />
				{this.renderHead(url, { pageIndexRoot: undefined, ajaxLoading: false })}
				<script src={this.options.baseURL + "tdk/assets/require.js"} defer></script>
				<script src={this.options.baseURL + "tdk/assets/qunit.js"} defer></script>
				<script src={this.options.baseURL + "tdk/assets/unittest.js"} defer></script>
				<script src={this.options.baseURL + "tdk/data/testIndex.js"} defer></script>
			</head>
			<body>
				{this.renderHeader(url)}
				<main class="doc-body">
					<article class="doc-article">
						<div id="qunit">
							<span class="doc-tip"><span class="doc-spinner doc-icon-space-right"></span>正在载入测试用例...</span>
						</div>
						<div id="qunit-fixture"></div>
					</article>
					{this.options.backToTop ? <div class="doc-section doc-back-to-top">
						<a href="#" title="返回顶部" onclick="DOC.backToTop(); return false;">
							{this.renderIcon("top")}
						</a>
					</div> : null}
				</main>
				{this.renderFooter(url)}
				{this.renderFoot(url)}
			</body>
		</html>
	}

	/**
	 * 构建一个首页
	 * @param url 当前页面的地址
	 */
	buildHomePage(url: string): CompileResult {
		return {
			content: this.renderHomePage(url)
		}
	}

	/**
	 * 渲染一个首页
	 * @param url 当前页面的地址
	 */
	protected renderHomePage(url: string) {
		const githubURLMatch = /^(?:https?:)\/\/github\.com*\/([^\/]*)\/([^\/]*)/i.exec(this.options.repository)
		return `<!DOCTYPE html> ` + <html lang={this.builder.options.locale} class="doc-page doc-page-index">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{this.options.displayName}</title>
				{this.renderHead(url, { pageIndexRoot: undefined, ajaxLoading: false })}
				<link rel="stylesheet" href={this.options.baseURL + "tdk/assets/index.css"} />
			</head>
			<body class="doc-section">
				{this.renderHeader(url)}
				<main class="doc-main">
					<section class="doc-intro">
						<div class="doc-container">
							<div class="doc-intro-logo">
								{new HTML(this.options.logo)}
							</div>
							<div class="doc-intro-body">
								<h1 class="doc-intro-title">{this.options.displayName}</h1>
								<p class="doc-intro-description">{this.options.introDescription}</p>
								<div class="doc-intro-buttons">
									{this.options.introButtons?.map((button, index) => this.renderLink(button.label, button.href, button.title, `doc-intro-button${index ? "" : " doc-intro-button-primary"} `))}
								</div>
							</div>
						</div>
					</section>
					{this.options.packageName ? <section class="doc-download">
						<div class="doc-container">
							<h2>安装</h2>
							<div class="doc-download-body">
								<div class="doc-download-command">
									<label title="npm">{this.renderIcon("npm")}</label>
									<pre class="doc">
										<button type="button" aria-hidden="true" class="doc-toolbar-button doc-code-tool-copy" onclick="DOC.handleCopy(this, '已复制', '复制失败')">
											{this.renderIcon("copy")}
											<span class="doc-section doc-tooltip doc-arrow">复制</span>
										</button>
										<code>npm install {this.options.packageName}</code>
									</pre>
								</div>
								<div class="doc-download-command">
									<label title="yarn">{this.renderIcon("yarn")}</label>
									<pre class="doc">
										<button type="button" aria-hidden="true" class="doc-toolbar-button doc-code-tool-copy" onclick="DOC.handleCopy(this, '已复制', '复制失败')">
											{this.renderIcon("copy")}
											<span class="doc-section doc-tooltip doc-arrow">复制</span>
										</button>
										<code class="doc-language-bash">yarn add {this.options.packageName}</code>
									</pre>
								</div>
								{githubURLMatch ? <div class="doc-download-command">
									<iframe src={`https://ghbtns.com/github-btn.html?user=${githubURLMatch[1]}&repo=${githubURLMatch[2]}&type=star&count=true`} frameborder="0" scrolling="0" width="100" height="20"></iframe>
									<iframe src={`https://ghbtns.com/github-btn.html?user=${githubURLMatch[1]}&repo=${githubURLMatch[2]}&type=fork&count=true`} frameborder="0" scrolling="0" width="100" height="20"></iframe>
								</div> : null
								}
							</div>
						</div>
					</section> : null
					}
					{
						this.options.features?.length ? <section class="doc-features">
							<div class="doc-container">
								<h2>特性</h2>
								<ul class="doc-features-body">
									{this.options.features.map(feature => <li>
										{this.renderLink(<>
											{new HTML(feature.icon || "")}
											<h3>{feature.label}</h3>
											<p>{feature.description}</p>
										</>, feature.href, feature.title, "doc-feature-item")}
									</li>)}
								</ul>
							</div>
						</section> : null
					}
					{
						this.options.links?.length ? <section class="doc-resources">
							<div class="doc-container">
								<h2>链接</h2>
								<ul class="doc-resources-body">
									{this.options.links.map(link => <li>
										{this.renderLink(<>
											<span class="doc-resource-icon">
												{new HTML(link.icon || "")}
											</span>
											<span class="doc-resource-title">{link.label}</span>
										</>, link.href, link.title, "doc-resource")}
									</li>)}
								</ul>
							</div>
						</section> : null
					}
					{
						this.options.support ? <section class="doc-support">
							{this.renderLink(this.options.support.label, this.options.support.href, this.options.support.title)}
						</section> : null
					}
				</main>
				{this.renderFooter(url)}
				{this.renderFoot(url)}
			</body>
		</html>
	}

	/**
	 * 构建一个错误页面
	 * @param errors 已解析的错误日志
	 * @param ext 文件扩展名
	 * @param content 当前文件内容
	 */
	buildErrorPage(errors: LogEntry[], ext: string, content: string | Buffer) {
		const useHTML = ext === ".js" || ext === ".html"
		let message = useHTML ? `<button style="-webkit-appearance: none;
float: right;
margin: 0;
border: 0;
padding: .25em 0;
background: transparent;
outline: 0;
width: 1em;
color: #e0e0e0;
font-size: 1em;
line-height: 1em;" onclick="this.parentNode.parentNode.removeChild(this.parentNode)" title="关闭">✖</button>` : ""
		const oldTimestamp = this.builder.logger.timestamp
		this.builder.logger.timestamp = false
		for (const error of errors) {
			if (useHTML) {
				message += `<div style="margin-bottom: 2em">${ansiToHTML(this.builder.logger.formatLog(error, error.warning ? LogLevel.warning : LogLevel.error, true), { gray: "#ccc" })}</div>`
			} else {
				if (message) message += "\n\n\n"
				message += this.builder.logger.formatLog(error, error.warning ? LogLevel.warning : LogLevel.error, false)
			}
		}
		this.builder.logger.timestamp = oldTimestamp
		const css = `position: fixed;
top: 0;
left: 0;
bottom: 0;
right: 0;
overflow: auto;
z-index: 65535;
box-sizing: border-box;
background: rgba(0, 0, 0, .75);
padding: 2rem;
font-family: Monaco, Menlo, Consolas, "Courier New", "Helvetica Neue", Helvetica, "Hiragino Sans GB", "Microsoft Yahei", monospace;
font-size: 1rem;
white-space: pre-wrap;
color: #ffffff;`
		switch (ext) {
			case ".js":
				return `/* This file has ${errors.length} compiler error(s) */
!function() {
	var div = document.getElementById("doc_compile_error") || document.body.appendChild(document.createElement("div"));
	div.id = "doc_compile_error";
	div.style.cssText = ${quoteJSString(css)};
	div.innerHTML = ${quoteJSString(message)};
}();`
			case ".css":
				return `/* This file has ${errors.length} compiler error(s) */
html::after {
	content: ${quoteCSSString(message, '"')};
	${css}
}
${content}`
			case ".html":
				return `<!{errors.length} compiler error(s) -->\n${(String(content)).replace(/(?=<!--#DOC-ARTICLE-END-->|<\/[bB][oO][dD][yY]>|$)/, `<div id="doc_compile_error" style=${quoteHTMLAttribute(css, '"')}>${message}</div>`)}`
			default:
				return message
		}
	}

	// #endregion

}

/** 表示文档编译器的选项 */
export interface DocCompilerOptions {
	/** 生成的页面中引用资源的根地址 */
	baseURL?: string
	/** 项目 LOGO，可以是一段 `<svg>` 或 `<img>` 源码 */
	logo?: string
	/** 项目展示名，用于网站标题栏及左上角 LOGO 文案 */
	displayName?: string
	/** 项目版本 */
	version?: string
	/** 其它版本链接 */
	versions?: Link[]
	/** 顶部导航条链接 */
	navbar?: (Link & {
		/** 子菜单 */
		children?: Link[]
	})[]
	/** 底部链接 */
	footer?: Link[]
	/** 底部版权声明 */
	copyright?: string
	/** 生成的文档头部插入的 HTML 代码，比如 SEO 标记 */
	injectHead?: string
	/** 生成的文档末尾插入的 HTML 代码，比如放入一些统计代码 */
	injectFoot?: string

	/** 自动生成索引的最大标题等级（1-6）（默认 4） */
	maxTOCLevel?: number
	/** 定制为每个标题生成序号 */
	counter?: boolean | ((counts: number[], item: TOCItem) => string)
	/** 是否插入返回顶部链接 */
	backToTop?: boolean

	/** 项目描述 */
	introDescription?: string
	/** 项目描述后的按钮 */
	introButtons?: Link[]
	/** 项目优势说明链接 */
	features?: (Link & {
		/** 图标 */
		icon: string
		/** 描述文案 */
		description: string
	})[]
	/** 友情链接 */
	links?: (Link & {
		/** 图标 */
		icon: string
	})[]
	/** 支持/赞助链接 */
	support?: Link

	/** 发布的包名 */
	packageName?: string
	/** 项目仓库地址(HTTPS 协议) */
	repository?: string
	/** 项目根目录在仓库中的路径 */
	repositoryPath?: string
	/** 项目仓库分支 */
	branch?: string
	/**
	 * 读取指定文件的修改记录
	 * @param files 相关的文件绝对路径
	 */
	readCommits?: (files: string[]) => CommitInfo[] | Promise<CommitInfo[]>
}

/** 表示一个链接配置 */
export interface Link {
	/** 链接文案 */
	label: string
	/** 链接地址 */
	href?: string
	/** 鼠标悬停时的工具提示 */
	title?: string
}

/** 表示提交信息 */
export interface CommitInfo {
	/** 作者名 */
	authorName: string
	/** 作者邮箱 */
	authorEmail: string
	/** 提交时间 */
	date: string
}

/** 表示一个生成一个文档页的上下文 */
export interface DocPageContext {
	/** 当前页面的最终访问地址 */
	url: string
	/** 生成当前页面的源地址 */
	sourceURL: string
	/** 构建当前页面时产生的错误 */
	errors: CompileResult["errors"]
	/** 构建当前页面时读取的依赖路径 */
	dependencies: CompileResult["dependencies"]

	/** 目录管理器 */
	tocManager: TOCManager
	/** 自动生成索引的最大标题等级（1-6）（默认 4） */
	maxTOCLevel?: number
	/** 是否渲染为窄页面，窄页面适合文字多的页面 */
	narrow?: boolean
	/** 演示计数器 */
	demoCount: number
	/** 自测用演示计数器 */
	demoForTestCount: number
	/** 内联脚本计数器 */
	scriptCount: number

	/** 是否生成分页器 */
	pager?: boolean
	/** 导航高亮的当前页地址 */
	activeURL?: string
	/** 上一页地址 */
	prevPage?: Link
	/** 下一页地址 */
	nextPage?: Link

	/** 当前页面对应的 TS/JS 源码地址（如果有）*/
	codeURL?: string
	/** 当前页面对应的单元测试源码地址（如果有）*/
	unitTestURL?: string
	/** API 文档解析器（如果有） */
	docParser?: TypeScriptDocParser

	/** 当前页面的信息 */
	meta: DocPageMeta
	/** 当前页面的标题 */
	title: string
	/** 当前页面的副标题 */
	subtitle?: any
	/** 当前页面的状态 */
	state?: "developing" | "experimental" | "stable" | "deprectated" | "legacy" | string
	/** 所有标签 */
	tags?: string[]
	/** 所有维护者 */
	authors?: Link[]
	/** 所有修改历史 */
	changeLogs?: Link[]
}

/** 表示文档页面的元数据 */
export interface DocPageMeta extends MarkdownMeta {
	/** 是否生成目录，如果是数字则表示生成目录的最低标题等级（1-4） */
	toc?: boolean | number
	/** 额外插入的文件头部内容 */
	injectHead?: any
	/** 额外插入的文件底部内容 */
	injectFoot?: any
	/** 是否插入翻页器 */
	pager?: boolean
	/** 是否插入标题计数器 */
	counter?: DocCompilerOptions["counter"]
	/** 是否生成窄页面风格 */
	narrow?: boolean
	/** 是否自动生成关联的 API 文档 */
	api?: boolean
	/** 是否显示当前文件的元信息 */
	meta?: boolean
}

/** 表示代码块的类型 */
const enum CodeBlockType {
	/** 仅显示代码 */
	code,
	/** 仅显示效果 */
	run,
	/** 上下结构显示效果和源码 */
	demo,
	/** 左右结构显示源码和效果 */
	example,
	/** 测试用例 */
	test,
}