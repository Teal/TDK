import MarkdownIt = require("markdown-it")
import Renderer = require("markdown-it/lib/renderer")
import Token = require("markdown-it/lib/token")

/** 表示一个 GitHub 风格的 Markdown 编译器 */
export class MarkdownCompiler extends MarkdownIt {

	/**
	 * 初始化新的编译器
	 * @param options 附加选项
	 */
	constructor(options?: MarkdownIt.Options & { plugins?: ([string | MarkdownIt.PluginWithParams, ...any[]] | string)[] }) {
		super({
			linkify: true,
			...options
		})
		this.use(todoList)
			.use(imageBlock)
			.use(table)
		const plugins = options?.plugins
		if (plugins) {
			for (const plugin of plugins) {
				const args = Array.isArray(plugin) ? plugin : [plugin]
				if (typeof args[0] === "string") {
					args[0] = require(require.resolve(args[0], { paths: [process.cwd()] }))
				}
				this.use(...args as [MarkdownIt.PluginWithParams, ...any[]])
			}
		}
	}

}

/** MarkdownIt 插件：支持任务列表 */
export function todoList(md: MarkdownIt, renderCheckBox = (checked: boolean, context: any) => `<input type="checkbox"${checked ? ` checked="checked"` : ""} disabled="disabled">`) {
	const openLabels: boolean[] = []
	const openRenderer = setRenderer(md, "list_item_open", (tokens, idx, options, context, self) => {
		const firstChild = tokens[idx + 2]?.children?.[0]
		if (!firstChild) {
			return
		}
		const match = /^\s*\[([xX \u00A0])\]\s?/.exec(firstChild.content)
		if (!match) {
			return
		}
		firstChild.content = firstChild.content.slice(match[0].length)
		openLabels[tokens[idx].level] = true
		return `${openRenderer(tokens, idx, options, context, self)}<label>${renderCheckBox(match[1] === "x" || match[1] === "X", context)}`
	})
	for (const closeType of ["list_item_close", "bullet_list_open", "ordered_list_open"]) {
		const closeRenderer = setRenderer(md, closeType, (tokens, idx, options, context, self) => {
			const level = tokens[idx].level - (closeType === "list_item_close" ? 0 : 1)
			if (openLabels[level]) {
				openLabels[level] = false
				return `</label>${closeRenderer(tokens, idx, options, context, self)}`
			}
		})
	}
}

