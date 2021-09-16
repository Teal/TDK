import { optimize } from "svgo"

/**
 * 压缩优化指定的 `<svg>` 图标
 * @param svg 要优化的 `<svg>` 源码
 * @param removeRoot 是否删除根节点
 */
export function optimizeSVG(svg: string, removeRoot?: boolean): string {
	const result = optimize(svg, {
		full: true,
		plugins: [
			"cleanupAttrs",
			"removeDoctype",
			"removeXMLProcInst",
			"removeComments",
			"removeMetadata",
			"removeTitle",
			"removeDesc",
			"removeUselessDefs",
			"removeEditorsNSData",
			"removeEmptyAttrs",
			"removeHiddenElems",
			"removeEmptyText",
			"removeEmptyContainers",
			"cleanupEnableBackground",
			"convertStyleToAttrs",
			"convertColors",
			"convertPathData",
			"convertTransform",
			"removeUnknownsAndDefaults",
			"removeNonInheritableGroupAttrs",
			"removeUselessStrokeAndFill",
			"removeUnusedNS",
			"cleanupIDs",
			"cleanupNumericValues",
			"moveElemsAttrsToGroup",
			"moveGroupAttrsToElems",
			"collapseGroups",
			"removeRasterImages",
			"mergePaths",
			"convertShapeToPath",
			"convertEllipseToCircle",
			"sortAttrs",
			"removeDimensions",
			{
				name: "removeAttrs",
				params: {
					attrs: ["(stroke|fill)"]
				}
			},
			removeRoot ? {
				name: "cleanRoot",
				type: "full",
				fn(data: any) {
					if (data.children && data.children[0].name === "svg") {
						data.children = data.children[0].children
					} else if (data.content) {
						data.content = data.content[0].content
					}
					return data
				}
			} : {
					name: "cleanRoot",
					type: "perItem",
					fn(item: any) {
						if (
							item.isElem(["svg"]) &&
							!item.hasAttr("viewBox") &&
							item.hasAttr("width") &&
							item.hasAttr("height") &&
							item.attr("width").value.endsWith("px") &&
							item.attr("height").value.endsWith("px")
						) {
							const width = parseFloat(item.attr("width").value.replace(/px$/, ""))
							const height = parseFloat(item.attr("height").value.replace(/px$/, ""))
							item.removeAttr("width")
							item.removeAttr("height")
							item.addAttr({
								name: "viewBox",
								prefix: "",
								local: "viewBox",
								value: "0 0 " + width + " " + height
							})
						}
					}
				}
		]
	})
	return result.data
}