/**
 * 压缩优化指定的 `<svg>` 图标
 * @param svg 要优化的 `<svg>` 源码
 * @param removeRoot 是否删除根节点
 */
export async function optimizeSVG(svg, removeRoot) {
    const svgo = new SVGO({
        full: true,
        plugins: [
            { cleanupAttrs: true },
            { removeDoctype: true },
            { removeXMLProcInst: true },
            { removeComments: true },
            { removeMetadata: true },
            { removeTitle: true },
            { removeDesc: true },
            { removeUselessDefs: true },
            { removeEditorsNSData: true },
            { removeEmptyAttrs: true },
            { removeHiddenElems: true },
            { removeEmptyText: true },
            { removeEmptyContainers: true },
            { cleanupEnableBackground: true },
            { convertStyleToAttrs: true },
            { convertColors: true },
            { convertPathData: true },
            { convertTransform: true },
            { removeUnknownsAndDefaults: true },
            { removeNonInheritableGroupAttrs: true },
            { removeUselessStrokeAndFill: false },
            { removeUnusedNS: true },
            { cleanupIDs: true },
            { cleanupNumericValues: true },
            { moveElemsAttrsToGroup: true },
            { moveGroupAttrsToElems: true },
            { collapseGroups: true },
            { removeRasterImages: false },
            { mergePaths: true },
            { convertShapeToPath: false },
            { convertEllipseToCircle: false },
            { sortAttrs: true },
            { removeDimensions: true },
            { removeAttrs: { attrs: "(stroke|fill)" } },
            {
                cleanRoot: removeRoot ? {
                    type: "full",
                    active: true,
                    fn(data) {
                        data.content = data.content[0].content;
                        return data;
                    }
                } : {
                    type: "perItem",
                    active: false,
                    fn(item) {
                        if (item.isElem(["svg"]) &&
                            !item.hasAttr("viewBox") &&
                            item.hasAttr("width") &&
                            item.hasAttr("height") &&
                            item.attr("width").value.endsWith("px") &&
                            item.attr("height").value.endsWith("px")) {
                            const width = parseFloat(item.attr("width").value.replace(/px$/, ""));
                            const height = parseFloat(item.attr("height").value.replace(/px$/, ""));
                            item.removeAttr("width");
                            item.removeAttr("height");
                            item.addAttr({
                                name: "viewBox",
                                prefix: "",
                                local: "viewBox",
                                value: "0 0 " + width + " " + height
                            });
                        }
                    }
                }
            }
        ]
    });
    const result = await svgo.optimize(svg);
    return result.data;
}
//# sourceMappingURL=svgOptimizor.js.map