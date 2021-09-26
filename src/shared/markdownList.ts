import { getName } from "tutils/path"

/**
 * 解析 Markdown 语法的列表
 * @param content 要解析的内容
 */
export function parseMarkdownList(content: string) {
	const stack = [{
		indent: -1,
		children: []
	} as MarkdownListItem]
	while (content) {
		const match = /^([ \t\u00A0]*)-\s+(\[[xX \u00A0]\]\s*)?(\[(.+)\]\((.+)\)|.*)\s*(?:\r\n?|\n|$)/.exec(content)
		if (!match) {
			break
		}
		const [raw, indentString, checkedString, title1, title2, url] = match
		const title = title2 ?? title1
		const subtitleMatch = /^(.+)\((.+)\)$/.exec(title)
		const item: MarkdownListItem = {
			raw: raw,
			indent: indentString.replace(/\t/g, "  ").length,
			checked: checkedString === undefined ? undefined : checkedString.includes("x") || checkedString.includes("X"),
			title: subtitleMatch ? subtitleMatch[1] : title,
			subtitle: subtitleMatch?.[2] ?? (url ? getName(url, false) : undefined),
			url: url
		}
		let stackTop = stack[stack.length - 1]
		while (item.indent <= stackTop.indent) {
			stack.pop()
			stackTop = stack[stack.length - 1]
		}
		stackTop.children ??= []
		stackTop.children.push(item)
		stack.push(item)
		content = content.substring(raw.length)
	}
	return {
		/** 已解析的列表 */
		items: stack[0].children,
		/** 剩余未解析的内容 */
		rest: content
	}
}

/**
 * 格式化 Markdown 语法的列表
 * @param items 要格式化的目录项
 * @param indent 使用的缩进字符串
 * @param prefix 在每行内容前插入的前缀
 */
export function formatMarkdownList(items: MarkdownListItem[], indent = "  ", prefix = ""): string {
	return items.map(item => {
		const checkedString = item.checked === true ? "[x] " : item.checked === false ? "[ ] " : ""
		const title = item.subtitle ? `${item.title}(${item.subtitle})` : item.title
		const content = item.url === undefined ? title : `[${title}](${item.url})`
		const children = item.children?.length ? "\n" + formatMarkdownList(item.children, indent, prefix + indent) : ""
		return `${prefix}- ${checkedString}${content}${children}`
	}).join("\n")
}

/** 表示一个列表项 */
export interface MarkdownListItem {
	/** 当前列表项的原始内容 */
	raw: string
	/** 当前列表项的缩进数 */
	indent: number
	/** 当前列表项是否被勾选 */
	checked?: boolean
	/** 当前列表项的标题 */
	title: string
	/** 当前列表项的副标题 */
	subtitle?: string
	/** 当前列表项的地址 */
	url?: string
	/** 所有子列表项 */
	children?: MarkdownListItem[]
}