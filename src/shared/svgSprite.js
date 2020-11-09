define(["require", "exports", "/tdk/vendors/~/D/App/Node/node_modules/sax/lib/sax.js"], function (require, exports, sax_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseSVGSprite = void 0;
    /**
     * 解析 SVG 图标雪碧图，返回所有图标
     * @param svg 要解析的 `<svg>` 源码
     */
    function parseSVGSprite(svg) {
        const result = Object.create(null);
        const parser = sax_1.parser(true);
        let symbolID = "";
        let symbolSource = "";
        parser.onopentag = (node) => {
            if (node.name === "svg") {
                return;
            }
            if (node.name === "symbol") {
                symbolSource += `<svg`;
                symbolID = node.attributes.id;
                delete node.attributes.id;
                delete node.attributes.alt;
            }
            else {
                symbolSource += `<${node.name}`;
            }
            for (const key in node.attributes) {
                symbolSource += ` ${key}="${String(node.attributes[key]).replace('"', "&quot;")}"`;
            }
            symbolSource += ">";
        };
        parser.onclosetag = (nodeName) => {
            if (nodeName === "svg") {
                return;
            }
            if (nodeName === "symbol") {
                symbolSource += `</svg>`;
                if (symbolID) {
                    result[symbolID] = symbolSource;
                    symbolID = "";
                }
                symbolSource = "";
            }
            else {
                symbolSource += `</${nodeName}>`;
            }
        };
        parser.ontext = (text) => {
            if (text.trimEnd()) {
                symbolSource += text;
            }
        };
        parser.write(svg).close();
        return result;
    }
    exports.parseSVGSprite = parseSVGSprite;
});
//# sourceMappingURL=svgSprite.js.map