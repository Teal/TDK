import { encodeDataURI } from "tutils/base64"
import { glob, readText, writeFile } from "tutils/fileSystemSync"
import { getName } from "tutils/path"
import { optimizeSVG } from "../shared/svgOptimizor"
import { translateSVG } from "../shared/svgTranslator"

/**
 * 打包图标文件
 * @param options 选项
 */
export default async function (options: any) {
	const inputs: string[] = []
	for (let i = 1; options[i]; i++) {
		inputs.push(options[i])
	}
	const outputFile = options["-o"] ?? options["--out"]
	const { code, count } = generateIcons(glob(inputs), options["--height"], options["--postfix"], options["--noColor"])
	writeFile(outputFile, code)
	console.info(`图标文件已生成：${outputFile}(共 ${count} 个)`)
}

/**
 * 生成图标文件
 * @param icons 所有图标 
 */
export function generateIcons(icons: string[], height?: number, postfix?: string, noColor?: boolean) {
	let code = ""
	let count = 0
	for (const icon of icons) {
		let content = readText(icon)
		if (height) {
			content = translateSVG(content, height)
		}
		content = optimizeSVG(content, !!height, noColor)
		const name = getName(icon, false).replace(/-(\w)/g, (_, word: string) => word.toUpperCase())
		code += `/** ![${name}](${encodeDataURI("image/svg+xml", `<svg xmlns="http://www.w3.org/2000/svg"${height ? ` viewBox="0 0 ${height} ${height}"` : ""} width="1em" height="1em" fill="#D73A49">${content.replace(/"currentColor"/g, '"#D73A49"')}</svg>`)}) */\n`
		code += `export const ${postfix ? name + postfix : name} = \`${content.replace(/[\`$]/g, "\\$&")}\`\n\n`
		count++
	}
	return {
		count: count,
		code: code.trim()
	}
}