/** MarkdownIt 插件：支持将独立的图片放到 `<figure>` */
export function imageBlock(md: MarkdownIt) {
	setRenderer(md, "paragraph_open", (tokens, idx, options, context, self) => {
		if (tokens[idx + 2]?.type === "paragraph_close" && tokens[idx + 1].type === "inline") {
			const children = tokens[idx + 1].children
			if (children[0].type !== "image") {
				return
			}
			const alt = children[0].children?.[0].content
			if (children.length > 1) {
				for (let i = 1; i < children.length; i++) {
					const child = children[i]
					if (child.type === "softbreak") {
						continue
					}
					if (child.type !== "image") {
						return
					}
					if (child.children?.[0].content !== alt) {
						return
					}
				}
				for (let i = children.length - 1; i > 0; i--) {
					if (children[i].type === "softbreak") {
						children.splice(i, 1)
					}
				}
			}
			tokens[idx + 2].tag = tokens[idx].tag = "figure"
			if (alt) {
				const altToken = new Token("text", "", 0)
				children[0].children[0].content = altToken.content = alt.replace(/(?!\\)#/, () => (context._imageCount ? ++context._imageCount : (context._imageCount = 1)).toString())
				children.push(
					new Token("figcaption", "figcaption", 1),
					altToken,
					new Token("figcaption", "figcaption", -1)
				)
			}
		}
	})
}

/** MarkdownIt 插件：支持扩展表格 */
export function table(md: MarkdownIt) {
	require("markdown-it-multimd-table")(md, {
		multiline: true,
		rowspan: true,
		headerless: true
	})
	const openRenderer = setRenderer(md, "table_open", (tokens, idx, options, context, self) => {
		let openCaptionIndex = -1
		let closeCaptionIndex = -1
		let openTHeadIndex = -1
		let closeTableIndex = -1
		outer: for (let i = idx; i < tokens.length; i++) {
			switch (tokens[i].type) {
				case "table_close":
					closeTableIndex = i
					break outer
				case "caption_open":
					openCaptionIndex = i
					break
				case "caption_close":
					closeCaptionIndex = i
					break
				case "thead_open":
					openTHeadIndex = i
					break
			}
		}
		let figcapture = ""
		if (openCaptionIndex >= 0 && closeCaptionIndex > openCaptionIndex && closeTableIndex >= 0) {
			figcapture = `<figcaption>${md.renderer.render(tokens.slice(openCaptionIndex + 1, closeCaptionIndex), options, context).replace(/(?!\\)#/, () => (context._tableCount ? ++context._tableCount : (context._tableCount = 1)).toString())}</figcaption>`
			for (let i = openCaptionIndex; i <= closeCaptionIndex; i++) {
				if (tokens[i].type === "inline") {
					tokens[i].children.length = 0
				} else {
					tokens[i].hidden = true
				}
			}
			if (tokens[openCaptionIndex].map[0] > tokens[openTHeadIndex].map[0]) {
				tokens[closeTableIndex]["figcapture"] = figcapture
				figcapture = ""
			}
		}
		return `<figure>${figcapture}${openRenderer(tokens, idx, options, context, self)}`
	})
	const closeRenderer = setRenderer(md, "table_close", (tokens, idx, options, context, self) => `${closeRenderer(tokens, idx, options, context, self)}${tokens[idx]["figcapture"] ?? ""}</figure>`)
}

/** MarkdownIt 插件：支持生成图片占位符和其它错误占位符 */
export function image(md: MarkdownIt, render?: (token: Token, context: any) => any) {
	setRenderer(md, "image", (tokens, idx, options, context, self) => {
		const token = tokens[idx]
		const src = token.attrGet("src")
		const match = /^(\d+(?:\.\d+)?)[xX×](\d+(?:\.\d+)?)$/.exec(src)
		if (match) {
			const width = match[1]
			const height = match[2]
			token.attrSet("src", `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'%3E%3Crect fill='%23e1e4e8' width='${width}' height='${height}'/%3E%3Ctext x='50%25' y='50%25' font-size='${Math.min(+width / src.length, 30)}' text-anchor='middle' alignment-baseline='middle' font-family='sans-serif' fill='%23555'%3E${width}×${height}%3C/text%3E%3C/svg%3E`)
			token.attrSet("width", width)
			token.attrSet("height", height)
		}
		return render?.(token, context)
	})
}

/** MarkdownIt 插件：为块级引用添加颜色样式 */
export function blockquote(md: MarkdownIt, markers: { [name: string]: { class: string, renderIcon?: (content: string, context: any) => string } } = {}, renderOpenTitle?: (context: any) => string, renderCloseTitle?: (context: any) => string) {
	const defaultRenderer = setRenderer(md, "blockquote_open", (tokens, idx, options, context, self) => {
		const firstChild = tokens[idx + 2]?.children?.[0]
		if (!firstChild) {
			return
		}
		const match = /^\[([^\[\]]*)\]\s?/.exec(firstChild.content)
		if (!match) {
			return
		}
		const marker = markers[match[1]]
		if (!marker) {
			return
		}
		firstChild.content = firstChild.content.slice(match[0].length)
		tokens[idx].attrSet("class", marker.class)
		const openTag = defaultRenderer(tokens, idx, options, context, self)
		const icon = marker.renderIcon?.(firstChild.content, context) ?? ""
		const brIndex = renderOpenTitle ? tokens[idx + 2].children.findIndex(token => token.type === "softbreak") : -1
		if (brIndex > 0) {
			tokens[idx + 2].children[brIndex].type = "blockquote_title_close"
			return `${openTag}${renderOpenTitle(context)}${icon}`
		} else {
			return `${openTag}${icon}`
		}
	})
	setRenderer(md, "blockquote_title_close", (tokens, idx, options, context, self) => renderCloseTitle!(context))
}

/** MarkdownIt 插件：支持插入容器 */
export function container(md: MarkdownIt, renderers: { renderOpenContainer: Renderer.RenderRule, renderCloseContainer: Renderer.RenderRule, renderOpenSeperator: Renderer.RenderRule, renderCloseSeperator: Renderer.RenderRule }) {
	md.block.ruler.before("fence", "container", (state, startLine, endLine, silent) => {
		const start = state.bMarks[startLine] + state.tShift[startLine]
		if (!state.src.startsWith(":::", start)) { return false }
		if (silent) { return true }
		let closeLine = startLine
		let closed = false
		let seperators: number[] | undefined
		const info = state.src.slice(start + ":::".length, state.eMarks[startLine])
		const markup = ":::" + (/^:+/.exec(info)?.[0] ?? "")
		while (++closeLine < endLine) {
			const start = state.bMarks[closeLine] + state.tShift[closeLine]
			const end = state.eMarks[closeLine]
			if (start < end && state.sCount[closeLine] < state.blkIndent) {
				break
			}
			if (state.src.startsWith(markup, start) && state.sCount[closeLine] - state.blkIndent < 4 && state.skipSpaces(start + markup.length) >= end) {
				closed = true
				break
			}
			if (state.src.startsWith("---", start) && state.sCount[closeLine] - state.blkIndent < 4 && state.skipSpaces(start + "---".length) >= end) {
				if (seperators === undefined) seperators = []
				seperators.push(closeLine)
			}
		}
		if (!closed) {
			return false
		}
		const openContainerToken = state.push("container_open", "div", 1)
		openContainerToken.markup = markup
		openContainerToken.block = true
		openContainerToken.info = info.slice(markup.length - ":::".length)
		openContainerToken.map = [startLine, closeLine]
		openContainerToken.meta = {
			seperators
		}
		const oldParentType = state.parentType
		const oldLineMax = state.lineMax
		state.parentType = "container" as any
		if (seperators) {
			for (let i = 0; i <= seperators.length; i++) {
				const openSeperatorToken = state.push("container_seperator_open", "div", 1)
				openSeperatorToken.markup = "---"
				openSeperatorToken.block = true
				openSeperatorToken.meta = {
					openContainerToken,
					seperators,
					index: i
				}
				state.md.block.tokenize(state, (i === 0 ? startLine : seperators[i - 1]) + 1, state.lineMax = i === seperators.length ? closeLine : seperators[i])
				const closeSeperatorToken = state.push("container_seperator_close", "div", -1)
				closeSeperatorToken.markup = "---"
				closeSeperatorToken.block = true
				closeSeperatorToken.meta = {
					openContainerToken,
					seperators,
					openSeperatorToken,
					index: i
				}
			}
		} else {
			state.md.block.tokenize(state, startLine + 1, state.lineMax = closeLine)
		}
		state.parentType = oldParentType
		state.lineMax = oldLineMax
		const closeContainerToken = state.push("container_close", "div", -1)
		closeContainerToken.markup = markup
		closeContainerToken.block = true
		closeContainerToken.meta = {
			openContainerToken,
			seperators
		}
		state.line = closeLine + 1
		return true
	}, {
		alt: ["paragraph", "reference", "blockquote", "list"]
	})
	md.renderer.rules.container_open = renderers.renderOpenContainer
	md.renderer.rules.container_close = renderers.renderCloseContainer
	md.renderer.rules.container_seperator_open = renderers.renderOpenSeperator
	md.renderer.rules.container_seperator_close = renderers.renderCloseSeperator
}

/** MarkdownIt 插件：支持代码块 */
export function code(md: MarkdownIt, renderCode: (content: string, lang: string, context: any) => string) {
	setRenderer(md, "fence", (tokens, idx, options, context) => {
		const token = tokens[idx]
		const content = token.content
		return renderCode(content, token.info, context)
	})
}

/** MarkdownIt 插件：支持链接扩展 */
export function link(md: MarkdownIt, { redirect = (url: string, context: any) => url, isEnternal = (url: string, context: any) => /^([\w\-]*:)?\/\//.test(url), externalClass = "", renderExternalIcon = (token: Token, context: any) => "" }) {
	let insertPostfix = false
	setRenderer(md, "link_open", (tokens, idx, options, context) => {
		const token = tokens[idx]
		const href = redirect(token.attrGet("href"), context)
		token.attrSet("href", href)
		if (isEnternal(href, context)) {
			token.attrSet("target", "_blank")
			if (externalClass) {
				token.attrSet("class", externalClass)
			}
			if (renderExternalIcon) insertPostfix = true
		}
	})
	const defaultRenderer = setRenderer(md, "link_close", (tokens, idx, options, context) => {
		if (insertPostfix) {
			insertPostfix = false
			return renderExternalIcon(tokens[idx], context) + defaultRenderer(tokens, idx, options, context)
		}
	})
}

/** MarkdownIt 插件：支持使用 `{@...}` 语法内嵌其它内容 */
export function embed(md: MarkdownIt, render: (type: string, content: string, context: any) => string | undefined) {
	md.inline.ruler.push("embed", (state, silent) => {
		let start = state.pos
		if (!state.src.startsWith("{@", start)) {
			return false
		}
		start += "{@".length
		const end = state.src.indexOf("}", start + 1)
		if (end < 0) return false
		const spaceIndex = state.src.indexOf(" ", start)
		const rendered = render(spaceIndex < 0 ? "" : state.src.substring(start, spaceIndex), state.src.substring(spaceIndex + 1, end), state.env)
		if (rendered === undefined) {
			return false
		}
		state.pos = end + "}".length
		if (silent) return true
		const token = state.push("html_block", "", 0)
		token.content = rendered
		return true
	})
}

/** MarkdownIt 插件：支持为每个标题生成索引 */
export function heading(md: MarkdownIt, getAnchor: (token: Token, content: string, hash: string | undefined, context: any) => string) {
	const oldHeadingParser = setRuler(md, "heading", (state, startLine, endLine, silent) => {
		if (oldHeadingParser(state, startLine, endLine, silent)) {
			parseHeading(state.tokens, state.env)
			return true
		}
		return false
	})
	const oldLineHeadingParser = setRuler(md, "lheading", (state, startLine, endLine, silent) => {
		if (oldLineHeadingParser(state, startLine, endLine, silent)) {
			parseHeading(state.tokens, state.env)
			return true
		}
		return false
	})

	function parseHeading(tokens: Token[], context: any) {
		const openToken = tokens[tokens.length - 3]
		let content = tokens[tokens.length - 2].content
		const hash = /\s*\{(.+)\}\s*$/.exec(content)
		if (hash && hash[0].length < content.length) {
			tokens[tokens.length - 2].content = content = content.substring(0, content.length - hash[0].length)
		}
		const anchor = getAnchor(openToken, content.replace(/([\`\*\_]+)(.*?)\1/g, "$2"), hash?.[1], context)
		if (anchor) {
			openToken.attrSet("id", anchor)
		}
	}
}

/** MarkdownIt 插件：支持标题插入描点 */
export function parmalink(md: MarkdownIt, renderParmaLink: (anchor: string | undefined, token: Token, context: any) => string) {
	const defaultOpenRenderer = setRenderer(md, "heading_open", (tokens, idx, options, context, self) => {
		const token = tokens[idx]
		const id = token.attrGet("id")
		const link = renderParmaLink(id, token, context)
		return `${defaultOpenRenderer(tokens, idx, options, context, self)}${link || ""}`
	})
}

/** MarkdownIt 插件：支持转换内联 HTML */
export function html(md: MarkdownIt, renderHTML: (content: string, context: any) => string) {
	setRenderer(md, "html_block", (tokens, idx, options, context) => {
		tokens[idx].content = renderHTML(tokens[idx].content, context)
	})
}

/** 设置指定标记的渲染器，返回原渲染器 */
function setRenderer(md: MarkdownIt, type: string, renderer: (tokens: Token[], idx: number, options: any, env: any, self: Renderer) => string | void) {
	const defaultRenderer = md.renderer.rules[type] ?? md.renderer.renderToken.bind(md.renderer)
	md.renderer.rules[type] = (tokens, idx, options, context, self) => renderer(tokens, idx, options, context, self) as any ?? defaultRenderer(tokens, idx, options, context, self)
	return defaultRenderer
}

/** 设置指定标记的解析器，返回原解析器 */
function setRuler(md: MarkdownIt, type: string, ruler: Parameters<MarkdownIt["block"]["ruler"]["at"]>[1]) {
	const rule = ((md.block.ruler as any).__rules__ as any[]).find(rule => rule.name === type)
	const defaultRuler = rule.fn as typeof ruler
	rule.fn = ruler
	return defaultRuler
}