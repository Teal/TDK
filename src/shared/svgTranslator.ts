import SvgPath = require("svgpath")
import { parser as createXMLParser } from "sax"

/**
 * 移动和缩放一个 `<svg>`
 * @param svg 要转换的 `<svg>` 源码
 * @param height 转换后的高度，宽度将根据当前比例自动缩放
 * @param minWidth 最小宽度
 * @param offsetY 垂直的偏移
 * @param offsetX 水平的偏移
 */
export function translateSVG(svg: string, height: number, minWidth = 0, offsetY = 0, offsetX = 0) {
	let result = `<?xml version="1.0"?>`
	const context = {}
	const parser = createXMLParser(true)
	parser.onopentag = (node: any) => {
		transformNode(node, height, minWidth, offsetY, offsetX, context)
		result += `<${node.name}`
		for (const key in node.attributes) {
			result += ` ${key}="${String(node.attributes[key]).replace('"', "&quot;")}"`
		}
		result += ">"
	}
	parser.ontext = (text: string) => {
		result += text
	}
	parser.onclosetag = (nodeName: any) => {
		result += `</${nodeName}>`
	}
	parser.write(svg).close()
	return result
}

function transformNode(node: any, height: number, minWidth: number, offsetY: number, offsetX: number, context: any) {
	switch (node.name) {
		case "svg":
		case "symbol":
			let originalX = 0
			let originalY = 0
			let originalWidth = 0
			let originalHeight = 0
			if (node.attributes.viewBox) {
				const parts = node.attributes.viewBox.split(/\s+/)
				originalX = +parts[0]
				originalY = +parts[1]
				originalWidth = +parts[2]
				originalHeight = +parts[3]
			} else {
				originalWidth = parseFloat(node.attributes.width) || height
				originalHeight = parseFloat(node.attributes.height) || height
			}
			context.offsetX = -originalX + offsetX
			context.offsetY = -originalY + offsetY
			context.scale = height / originalHeight
			let width = Math.round(originalWidth * context.scale * 10000) / 10000
			if (width < minWidth) {
				context.offsetX += (minWidth - width) / 2
				width = minWidth
			} else {
				width = Math.round(originalWidth * context.scale * 10000) / 10000
			}
			node.attributes.viewBox = [
				0,
				0,
				width,
				height
			].join(" ")
			break
		case "path":
			node.attributes.d = new SvgPath(node.attributes.d)
				.translate(context.offsetX, context.offsetY)
				.scale(context.scale)
				.abs()
				.round(1)
				// @ts-ignore
				.rel()
				.round(1)
				.toString()
			break
		case "rect":
		case "line":
		case "circle":
		case "ellipse":
			const dxAttrs = ["cx", "x", "x1", "x2"]
			const dyAttrs = ["cy", "y", "y1", "y2"]
			const scaleAttrs = ["width", "height", "rx", "ry", "r", ...dxAttrs, ...dyAttrs]
			for (const attrKey in node.attributes) {
				if (scaleAttrs.indexOf(attrKey) > -1) {
					node.attributes[attrKey] *= context.scale
				}
				if (dxAttrs.indexOf(attrKey) > -1) {
					node.attributes[attrKey] += context.offsetX
				}
				if (dyAttrs.indexOf(attrKey) > -1) {
					node.attributes[attrKey] += context.offsetY
				}
			}
			break
		case "polyline":
		case "polygon":
			node.attributes.points = (node.attributes.points || "").trim()
				.split(/\s+/)
				.map((point: any) => {
					const pair = point.split(",")
					pair[0] = pair[0] * context.scale + context.offsetX
					pair[1] = pair[1] * context.scale + context.offsetY
					return pair.join(",")
				})
				.join(" ")
			break
	}
	if (node.attributes.transform) {
		node.attributes.transform = node.attributes.transform.replace(/(matrix\([\+\-\d\.]+[\s,]+[\+\-\d\.]+[\s,]+[\+\-\d\.]+[\s,]+[\+\-\d\.]+[\s,]+|translate\()([\+\-\d\.]+)([\s,]+)([\+\-\d\.]+)\)/g, (all: string, prefix: string, tx: string, comma: string, ty: string) => {
			return `${prefix}${+tx * context.scale}${comma}${+ty * context.scale})`
		})
	}
}