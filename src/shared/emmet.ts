/**
 * 解析一个简易的 CSS 选择器（如 `tag#id.class[attr=value]`）
 * @param value 要解析的内容
 * @param className 预定义的 CSS 类名
 */
export function parseEmmet(value: string, className = "") {
	let tagName: string
	let id: string
	let props = ""
	value = (/\[[^'"\]]+\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\]]*))?\]|\{(.*)\}/.exec(value)?.[1] ?? value)
		.replace(/\[([^'"\]]+\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\]]*))?)\]/g, (all, prop: string) => {
			props += " " + prop
			return ""
		}).replace(/\.([\w\-]+)/g, (all, value: string) => {
			if (className) className += " "
			className += value
			return ""
		}).replace(/#(\S+)/g, (all, value: string) => {
			props += ` id="${id = value}"`
			return ""
		}).replace(/^[\w\-]+\b/, all => {
			tagName = all
			return ""
		})
	return {
		tagName,
		id,
		className,
		props: className ? ` class="${className}"${props}` : props,
		rest: value
	}
}