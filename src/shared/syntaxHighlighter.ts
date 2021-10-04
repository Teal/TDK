import Prism = require("prismjs")
import loadLanguages = require("prismjs/components/")

loadLanguages.silent = true
const currentContext = {
	classPrefix: "",
	highlightLine: false
}
Prism.hooks.add("wrap", env => {
	for (let i = 0; i < env.classes.length; i++) {
		env.classes[i] = currentContext.classPrefix + env.classes[i]
	}
	if (currentContext.highlightLine) {
		if (env.type !== "code-block") {
			env.content = env.content.replace(/\r?\n/g, br => {
				let attributes = ""
				for (const name in env.attributes) {
					attributes += ` ${name}="${(env.attributes[name] || "").replace(/"/g, "&quot;")}"`
				}
				return `</${env.tag}>${br}<${env.tag} class="${env.classes.join(" ")}"${attributes}>`
			})
		}
	}
})

/**
 * 高亮指定的内容并返回一段 HTML
 * @param content 要高亮的内容
 * @param language 高亮的语法
 * @param classPrefix 自定义类名前缀
 */
export function highlight(content: string, language: string, classPrefix = "") {
	if (!(language in Prism.languages)) {
		loadLanguages(language)
	}
	const originalContent = content
	content = removeHighlightMarkers(content)
	currentContext.classPrefix = classPrefix
	currentContext.highlightLine = content.length !== originalContent.length
	const grammer = Prism.languages[language]
	content = grammer ? Prism.highlight(content, grammer, language) : Prism.util.encode(content) as string
	if (currentContext.highlightLine) {
		// 如果一个 <span> 内部包含换行，拆成多行
		const lines = originalContent.split(/\r?\n/)
		content = content.split(/\r?\n/).map((line, index) => {
			const originalLine = lines[index]
			if (/^[\+\-\>][ \t]/.test(originalLine)) {
				return `<span class="${classPrefix}${originalLine.startsWith(">") ? "highlight" : originalLine.startsWith("+") ? "inserted" : "deleted"}">${originalLine.startsWith(">") ? "" : originalLine[0]}${line}</span>`
			}
			return line
		}).join("\n")
	}
	return content
}

/**
 * 删除代码中的高亮注解
 * @param content 要高亮的内容
 */
export function removeHighlightMarkers(content: string) {
	return content.replace(/^[\+\-\>][ \t]|^\\[\+\-\>\\]/mg, all => {
		if (all.charCodeAt(1) === 32) {
			return ""
		}
		return all.charAt(1)
	})
}

/**
 * 规范化语言名称
 * @param language 要使用的语言
 */
export function normalizeLanguage(language: string) {
	return { htm: "html", "javascript": "js", "typescript": "ts", "markdown": "md" }[language] || language
}